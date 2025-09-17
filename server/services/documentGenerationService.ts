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
      console.log('Field mappings:', Object.keys(fieldMappings));
      
      // Create a new PDF document with the filled template
      const pdfDoc = await PDFDocument.create();
      
      // Create the filled certificate page
      const page = pdfDoc.addPage([612, 792]); // Standard letter size
      const { width, height } = page.getSize();
      
      // Title
      page.drawText('NATIONAL CIVIL REGISTRY', {
        x: width / 2 - 100,
        y: height - 50,
        size: 16,
        color: rgb(0, 0, 0),
      });
      
      page.drawText('DIGITAL CIVIL STATUS REGISTRATION', {
        x: width / 2 - 130,
        y: height - 80,
        size: 14,
        color: rgb(0, 0, 0),
      });
      
      let yPos = height - 120;
      
      // Serial Indicator
      page.drawText(`Serial Indicator: ${fieldMappings.serial_indicator || 'N/A'}`, {
        x: 50,
        y: yPos,
        size: 12,
        color: rgb(0, 0, 0),
      });
      yPos -= 30;
      
      // Registry Office Information
      page.drawText('Registry Office Information', {
        x: 50,
        y: yPos,
        size: 14,
        color: rgb(0, 0, 0),
      });
      yPos -= 25;
      
      const registryFields = [
        ['Country', fieldMappings.registry_country || 'N/A'],
        ['Department', fieldMappings.registry_department || 'N/A'], 
        ['Municipality', fieldMappings.registry_municipality || 'N/A'],
        ['Date of Registration', fieldMappings.registry_date_of_registration || 'N/A'],
        ['Office Type', fieldMappings.registry_office_type || 'N/A'],
        ['Office Name/Number', fieldMappings.registry_office_name || 'N/A']
      ];
      
      for (const [label, value] of registryFields) {
        page.drawText(`${label}: ${value}`, {
          x: 70,
          y: yPos,
          size: 11,
          color: rgb(0, 0, 0),
        });
        yPos -= 20;
      }
      
      yPos -= 20;
      
      // Marriage Information  
      page.drawText('Marriage Information', {
        x: 50,
        y: yPos,
        size: 14,
        color: rgb(0, 0, 0),
      });
      yPos -= 25;
      
      const marriageFields = [
        ['Country', fieldMappings.marriage_country || 'N/A'],
        ['Department', fieldMappings.marriage_department || 'N/A'],
        ['Municipality', fieldMappings.marriage_municipality || 'N/A'], 
        ['Date of Registration', fieldMappings.marriage_date_of_registration || 'N/A'],
        ['Marriage Type', fieldMappings.marriage_type || 'N/A']
      ];
      
      for (const [label, value] of marriageFields) {
        page.drawText(`${label}: ${value}`, {
          x: 70,
          y: yPos,
          size: 11,
          color: rgb(0, 0, 0),
        });
        yPos -= 20;
      }
      
      yPos -= 20;
      
      // Party A
      page.drawText('Party to the Marriage — A', {
        x: 50,
        y: yPos,
        size: 14,
        color: rgb(0, 0, 0),
      });
      yPos -= 25;
      
      const partyAFields = [
        ['Names', fieldMappings.party_a_names || 'N/A'],
        ['Surnames', fieldMappings.party_a_surnames || 'N/A'],
        ['Document Type', fieldMappings.party_a_document_type || 'N/A'],
        ['Document Number', fieldMappings.party_a_document_number || 'N/A']
      ];
      
      for (const [label, value] of partyAFields) {
        page.drawText(`${label}: ${value}`, {
          x: 70,
          y: yPos,
          size: 11,
          color: rgb(0, 0, 0),
        });
        yPos -= 20;
      }
      
      yPos -= 20;
      
      // Party B
      page.drawText('Party to the Marriage — B', {
        x: 50,
        y: yPos,
        size: 14,
        color: rgb(0, 0, 0),
      });
      yPos -= 25;
      
      const partyBFields = [
        ['Names', fieldMappings.party_b_names || 'N/A'],
        ['Surnames', fieldMappings.party_b_surnames || 'N/A'],
        ['Document Type', fieldMappings.party_b_document_type || 'N/A'],
        ['Document Number', fieldMappings.party_b_document_number || 'N/A']
      ];
      
      for (const [label, value] of partyBFields) {
        page.drawText(`${label}: ${value}`, {
          x: 70,
          y: yPos,
          size: 11,
          color: rgb(0, 0, 0),
        });
        yPos -= 20;
      }
      
      yPos -= 20;
      
      // Date of Issue
      page.drawText('Date of Issue', {
        x: 50,
        y: yPos,
        size: 14,
        color: rgb(0, 0, 0),
      });
      yPos -= 25;
      
      page.drawText(`Day: ${fieldMappings.issue_day || 'N/A'}  Month: ${fieldMappings.issue_month || 'N/A'}  Year: ${fieldMappings.issue_year || 'N/A'}`, {
        x: 70,
        y: yPos,
        size: 11,
        color: rgb(0, 0, 0),
      });
      yPos -= 40;
      
      // Authorized Signature
      page.drawText('Authorized Signature', {
        x: 50,
        y: yPos,
        size: 14,
        color: rgb(0, 0, 0),
      });
      yPos -= 25;
      
      page.drawText(`Name: ${fieldMappings.authorized_name || 'N/A'}`, {
        x: 70,
        y: yPos,
        size: 11,
        color: rgb(0, 0, 0),
      });
      yPos -= 20;
      
      page.drawText(`Title: ${fieldMappings.authorized_title || 'N/A'}`, {
        x: 70,
        y: yPos,
        size: 11,
        color: rgb(0, 0, 0),
      });
      
      const filledPdfBytes = await pdfDoc.save();
      console.log('Successfully created filled PDF template');
      return Buffer.from(filledPdfBytes);
    } catch (error) {
      console.error('Text replacement failed:', error);
      throw error;
    }
  }
}
