import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import type { Template, TemplateFieldMappings } from '@shared/schema';
import { HTMLTemplateService } from './htmlTemplateService';

export class DocumentGenerationService {
  private htmlTemplateService: HTMLTemplateService;
  
  constructor() {
    this.htmlTemplateService = new HTMLTemplateService();
  }

  // Intelligent field mapping - maps extracted data to discovered PDF form fields
  private createIntelligentFieldMappings(formFieldNames: string[], extractedFieldValues: Record<string, string>): Record<string, string> {
    const mappings: Record<string, string> = {};
    
    console.log(`🎯 Mapping ${Object.keys(extractedFieldValues).length} extracted values to ${formFieldNames.length} form fields`);
    console.log('Form fields found:', formFieldNames);
    
    // Create comprehensive mapping patterns
    const mappingPatterns = [
      // Direct exact matches
      { pattern: /^YEAR$/i, value: extractedFieldValues.year || '2023' },
      { pattern: /^FIRSTSURNAME$/i, value: extractedFieldValues.first_surname || '' },
      { pattern: /^SECONDSURNAME$/i, value: extractedFieldValues.second_surname || '' },
      { pattern: /^FIRST\s*NAME$/i, value: extractedFieldValues.first_name || '' },
      { pattern: /^FIRST$/i, value: extractedFieldValues.first_name || '' },
      { pattern: /^OTHER\s*NAMES?$/i, value: extractedFieldValues.other_names || '' },
      
      // Tax identification patterns
      { pattern: /^(NIT|TAX_?ID|IDENTIFICATION)$/i, value: extractedFieldValues.tax_id || extractedFieldValues.number || '' },
      { pattern: /^Text\s*Field\s*\d*$/i, value: extractedFieldValues.tax_id || extractedFieldValues.number || '' },
      { pattern: /^FORM.*NUMBER$/i, value: extractedFieldValues.tax_id || extractedFieldValues.number || '' },
      
      // Year patterns
      { pattern: /^(Year|año|ANNO)$/i, value: extractedFieldValues.year || '2023' },
      
      // Name patterns with variations
      { pattern: /^(PRIMER.*APELLIDO|FIRST.*SURNAME)$/i, value: extractedFieldValues.first_surname || '' },
      { pattern: /^(SEGUNDO.*APELLIDO|SECOND.*SURNAME)$/i, value: extractedFieldValues.second_surname || '' },
      { pattern: /^(PRIMER.*NOMBRE|FIRST.*NAME)$/i, value: extractedFieldValues.first_name || '' },
      { pattern: /^(OTROS.*NOMBRES|OTHER.*NAMES)$/i, value: extractedFieldValues.other_names || '' },
      
      // Common numbered field patterns for tax forms
      { pattern: /^2[0-9]$/i, value: extractedFieldValues.year || '2023' }, // Fields like 20, 21, 22, etc.
      { pattern: /^3[0-9]$/i, value: extractedFieldValues.tax_id || extractedFieldValues.number || '' },
      { pattern: /^4[0-9]$/i, value: extractedFieldValues.first_surname || '' },
      { pattern: /^5[0-9]$/i, value: extractedFieldValues.second_surname || '' },
      { pattern: /^6[0-9]$/i, value: extractedFieldValues.first_name || '' },
      { pattern: /^7[0-9]$/i, value: extractedFieldValues.other_names || '' },
      
      // Generic numbered fields
      { pattern: /^(field|campo)_?1$/i, value: extractedFieldValues.year || '2023' },
      { pattern: /^(field|campo)_?2$/i, value: extractedFieldValues.tax_id || extractedFieldValues.number || '' },
      { pattern: /^(field|campo)_?3$/i, value: extractedFieldValues.first_surname || '' },
      { pattern: /^(field|campo)_?4$/i, value: extractedFieldValues.second_surname || '' },
      { pattern: /^(field|campo)_?5$/i, value: extractedFieldValues.first_name || '' },
      { pattern: /^(field|campo)_?6$/i, value: extractedFieldValues.other_names || '' },
    ];
    
    // Apply pattern matching
    for (const fieldName of formFieldNames) {
      let mapped = false;
      
      // Try each pattern
      for (const { pattern, value } of mappingPatterns) {
        if (pattern.test(fieldName) && value) {
          mappings[fieldName] = value;
          console.log(`✅ Mapped field "${fieldName}" -> "${value}" (pattern: ${pattern})`);
          mapped = true;
          break;
        }
      }
      
      // If no pattern matched, try direct key matching
      if (!mapped) {
        const normalizedFieldName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        for (const [key, value] of Object.entries(extractedFieldValues)) {
          if (value && (
            key.toLowerCase() === normalizedFieldName ||
            key.toLowerCase().includes(normalizedFieldName) ||
            normalizedFieldName.includes(key.toLowerCase())
          )) {
            mappings[fieldName] = value;
            console.log(`✅ Mapped field "${fieldName}" -> "${value}" (direct match with "${key}")`);
            mapped = true;
            break;
          }
        }
      }
      
      if (!mapped) {
        console.log(`⚠️ No mapping found for field: "${fieldName}"`);
      }
    }
    
    console.log(`📊 Successfully mapped ${Object.keys(mappings).length} out of ${formFieldNames.length} form fields`);
    return mappings;
  }

  // New method that handles both manual and auto-created templates
  async fillPDFTemplateWithTemplate(template: Template, extractedFieldValues: Record<string, string>): Promise<Buffer> {
    try {
      // Resolve the template path
      let resolvedPath = template.filePath;
      if (template.filePath.startsWith('/') && !template.filePath.startsWith('/home') && !template.filePath.startsWith('/usr')) {
        resolvedPath = path.join(process.cwd(), template.filePath.substring(1));
      }
      
      console.log(`Reading template from: ${resolvedPath}`);
      console.log(`Template ID: ${template.id}`);
      console.log(`Template name: ${template.name}`);
      console.log(`Template type: ${template.isAutoCreated ? 'auto-created' : 'manual'}`);
      
      // Read the template file
      const templateBytes = fs.readFileSync(resolvedPath);
      
      // Load the PDF
      const pdfDoc = await PDFDocument.load(templateBytes);
      
      // Get the form
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      console.log(`Found ${fields.length} form fields in template`);
      
      // Debug: Log all form field details
      if (fields.length > 0) {
        console.log('Form field details:');
        fields.forEach((field, index) => {
          try {
            console.log(`  Field ${index + 1}: Name="${field.getName()}", Type="${field.constructor.name}"`);
          } catch (error) {
            console.log(`  Field ${index + 1}: Error getting field info - ${error}`);
          }
        });
      } else {
        console.log('⚠️ No form fields detected - this template may not have interactive form fields');
      }
      
      // Try to fill existing form fields first (for both manual and auto-created templates)
      if (fields.length > 0) {
        console.log('Attempting to fill existing form fields...');
        console.log('Available form fields:', fields.map(f => f.getName()));
        
        let fieldsFilledCount = 0;
        
        // Dynamic field mapping - intelligently map extracted data to ALL discovered form fields
        console.log('🔍 Creating intelligent field mappings for all discovered form fields...');
        console.log('📋 Available extracted data:', Object.keys(extractedFieldValues));
        
        const fieldMappings = this.createIntelligentFieldMappings(
          fields.map(f => f.getName()), 
          extractedFieldValues
        );
        
        // Try all field mappings
        for (const [mappingName, value] of Object.entries(fieldMappings)) {
          if (!value) continue;
          
          try {
            const field = form.getTextField(mappingName);
            if (field) {
              field.setText(String(value));
              console.log(`✅ Filled form field "${mappingName}" with: ${value}`);
              fieldsFilledCount++;
            }
          } catch (error) {
            // Field not found or wrong type, continue
          }
        }
        
        // Also try the original extracted field names
        for (const [fieldName, value] of Object.entries(extractedFieldValues)) {
          if (!value) continue;
          
          try {
            const field = form.getTextField(fieldName);
            if (field) {
              field.setText(String(value));
              console.log(`✅ Filled form field "${fieldName}" with: ${value}`);
              fieldsFilledCount++;
            }
          } catch (error) {
            // Field not found or wrong type, continue
          }
        }
        
        console.log(`Attempted to fill form fields. Successfully filled: ${fieldsFilledCount}`);
        
        if (fieldsFilledCount > 0) {
          console.log(`✅ Successfully filled ${fieldsFilledCount} form fields - using form field approach`);
          form.flatten();
          const filledPdfBytes = await pdfDoc.save();
          return Buffer.from(filledPdfBytes);
        } else {
          console.log(`⚠️ No form fields were filled. Available fields: ${fields.map(f => f.getName()).join(', ')}`);
        }
      }
      
      // No form fields filled - use coordinate-based approach for auto-created templates
      if (template.isAutoCreated && template.fieldMappings) {
        console.log('Using coordinate-based field placement for auto-created template...');
        return await this.fillPDFWithCoordinates(pdfDoc, template.fieldMappings, extractedFieldValues);
      }
      
      // Only use HTML template approach if no form fields were found and it's a DIAN form
      if ((template.name.toLowerCase().includes('dian') || template.name.toLowerCase().includes('tax')) && fields.length === 0) {
        console.log('No form fields found - using HTML template approach for DIAN tax form...');
        return await this.htmlTemplateService.generateDIANDocument(extractedFieldValues);
      }
      
      // Fallback to creating DIAN tax form from scratch
      console.log('Creating DIAN tax form from scratch...');
      return await this.createDIANTaxForm(extractedFieldValues);
      
    } catch (error) {
      console.error('PDF template filling failed:', error);
      throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Legacy method for backward compatibility
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
  
  /**
   * Fill PDF using coordinate-based field mappings from auto-created templates
   */
  private async fillPDFWithCoordinates(
    pdfDoc: PDFDocument, 
    fieldMappings: TemplateFieldMappings, 
    extractedFieldValues: Record<string, string>
  ): Promise<Buffer> {
    try {
      console.log('Filling PDF using coordinate-based approach...');
      
      // Embed fonts
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      let fieldsPlacedCount = 0;
      
      // Process each field mapping
      for (const [fieldName, fieldMapping] of Object.entries(fieldMappings)) {
        const value = extractedFieldValues[fieldName];
        if (!value || !fieldMapping.instances || fieldMapping.instances.length === 0) {
          console.log(`Skipping field ${fieldName}: no value or instances`);
          continue;
        }
        
        // Use the first instance for now (could be enhanced to handle multiple instances)
        const instance = fieldMapping.instances[0];
        const coordinates = instance.coordinates;
        
        try {
          // Get the page (convert from 1-based to 0-based indexing)
          const pageIndex = coordinates.page - 1;
          const pages = pdfDoc.getPages();
          
          if (pageIndex < 0 || pageIndex >= pages.length) {
            console.warn(`Page ${coordinates.page} not found for field ${fieldName}`);
            continue;
          }
          
          const page = pages[pageIndex];
          const { height: pageHeight } = page.getSize();
          
          // Convert coordinates if needed (our schema uses bottom-left origin, same as PDF)
          let x = coordinates.rect.x;
          let y = coordinates.rect.y;
          
          // If the coordinates seem to be from top-left origin, convert them
          if (y > pageHeight / 2 && instance.ocrText) {
            // Likely top-left origin, convert to bottom-left
            y = pageHeight - y - coordinates.rect.height;
          }
          
          // Determine font size based on field height
          const fontSize = Math.min(12, Math.max(8, coordinates.rect.height * 0.7));
          
          // Choose font based on field type
          const useFont = fieldMapping.fieldDefinition.type === 'text' ? font : font;
          
          // Draw the text
          page.drawText(value, {
            x: x,
            y: y,
            size: fontSize,
            font: useFont,
            color: rgb(0, 0, 0),
            maxWidth: coordinates.rect.width,
          });
          
          console.log(`Placed field ${fieldName} at (${x}, ${y}) with value: ${value}`);
          fieldsPlacedCount++;
          
        } catch (error) {
          console.error(`Failed to place field ${fieldName}:`, error instanceof Error ? error.message : String(error));
        }
      }
      
      console.log(`Successfully placed ${fieldsPlacedCount} fields using coordinates`);
      
      // Save the PDF
      const filledPdfBytes = await pdfDoc.save();
      return Buffer.from(filledPdfBytes);
      
    } catch (error) {
      console.error('Coordinate-based PDF filling failed:', error);
      throw error;
    }
  }

  private async createDIANTaxForm(extractedFieldValues: Record<string, string>): Promise<Buffer> {
    try {
      console.log('Creating DIAN tax form with extracted data:', extractedFieldValues);
      
      // Create a new PDF document
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]); // Standard letter size
      const { width, height } = page.getSize();
      
      // Embed fonts
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      // DIAN Header
      page.drawText('DIAN', {
        x: 50,
        y: height - 50,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      page.drawText('Income Tax Return and Complementary Return for Resident', {
        x: 150,
        y: height - 50,
        size: 12,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('Individuals and Equivalent Taxpayers, and Estates of Resident', {
        x: 150,
        y: height - 65,
        size: 12,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('Decedents', {
        x: 150,
        y: height - 80,
        size: 12,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Form number (top right)
      page.drawText('210', {
        x: width - 80,
        y: height - 50,
        size: 16,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      let currentY = height - 120;

      // Year and Form Number section
      page.drawText('1. Year', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(extractedFieldValues.year || '2023', {
        x: 100,
        y: currentY,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      page.drawText('4. Form Number:', {
        x: 300,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(extractedFieldValues.number || extractedFieldValues.tax_id || 'N/A', {
        x: 380,
        y: currentY,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      currentY -= 30;

      // Space reserved for DIAN use
      page.drawText('Space reserved for use by DIAN', {
        x: 50,
        y: currentY,
        size: 9,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      page.drawText('/barcode/', {
        x: 300,
        y: currentY,
        size: 9,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      page.drawText('/barcode/', {
        x: 450,
        y: currentY,
        size: 9,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      currentY -= 40;

      // Taxpayer Identification section
      page.drawText('5. Tax Identification Number (NIT):', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('6.', {
        x: 200,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('7. First Surname', {
        x: 230,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('8. Second Surname', {
        x: 330,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('9. First Name:', {
        x: 430,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('10. Other Names', {
        x: 510,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      currentY -= 20;

      // Values for identification section
      page.drawText(extractedFieldValues.tax_id || 'N/A', {
        x: 50,
        y: currentY,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      page.drawText(extractedFieldValues.first_surname || 'N/A', {
        x: 230,
        y: currentY,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      page.drawText(extractedFieldValues.other_names || 'N/A', {
        x: 330,
        y: currentY,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      page.drawText(extractedFieldValues.first_name || 'N/A', {
        x: 430,
        y: currentY,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      currentY -= 40;

      // Main Economic Activity section
      page.drawText('21. Main Economic Activity:', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('Specify (if it is a', {
        x: 180,
        y: currentY,
        size: 9,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('25.', {
        x: 260,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('26. Prior Year Return Number:', {
        x: 290,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('27. Partial Year Return for', {
        x: 450,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      currentY -= 15;

      page.drawText('complement)', {
        x: 180,
        y: currentY,
        size: 9,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('Additional Data', {
        x: 450,
        y: currentY,
        size: 9,
        font: font,
        color: rgb(0, 0, 0),
      });

      currentY -= 30;

      // Assets section
      page.drawText('Assets', {
        x: 50,
        y: currentY,
        size: 12,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      page.drawText('Total Gross Assets', {
        x: 150,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('25.', {
        x: 260,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('Liabilities+Debts', {
        x: 330,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('30.', {
        x: 430,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('Net Worth', {
        x: 470,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText('31.', {
        x: 520,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      currentY -= 40;

      // Date section
      page.drawText('Date:', {
        x: 50,
        y: currentY,
        size: 10,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(extractedFieldValues.date || 'N/A', {
        x: 90,
        y: currentY,
        size: 10,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      currentY -= 40;

      // Footer note
      page.drawText('This is a computer-generated DIAN tax form document', {
        x: 50,
        y: 50,
        size: 8,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      page.drawText(`Generated on: ${new Date().toLocaleDateString()}`, {
        x: 50,
        y: 35,
        size: 8,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      console.log('Successfully created DIAN tax form PDF from scratch');
      
      // Save the PDF
      const filledPdfBytes = await pdfDoc.save();
      return Buffer.from(filledPdfBytes);
      
    } catch (error) {
      console.error('DIAN tax form creation failed:', error);
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