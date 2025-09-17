import { PDFDocument, rgb } from 'pdf-lib';
import * as fs from 'fs';

export class DocumentGenerationService {
  
  async fillPDFTemplate(templatePath: string, fieldMappings: Record<string, string>): Promise<Buffer> {
    try {
      // Read the template file
      const templateBytes = fs.readFileSync(templatePath);
      
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
          console.warn(`Could not fill field ${templateField}:`, error.message);
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
      throw new Error(`PDF generation failed: ${error.message}`);
    }
  }

  private async fillPDFWithTextReplacement(templateBytes: Uint8Array, fieldMappings: Record<string, string>): Promise<Buffer> {
    try {
      const pdfDoc = await PDFDocument.load(templateBytes);
      const pages = pdfDoc.getPages();
      
      // This is a simplified approach - in production you'd need more sophisticated text replacement
      // For now, we'll return the original PDF with a note that text replacement needs implementation
      console.warn('Text replacement in PDF not fully implemented - returning original template');
      
      // Add a page with the extracted data for reference
      const dataPage = pdfDoc.addPage();
      const { width, height } = dataPage.getSize();
      
      let yPosition = height - 50;
      dataPage.drawText('Extracted Data:', {
        x: 50,
        y: yPosition,
        size: 16,
        color: rgb(0, 0, 0),
      });
      
      yPosition -= 30;
      
      for (const [field, value] of Object.entries(fieldMappings)) {
        if (yPosition < 50) break; // Prevent overflow
        
        dataPage.drawText(`${field}: ${value}`, {
          x: 50,
          y: yPosition,
          size: 12,
          color: rgb(0, 0, 0),
        });
        yPosition -= 20;
      }
      
      const filledPdfBytes = await pdfDoc.save();
      return Buffer.from(filledPdfBytes);
    } catch (error) {
      console.error('Text replacement failed:', error);
      throw error;
    }
  }
}
