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
      
      // No form fields - create new PDF from scratch matching the original template layout
      console.log('No form fields found, creating PDF from zero based on template layout...');
      return await this.createPDFFromZero(fieldMappings);
      
    } catch (error) {
      console.error('PDF template filling failed:', error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createPDFFromZero(fieldMappings: Record<string, string>): Promise<Buffer> {
    try {
      console.log('Creating PDF from zero based on original template layout...');
      console.log('Using extracted data:', fieldMappings);
      
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]); // Standard letter size
      const { width, height } = page.getSize();
      
      // Embed fonts
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // Header section - logos and main title
      page.drawText('/logo: /coat of arms/ - National Civil Registry/', {
        x: 50,
        y: height - 45,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      page.drawText('/coat of arms/', {
        x: width / 2 - 50,
        y: height - 45,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      page.drawText('/QR code/ {{qr_code}}', {
        x: width - 150,
        y: height - 45,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      // Main title
      page.drawText('NATIONAL', {
        x: width / 2 - 40,
        y: height - 100,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      page.drawText('CIVIL REGISTRY', {
        x: width / 2 - 65,
        y: height - 120,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      page.drawText('DIGITAL CIVIL STATUS REGISTRATION', {
        x: width / 2 - 130,
        y: height - 150,
        size: 14,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      // Serial Indicator
      page.drawText(`Serial Indicator: ${fieldMappings.serial_indicator || 'N/A'}`, {
        x: 50,
        y: height - 185,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      let currentY = height - 220;
      
      // Registry Office Information section
      page.drawText('Registry Office Information', {
        x: 50,
        y: currentY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 25;
      
      // First row: Country, Department, Municipality, Date of Registration
      this.drawLabelValuePair(page, font, 50, currentY, 'Country', fieldMappings.registry_country || 'N/A');
      this.drawLabelValuePair(page, font, 180, currentY, 'Department', fieldMappings.registry_department || 'N/A');  
      this.drawLabelValuePair(page, font, 320, currentY, 'Municipality', fieldMappings.registry_municipality || 'N/A');
      this.drawLabelValuePair(page, font, 460, currentY, 'Date of Registration', fieldMappings.registry_date_of_registration || 'N/A');
      
      currentY -= 35;
      
      // Second row: Office Type / Office Name/Number
      page.drawText('Office Type / Office Name/Number', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      page.drawText(`${fieldMappings.registry_office_type || 'N/A'} - ${fieldMappings.registry_office_name || 'N/A'}`, {
        x: 50,
        y: currentY - 15,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 60;
      
      // Marriage Information section
      page.drawText('Marriage Information', {
        x: 50,
        y: currentY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 25;
      
      // Marriage info row: Country, Department, Municipality, Date of Registration
      this.drawLabelValuePair(page, font, 50, currentY, 'Country', fieldMappings.marriage_country || 'N/A');
      this.drawLabelValuePair(page, font, 180, currentY, 'Department', fieldMappings.marriage_department || 'N/A');
      this.drawLabelValuePair(page, font, 320, currentY, 'Municipality', fieldMappings.marriage_municipality || 'N/A');
      this.drawLabelValuePair(page, font, 460, currentY, 'Date of Registration', fieldMappings.marriage_date_of_registration || 'N/A');
      
      currentY -= 35;
      
      // Marriage Type
      this.drawLabelValuePair(page, font, 50, currentY, 'Marriage Type', fieldMappings.marriage_type || 'N/A');
      
      currentY -= 50;
      
      // Party to the Marriage — A
      page.drawText('Party to the Marriage — A', {
        x: 50,
        y: currentY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 25;
      
      // Party A: Names and Surnames
      this.drawLabelValuePair(page, font, 50, currentY, 'Names', fieldMappings.party_a_names || 'N/A');
      this.drawLabelValuePair(page, font, 320, currentY, 'Surnames', fieldMappings.party_a_surnames || 'N/A');
      
      currentY -= 35;
      
      // Party A: Document Type and Number
      this.drawLabelValuePair(page, font, 50, currentY, 'Document Type', fieldMappings.party_a_document_type || 'N/A');
      this.drawLabelValuePair(page, font, 320, currentY, 'Document Number', fieldMappings.party_a_document_number || 'N/A');
      
      currentY -= 50;
      
      // Party to the Marriage — B
      page.drawText('Party to the Marriage — B', {
        x: 50,
        y: currentY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 25;
      
      // Party B: Names and Surnames
      this.drawLabelValuePair(page, font, 50, currentY, 'Names', fieldMappings.party_b_names || 'N/A');
      this.drawLabelValuePair(page, font, 320, currentY, 'Surnames', fieldMappings.party_b_surnames || 'N/A');
      
      currentY -= 35;
      
      // Party B: Document Type and Number
      this.drawLabelValuePair(page, font, 50, currentY, 'Document Type', fieldMappings.party_b_document_type || 'N/A');
      this.drawLabelValuePair(page, font, 320, currentY, 'Document Number', fieldMappings.party_b_document_number || 'N/A');
      
      currentY -= 50;
      
      // Date of Issue section
      page.drawText('Date of Issue', {
        x: 50,
        y: currentY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 25;
      
      // Date fields
      this.drawLabelValuePair(page, font, 50, currentY, 'Day', fieldMappings.issue_day || 'N/A');
      this.drawLabelValuePair(page, font, 150, currentY, 'Month', fieldMappings.issue_month || 'N/A');
      this.drawLabelValuePair(page, font, 250, currentY, 'Year', fieldMappings.issue_year || 'N/A');
      
      currentY -= 50;
      
      // Authorized Signature section
      page.drawText('Authorized Signature', {
        x: 50,
        y: currentY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      currentY -= 25;
      
      // Signature fields
      this.drawLabelValuePair(page, font, 50, currentY, 'Name', fieldMappings.authorized_name || 'N/A');
      
      currentY -= 35;
      
      this.drawLabelValuePair(page, font, 50, currentY, 'Title', fieldMappings.authorized_title || 'N/A');
      
      console.log('Successfully created PDF from zero with all extracted data');
      
      // Save the PDF
      const filledPdfBytes = await pdfDoc.save();
      return Buffer.from(filledPdfBytes);
      
    } catch (error) {
      console.error('PDF creation from zero failed:', error);
      throw error;
    }
  }
  
  private drawLabelValuePair(page: any, font: any, x: number, y: number, label: string, value: string) {
    // Draw label
    page.drawText(label, {
      x: x,
      y: y,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Draw value below label
    page.drawText(value, {
      x: x,
      y: y - 15,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
  }
}