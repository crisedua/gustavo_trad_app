import { PDFDocument, PDFForm, PDFTextField, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Configure pdfjs-dist for server-side usage  
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = join(__dirname, '../../node_modules/pdfjs-dist/build/pdf.worker.js');
} catch (error) {
  console.warn('Could not set pdfjs worker source:', error);
}

interface PlaceholderField {
  name: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

export class DocumentGenerationService {
  async fillPDFTemplate(templatePath: string, fieldMappings: Record<string, string>): Promise<Buffer> {
    try {
      // Resolve the template path - if it starts with '/' but isn't a system path, treat it as relative
      let resolvedPath = templatePath;
      if (templatePath.startsWith('/') && !templatePath.startsWith('/home') && !templatePath.startsWith('/usr')) {
        // Remove leading slash and resolve from project root
        resolvedPath = path.join(process.cwd(), templatePath.substring(1));
      }
      
      console.log(`Reading template from: ${resolvedPath}`);
      
      // Read the template file
      const templateBytes = fs.readFileSync(resolvedPath);
      
      // Load the PDF
      const pdfDoc = await PDFDocument.load(templateBytes);
      
      // Get the form
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      console.log(`Found ${fields.length} form fields in template`);
      
      // If we have form fields, fill them directly
      if (fields.length > 0) {
        console.log('Using existing form fields...');
        
        for (const [templateField, value] of Object.entries(fieldMappings)) {
          try {
            const field = form.getTextField(templateField);
            if (field) {
              field.setText(value);
              console.log(`Filled form field ${templateField} with: ${value}`);
            }
          } catch (error) {
            console.warn(`Could not fill field ${templateField}:`, error instanceof Error ? error.message : String(error));
          }
        }
        
        // Flatten the form to merge field values into the page content
        form.flatten();
        const filledPdfBytes = await pdfDoc.save();
        return Buffer.from(filledPdfBytes);
      }
      
      // No form fields - convert template to have form fields, then fill
      console.log('No form fields found, converting placeholders to form fields...');
      return await this.convertPlaceholdersAndFill(templateBytes, fieldMappings);
      
    } catch (error) {
      console.error('PDF template filling failed:', error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async convertPlaceholdersAndFill(templateBytes: Uint8Array, fieldMappings: Record<string, string>): Promise<Buffer> {
    try {
      console.log('Converting placeholders to form fields and filling...');
      
      // Step 1: Find placeholder locations in the original template
      const placeholderFields = await this.detectPlaceholderFields(templateBytes);
      console.log(`Detected ${placeholderFields.length} placeholder fields`);
      
      // Step 2: Create form fields at placeholder positions
      const pdfDocWithFields = await this.addFormFieldsToTemplate(templateBytes, placeholderFields);
      
      // Step 3: Fill the form fields with extracted data
      const form = pdfDocWithFields.getForm();
      
      for (const placeholder of placeholderFields) {
        const value = fieldMappings[placeholder.name];
        if (value) {
          try {
            const field = form.getTextField(placeholder.name);
            field.setText(value);
            console.log(`Filled field ${placeholder.name} with: ${value}`);
          } catch (error) {
            console.warn(`Could not fill converted field ${placeholder.name}:`, error instanceof Error ? error.message : String(error));
          }
        }
      }
      
      // Step 4: Flatten to merge field values into page content
      form.flatten();
      
      const filledPdfBytes = await pdfDocWithFields.save();
      console.log('Successfully converted placeholders and filled form fields');
      
      return Buffer.from(filledPdfBytes);
      
    } catch (error) {
      console.error('Placeholder conversion and filling failed:', error);
      throw error;
    }
  }

  private async detectPlaceholderFields(pdfBytes: Uint8Array): Promise<PlaceholderField[]> {
    try {
      // Load PDF with pdfjs-dist to extract text positions
      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
      const pdfDocument = await loadingTask.promise;
      
      const placeholderFields: PlaceholderField[] = [];
      const placeholderRegex = /\{\{([^}]+)\}\}/g;
      
      // Process each page
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        
        // Group text items that might be part of the same placeholder
        const textItems = textContent.items.filter(item => 'str' in item);
        
        for (let i = 0; i < textItems.length; i++) {
          const item = textItems[i] as any;
          let combinedText = item.str;
          let startX = item.transform[4];
          let y = item.transform[5];
          let width = item.width || 0;
          let height = item.height || 12;
          let fontSize = Math.abs(item.transform[0]) || 10;
          
          // Check if we need to combine with next items to form complete placeholder
          let j = i + 1;
          while (j < textItems.length && !combinedText.includes('}}') && combinedText.includes('{{')) {
            const nextItem = textItems[j] as any;
            // Check if next item is on same line (similar Y coordinate)
            if (Math.abs(nextItem.transform[5] - y) < 5) {
              combinedText += nextItem.str;
              width += nextItem.width || 0;
              j++;
            } else {
              break;
            }
          }
          
          // Extract placeholders from combined text
          let match;
          placeholderRegex.lastIndex = 0; // Reset regex
          
          while ((match = placeholderRegex.exec(combinedText)) !== null) {
            const fieldName = match[1];
            
            // Convert PDF coordinates to pdf-lib coordinates (flip Y)
            const pdfLibY = viewport.height - y - height;
            
            placeholderFields.push({
              name: fieldName,
              page: pageNum - 1, // pdf-lib uses 0-based page indexing
              x: startX,
              y: pdfLibY,
              width: Math.max(width, 100), // Ensure minimum width
              height: height,
              fontSize: Math.max(fontSize, 8), // Ensure minimum font size
            });
          }
          
          // Skip the items we combined
          i = j - 1;
        }
      }
      
      await pdfDocument.destroy();
      return placeholderFields;
      
    } catch (error) {
      console.error('Failed to detect placeholder fields:', error);
      return [];
    }
  }

  private async addFormFieldsToTemplate(templateBytes: Uint8Array, placeholderFields: PlaceholderField[]): Promise<PDFDocument> {
    try {
      // Load the original template
      const pdfDoc = await PDFDocument.load(templateBytes);
      const form = pdfDoc.getForm();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      // Add form fields at placeholder positions
      for (const placeholder of placeholderFields) {
        const pages = pdfDoc.getPages();
        if (pages[placeholder.page]) {
          const page = pages[placeholder.page];
          
          // First, cover the placeholder text with a white rectangle
          page.drawRectangle({
            x: placeholder.x - 1,
            y: placeholder.y - 1,
            width: placeholder.width + 2,
            height: placeholder.height + 2,
            color: rgb(1, 1, 1), // White background to cover placeholder
          });
          
          // Create text field at the placeholder position
          const textField = form.createTextField(placeholder.name);
          textField.addToPage(page, {
            x: placeholder.x,
            y: placeholder.y,
            width: placeholder.width,
            height: placeholder.height,
          });
          
          // Set field appearance
          textField.setFontSize(placeholder.fontSize);
          textField.updateAppearances(font);
          
          console.log(`Added form field ${placeholder.name} at page ${placeholder.page}, position (${placeholder.x}, ${placeholder.y})`);
        }
      }
      
      return pdfDoc;
      
    } catch (error) {
      console.error('Failed to add form fields to template:', error);
      throw error;
    }
  }
}