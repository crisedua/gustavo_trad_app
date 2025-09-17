import { PDFDocument, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

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

      // If no form fields, try text replacement approach
      if (fields.length === 0) {
        return await this.fillPDFWithTextReplacement(templateBytes, fieldMappings);
      }

      // Flatten the form (make fields non-editable)
      form.flatten();
      
      // Save the PDF
      const filledPdfBytes = await pdfDoc.save();
      return Buffer.from(filledPdfBytes);
    } catch (error) {
      console.error('PDF template filling failed:', error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async fillPDFWithTextReplacement(templateBytes: Uint8Array, fieldMappings: Record<string, string>): Promise<Buffer> {
    try {
      console.log('Implementing text-based template filling...');
      console.log('Field mappings:', fieldMappings);
      
      // Load the original template
      const templateDoc = await PDFDocument.load(templateBytes);
      
      // Extract text content from the template
      let templateText = '';
      try {
        const pages = templateDoc.getPages();
        
        // For now, we'll handle this by creating a new document based on the template structure
        // and replace placeholders. This is a simplified approach that preserves the layout concept
        templateText = await this.extractTextFromPDF(templateBytes);
        console.log('Extracted template text:', templateText);
      } catch (error) {
        console.warn('Could not extract text from template, using fallback approach');
      }
      
      // Replace placeholders in the template text
      let filledText = templateText;
      for (const [fieldName, value] of Object.entries(fieldMappings)) {
        // Replace both {{field_name}} and {field_name} patterns
        const placeholderPatterns = [
          new RegExp(`\\{\\{${fieldName}\\}\\}`, 'gi'),
          new RegExp(`\\{${fieldName}\\}`, 'gi')
        ];
        
        for (const pattern of placeholderPatterns) {
          filledText = filledText.replace(pattern, value || 'N/A');
        }
      }
      
      // Create a new PDF with the filled content
      return await this.createFilledPDF(templateDoc, fieldMappings);
      
    } catch (error) {
      console.error('Text replacement failed:', error);
      throw error;
    }
  }

  private async extractTextFromPDF(pdfBytes: Uint8Array): Promise<string> {
    // This is a simplified text extraction
    // In a production environment, you might want to use a more sophisticated PDF text extraction library
    try {
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      let text = '';
      
      // For this implementation, we'll return a placeholder that represents the template structure
      // This would need to be enhanced with actual PDF text extraction capabilities
      return text;
    } catch (error) {
      console.warn('Text extraction failed:', error);
      return '';
    }
  }

  private async createFilledPDF(templateDoc: PDFDocument, fieldMappings: Record<string, string>): Promise<Buffer> {
    try {
      // Create a new PDF document that mimics the template structure
      const pdfDoc = await PDFDocument.create();
      
      // Copy pages from template to preserve layout
      const templatePages = templateDoc.getPages();
      const copiedPages = await pdfDoc.copyPages(templateDoc, Array.from({length: templatePages.length}, (_, i) => i));
      
      copiedPages.forEach(page => {
        pdfDoc.addPage(page);
      });
      
      // Now we need to overlay text on the copied pages to replace placeholders
      const pages = pdfDoc.getPages();
      
      if (pages.length > 0) {
        const page = pages[0];
        
        // Define positions for different fields based on the template structure
        const fieldPositions: Record<string, {x: number, y: number, size: number}> = {
          'serial_indicator': { x: 350, y: 730, size: 10 },
          'qr_code': { x: 500, y: 730, size: 10 },
          'registry_country': { x: 106, y: 642, size: 10 },
          'registry_department': { x: 347, y: 642, size: 10 },
          'registry_municipality': { x: 573, y: 642, size: 10 },
          'registry_date_of_registration': { x: 830, y: 642, size: 10 },
          'registry_office_type': { x: 480, y: 611, size: 10 },
          'marriage_country': { x: 112, y: 527, size: 10 },
          'marriage_department': { x: 353, y: 527, size: 10 },
          'marriage_municipality': { x: 579, y: 527, size: 10 },
          'marriage_date_of_registration': { x: 836, y: 527, size: 10 },
          'marriage_type': { x: 480, y: 496, size: 10 },
          'party_a_names': { x: 104, y: 437, size: 10 },
          'party_a_surnames': { x: 566, y: 437, size: 10 },
          'party_a_document_type': { x: 138, y: 406, size: 10 },
          'party_a_document_number': { x: 601, y: 406, size: 10 },
          'party_b_names': { x: 104, y: 362, size: 10 },
          'party_b_surnames': { x: 566, y: 362, size: 10 },
          'party_b_document_type': { x: 138, y: 331, size: 10 },
          'party_b_document_number': { x: 601, y: 331, size: 10 }
        };
        
        // Draw field values at their designated positions
        for (const [fieldName, value] of Object.entries(fieldMappings)) {
          const position = fieldPositions[fieldName];
          if (position && value) {
            // Draw white rectangle to cover placeholder text
            page.drawRectangle({
              x: position.x - 2,
              y: position.y - 2,
              width: 150,
              height: 14,
              color: rgb(1, 1, 1), // White color to cover existing text
            });
            
            // Draw the actual value
            page.drawText(value, {
              x: position.x,
              y: position.y,
              size: position.size,
              color: rgb(0, 0, 0), // Black text
            });
          }
        }
      }
      
      // Save the PDF
      const filledPdfBytes = await pdfDoc.save();
      return Buffer.from(filledPdfBytes);
    } catch (error) {
      console.error('Text replacement failed:', error);
      throw error;
    }
  }
}
