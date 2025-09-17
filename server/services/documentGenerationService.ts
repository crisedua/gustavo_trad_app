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
      
      // Create a new PDF document that preserves the template
      const pdfDoc = await PDFDocument.create();
      
      // Copy pages from template to preserve layout
      const templatePages = templateDoc.getPages();
      const copiedPages = await pdfDoc.copyPages(templateDoc, Array.from({length: templatePages.length}, (_, i) => i));
      
      copiedPages.forEach(page => {
        pdfDoc.addPage(page);
      });
      
      // Now overlay the extracted data on top of placeholders
      const pages = pdfDoc.getPages();
      
      if (pages.length > 0) {
        const page = pages[0];
        const { height } = page.getSize();
        
        // Based on the template image, map placeholders to more accurate coordinates
        // PDF coordinates start from bottom-left, so we need to convert from top-left
        const fieldPositions: Record<string, {x: number, y: number, size: number, width?: number}> = {
          // Top section - Serial indicator and QR code
          'serial_indicator': { x: 470, y: height - 55, size: 10, width: 80 },
          
          // Registry Office Information section  
          'registry_country': { x: 120, y: height - 260, size: 9, width: 100 },
          'registry_department': { x: 360, y: height - 260, size: 9, width: 120 },
          'registry_municipality': { x: 515, y: height - 260, size: 9, width: 100 },
          'registry_date_of_registration': { x: 470, y: height - 285, size: 9, width: 100 },
          'registry_office_type': { x: 215, y: height - 305, size: 9, width: 100 },
          'registry_office_name': { x: 360, y: height - 305, size: 9, width: 150 },
          
          // Marriage Information section
          'marriage_country': { x: 120, y: height - 375, size: 9, width: 100 },
          'marriage_department': { x: 360, y: height - 375, size: 9, width: 120 },
          'marriage_municipality': { x: 515, y: height - 375, size: 9, width: 100 },
          'marriage_date_of_registration': { x: 470, y: height - 400, size: 9, width: 100 },
          'marriage_type': { x: 215, y: height - 420, size: 9, width: 100 },
          
          // Party A section
          'party_a_names': { x: 120, y: height - 465, size: 9, width: 200 },
          'party_a_surnames': { x: 380, y: height - 465, size: 9, width: 200 },
          'party_a_document_type': { x: 170, y: height - 495, size: 9, width: 150 },
          'party_a_document_number': { x: 425, y: height - 495, size: 9, width: 100 },
          
          // Party B section
          'party_b_names': { x: 120, y: height - 540, size: 9, width: 200 },
          'party_b_surnames': { x: 380, y: height - 540, size: 9, width: 200 },
          'party_b_document_type': { x: 170, y: height - 570, size: 9, width: 150 },
          'party_b_document_number': { x: 425, y: height - 570, size: 9, width: 100 },
          
          // Date of Issue section
          'issue_day': { x: 120, y: height - 620, size: 9, width: 30 },
          'issue_month': { x: 250, y: height - 620, size: 9, width: 30 },
          'issue_year': { x: 390, y: height - 620, size: 9, width: 50 },
          
          // Authorized Signature section
          'authorized_name': { x: 150, y: height - 670, size: 9, width: 200 },
          'authorized_title': { x: 150, y: height - 690, size: 9, width: 200 }
        };
        
        // Replace placeholders with extracted data
        for (const [fieldName, value] of Object.entries(fieldMappings)) {
          const position = fieldPositions[fieldName];
          if (position && value) {
            // Draw a white rectangle to cover the placeholder
            page.drawRectangle({
              x: position.x - 5,
              y: position.y - 3,
              width: position.width || 150,
              height: 16,
              color: rgb(1, 1, 1), // White color to cover placeholder
            });
            
            // Draw the replacement text
            page.drawText(String(value), {
              x: position.x,
              y: position.y,
              size: position.size,
              color: rgb(0, 0, 0), // Black text
              maxWidth: position.width || 150,
            });
          }
        }
        
        console.log(`Successfully placed ${Object.keys(fieldMappings).length} field values on template`);
      }
      
      // Save the filled PDF
      const filledPdfBytes = await pdfDoc.save();
      return Buffer.from(filledPdfBytes);
      
    } catch (error) {
      console.error('Text replacement failed:', error);
      throw error;
    }
  }
}