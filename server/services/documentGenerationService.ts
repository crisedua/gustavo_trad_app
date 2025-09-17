import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
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

      // If no form fields, create new PDF from scratch based on template
      if (fields.length === 0) {
        return await this.createFilledPDFFromScratch(fieldMappings);
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

  private async createFilledPDFFromScratch(fieldMappings: Record<string, string>): Promise<Buffer> {
    try {
      console.log('Creating new PDF from scratch with filled data...');
      console.log('Field mappings:', fieldMappings);
      
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]); // Standard letter size
      const { width, height } = page.getSize();
      
      // Embed standard font
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Header Section
      page.drawText('NATIONAL CIVIL REGISTRY', {
        x: width / 2 - 120,
        y: height - 60,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      page.drawText('DIGITAL CIVIL STATUS REGISTRATION', {
        x: width / 2 - 140,
        y: height - 90,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      // Serial Indicator - top right
      if (fieldMappings.serial_indicator) {
        page.drawText(fieldMappings.serial_indicator, {
          x: width - 150,
          y: height - 60,
          size: 12,
          font: font,
          color: rgb(0, 0, 0),
        });
      }
      
      let currentY = height - 150;
      
      // Registry Office Information Section
      page.drawText('Registry Office Information', {
        x: 50,
        y: currentY,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      // Create table-like structure
      currentY -= 30;
      this.drawTableRow(page, font, currentY, [
        { label: 'Country', value: fieldMappings.registry_country || '', x: 50, width: 150 },
        { label: 'Department', value: fieldMappings.registry_department || '', x: 210, width: 150 },
        { label: 'Municipality', value: fieldMappings.registry_municipality || '', x: 370, width: 150 }
      ]);
      
      currentY -= 40;
      this.drawTableRow(page, font, currentY, [
        { label: 'Date of Registration', value: fieldMappings.registry_date_of_registration || '', x: 50, width: 200 },
        { label: 'Office Type', value: fieldMappings.registry_office_type || '', x: 260, width: 150 },
        { label: 'Office Name/Number', value: fieldMappings.registry_office_name || '', x: 420, width: 150 }
      ]);
      
      currentY -= 60;
      
      // Marriage Information Section
      page.drawText('Marriage Information', {
        x: 50,
        y: currentY,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 30;
      this.drawTableRow(page, font, currentY, [
        { label: 'Country', value: fieldMappings.marriage_country || '', x: 50, width: 150 },
        { label: 'Department', value: fieldMappings.marriage_department || '', x: 210, width: 150 },
        { label: 'Municipality', value: fieldMappings.marriage_municipality || '', x: 370, width: 150 }
      ]);
      
      currentY -= 40;
      this.drawTableRow(page, font, currentY, [
        { label: 'Date of Registration', value: fieldMappings.marriage_date_of_registration || '', x: 50, width: 200 },
        { label: 'Marriage Type', value: fieldMappings.marriage_type || '', x: 260, width: 150 }
      ]);
      
      currentY -= 60;
      
      // Party to the Marriage — A
      page.drawText('Party to the Marriage — A', {
        x: 50,
        y: currentY,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 30;
      this.drawTableRow(page, font, currentY, [
        { label: 'Names', value: fieldMappings.party_a_names || '', x: 50, width: 200 },
        { label: 'Surnames', value: fieldMappings.party_a_surnames || '', x: 260, width: 200 }
      ]);
      
      currentY -= 40;
      this.drawTableRow(page, font, currentY, [
        { label: 'Document Type', value: fieldMappings.party_a_document_type || '', x: 50, width: 200 },
        { label: 'Document Number', value: fieldMappings.party_a_document_number || '', x: 260, width: 200 }
      ]);
      
      currentY -= 60;
      
      // Party to the Marriage — B
      page.drawText('Party to the Marriage — B', {
        x: 50,
        y: currentY,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 30;
      this.drawTableRow(page, font, currentY, [
        { label: 'Names', value: fieldMappings.party_b_names || '', x: 50, width: 200 },
        { label: 'Surnames', value: fieldMappings.party_b_surnames || '', x: 260, width: 200 }
      ]);
      
      currentY -= 40;
      this.drawTableRow(page, font, currentY, [
        { label: 'Document Type', value: fieldMappings.party_b_document_type || '', x: 50, width: 200 },
        { label: 'Document Number', value: fieldMappings.party_b_document_number || '', x: 260, width: 200 }
      ]);
      
      currentY -= 60;
      
      // Date of Issue
      page.drawText('Date of Issue', {
        x: 50,
        y: currentY,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 30;
      this.drawTableRow(page, font, currentY, [
        { label: 'Day', value: fieldMappings.issue_day || '', x: 50, width: 80 },
        { label: 'Month', value: fieldMappings.issue_month || '', x: 140, width: 80 },
        { label: 'Year', value: fieldMappings.issue_year || '', x: 230, width: 80 }
      ]);
      
      currentY -= 60;
      
      // Authorized Signature
      page.drawText('Authorized Signature', {
        x: 50,
        y: currentY,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 30;
      this.drawTableRow(page, font, currentY, [
        { label: 'Name', value: fieldMappings.authorized_name || '', x: 50, width: 250 },
        { label: 'Title', value: fieldMappings.authorized_title || '', x: 310, width: 250 }
      ]);
      
      console.log(`Successfully created filled PDF with ${Object.keys(fieldMappings).length} fields`);
      
      // Save the PDF
      const filledPdfBytes = await pdfDoc.save();
      return Buffer.from(filledPdfBytes);
      
    } catch (error) {
      console.error('PDF creation from scratch failed:', error);
      throw error;
    }
  }

  private drawTableRow(page: any, font: any, y: number, fields: Array<{label: string, value: string, x: number, width: number}>) {
    for (const field of fields) {
      // Draw border
      page.drawRectangle({
        x: field.x,
        y: y - 15,
        width: field.width,
        height: 25,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
      
      // Draw label (smaller, top part)
      page.drawText(field.label, {
        x: field.x + 5,
        y: y + 5,
        size: 9,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      // Draw value (larger, bottom part)
      page.drawText(field.value, {
        x: field.x + 5,
        y: y - 8,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
        maxWidth: field.width - 10,
      });
    }
  }
}