import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import * as pdfjsLib from 'pdfjs-dist';

// Configure pdfjs-dist for server-side usage
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/build/pdf.worker.js');

interface PlaceholderLocation {
  text: string;
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
      
      // Fill form fields if they exist
      const fields = form.getFields();
      
      for (const [templateField, value] of Object.entries(fieldMappings)) {
        try {
          // Try to find and fill the field
          const field = form.getTextField(templateField);
          if (field) {
            field.setText(value);
          }
        } catch (error) {
          // Field might not exist or might be different type, continue
          console.warn(`Could not fill field ${templateField}:`, error instanceof Error ? error.message : String(error));
        }
      }

      // If we have form fields, use them and flatten
      if (fields.length > 0) {
        form.flatten();
        const filledPdfBytes = await pdfDoc.save();
        return Buffer.from(filledPdfBytes);
      }

      // No form fields - use placeholder overlay approach to preserve original template
      console.log('No form fields found, using placeholder overlay approach...');
      return await this.overlayPlaceholdersOnOriginalTemplate(templateBytes, fieldMappings);
      
    } catch (error) {
      console.error('PDF template filling failed:', error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async overlayPlaceholdersOnOriginalTemplate(templateBytes: Uint8Array, fieldMappings: Record<string, string>): Promise<Buffer> {
    try {
      console.log('Overlaying data on original template to preserve exact format...');
      
      // Step 1: Extract placeholder positions from the original template
      const placeholderLocations = await this.findPlaceholderLocations(templateBytes);
      console.log(`Found ${placeholderLocations.length} placeholder locations`);
      
      // Step 2: Load the original PDF with pdf-lib to preserve layout
      const pdfDoc = await PDFDocument.load(templateBytes);
      const pages = pdfDoc.getPages();
      
      // Step 3: Overlay replacement text at exact placeholder positions
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      for (const location of placeholderLocations) {
        // Extract field name from placeholder (remove {{ and }})
        const fieldName = location.text.replace(/[\{\}]/g, '');
        const replacementValue = fieldMappings[fieldName];
        
        if (replacementValue && pages[location.page]) {
          const page = pages[location.page];
          
          // Draw white rectangle to cover the placeholder
          page.drawRectangle({
            x: location.x - 2,
            y: location.y - 2,
            width: location.width + 4,
            height: location.height + 4,
            color: rgb(1, 1, 1), // White background
          });
          
          // Draw the replacement text at the exact position
          page.drawText(replacementValue, {
            x: location.x,
            y: location.y,
            size: location.fontSize,
            font: font,
            color: rgb(0, 0, 0),
            maxWidth: location.width,
          });
          
          console.log(`Replaced ${fieldName} with "${replacementValue}" at page ${location.page}`);
        }
      }
      
      // Step 4: Save the PDF with overlaid text
      const filledPdfBytes = await pdfDoc.save();
      console.log('Successfully preserved original template format with overlaid data');
      
      return Buffer.from(filledPdfBytes);
      
    } catch (error) {
      console.error('Placeholder overlay failed:', error);
      throw error;
    }
  }

  private async findPlaceholderLocations(pdfBytes: Uint8Array): Promise<PlaceholderLocation[]> {
    try {
      // Load PDF with pdfjs-dist to extract text positions
      const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
      const pdfDocument = await loadingTask.promise;
      
      const placeholderLocations: PlaceholderLocation[] = [];
      const placeholderRegex = /\{\{[^}]+\}\}/g;
      
      // Process each page
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1.0 });
        
        // Extract text items with positions
        for (const item of textContent.items) {
          if ('str' in item) {
            const text = item.str;
            
            // Check if this text contains placeholders
            const matches = text.match(placeholderRegex);
            if (matches) {
              for (const match of matches) {
                // Convert PDF coordinates to pdf-lib coordinates
                const transform = item.transform;
                const x = transform[4];
                const y = viewport.height - transform[5]; // Flip Y coordinate for pdf-lib
                
                placeholderLocations.push({
                  text: match,
                  page: pageNum - 1, // pdf-lib uses 0-based page indexing
                  x: x,
                  y: y,
                  width: item.width || 100, // Fallback width
                  height: item.height || 12, // Fallback height
                  fontSize: Math.abs(transform[0]) || 10, // Extract font size from transform
                });
              }
            }
          }
        }
      }
      
      await pdfDocument.destroy();
      return placeholderLocations;
      
    } catch (error) {
      console.error('Failed to find placeholder locations:', error);
      return [];
    }
  }
}