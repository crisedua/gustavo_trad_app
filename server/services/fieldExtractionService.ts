import OpenAI from "openai";
import type { Template, TemplateFieldMappings, getFieldNamesFromMappings } from '@shared/schema';

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

export interface ExtractedField {
  fieldName: string;
  value: string;
  confidence: number;
}

export class FieldExtractionService {
  
  /**
   * Extract field names from template - use comprehensive PDF form field detection for ALL templates
   */
  async getFieldNamesFromTemplate(template: Template): Promise<string[]> {
    // Try comprehensive PDF form field detection for ALL templates (manual and auto-created)
    try {
      const pdfFormFields = await this.getPDFFormFieldNames(template);
      if (pdfFormFields.length > 0) {
        console.log(`📋 Using comprehensive PDF form field names for extraction (${pdfFormFields.length} fields): ${pdfFormFields.slice(0, 10).join(', ')}${pdfFormFields.length > 10 ? '...' : ''}`);
        return pdfFormFields;
      }
    } catch (error) {
      console.warn('Failed to get comprehensive PDF form fields, falling back to fieldMappings:', error);
    }
    
    // Fallback to fieldMappings if PDF scan fails
    if (!template.fieldMappings) {
      return [];
    }
    
    const fallbackFields = Object.keys(template.fieldMappings);
    console.log(`📋 Using template fieldMappings as fallback (${fallbackFields.length} fields): ${fallbackFields.join(', ')}`);
    return fallbackFields;
  }
  
  /**
   * Get comprehensive field names from PDF template - both fillable fields and numbered positions
   */
  async getPDFFormFieldNames(template: Template): Promise<string[]> {
    const { PDFDocument } = await import('pdf-lib');
    const fs = await import('fs');
    const path = await import('path');
    
    try {
      // Resolve the template path
      let resolvedPath = template.filePath;
      if (template.filePath.startsWith('/') && !template.filePath.startsWith('/home') && !template.filePath.startsWith('/usr')) {
        resolvedPath = path.join(process.cwd(), template.filePath.substring(1));
      }
      
      // Read and load the PDF
      const templateBytes = fs.readFileSync(resolvedPath);
      const pdfDoc = await PDFDocument.load(templateBytes);
      
      // Method 1: Get actual fillable form field names
      const form = pdfDoc.getForm();
      const fillableFields = form.getFields().map(field => field.getName());
      
      console.log(`🔍 Found ${fillableFields.length} fillable form fields:`, fillableFields.join(', '));
      
      // Method 2: Extract numbered field positions from document text
      const numberedFields = await this.extractNumberedFieldsFromPDF(resolvedPath);
      
      console.log(`📊 Found ${numberedFields.length} numbered field positions:`, numberedFields.slice(0, 10).join(', ') + (numberedFields.length > 10 ? '...' : ''));
      
      // Combine both approaches for comprehensive field detection
      const allFields = Array.from(new Set([...fillableFields, ...numberedFields]));
      
      console.log(`✅ Total comprehensive fields detected: ${allFields.length}`);
      
      return allFields;
    } catch (error) {
      console.error('Error reading PDF form fields:', error);
      return [];
    }
  }
  
  /**
   * Extract numbered field positions from PDF text content
   */
  async extractNumberedFieldsFromPDF(pdfPath: string): Promise<string[]> {
    const { OCRService } = await import('./ocrService');
    const fs = await import('fs');
    
    try {
      const ocrService = new OCRService();
      const extractedText = await ocrService.extractTextFromFile(pdfPath);
      
      // Extract numbered fields from text (1. Year, 4. Form Number, etc.)
      const numberedFieldPattern = /\b(\d+)\s*\.[\s]*([^\d]{1,50}?)(?=\s*\d+\.|$|\n)/g;
      const namedFieldPattern = /\b(Year|Form Number|Tax Identification|First Surname|Second Surname|First Name|Other Names|Regional Office|Economic Activity|Code|Assets|Liabilities|Net Worth|Income|Deductions|Balance|Penalties|Dependents|Overpayment)\b/gi;
      
      const numberedFields: string[] = [];
      const namedFields: string[] = [];
      
      // Extract numbered fields (1. Year, 4. Form Number, etc.)
      let match;
      while ((match = numberedFieldPattern.exec(extractedText)) !== null) {
        const fieldNumber = match[1];
        const fieldName = match[2].trim().replace(/[^a-zA-Z0-9\s]/g, '').trim();
        if (fieldName && fieldName.length > 0) {
          numberedFields.push(`field_${fieldNumber}_${fieldName.toLowerCase().replace(/\s+/g, '_')}`);
        }
      }
      
      // Extract named fields
      let namedMatch;
      while ((namedMatch = namedFieldPattern.exec(extractedText)) !== null) {
        namedFields.push(namedMatch[1].toLowerCase().replace(/\s+/g, '_'));
      }
      
      // Generate common tax form fields based on DIAN structure
      const commonTaxFields = [
        'year', 'form_number', 'tax_identification_number', 'nit',
        'first_surname', 'second_surname', 'first_name', 'other_names',
        'regional_office_code', 'main_economic_activity', 'correction_code',
        'prior_year_return', 'partial_year_return', 'one_percent_purchases',
        'total_gross_assets', 'liabilities_debts', 'net_worth',
        'gross_income', 'non_taxable_income', 'allowable_costs_deductions',
        'taxable_income', 'exempt_income', 'total_deductions',
        'ordinary_taxable_income', 'net_loss', 'loss_carryovers',
        'ordinary_net_income', 'presumptive_income', 'capital_gains',
        'income_tax_due', 'foreign_tax_credit', 'total_tax_due',
        'balance_tax_due', 'penalties', 'total_balance_due',
        'total_overpayment', 'number_dependents', 'addition_dependents'
      ];
      
      // Combine all field types
      return Array.from(new Set([...numberedFields, ...namedFields, ...commonTaxFields]));
      
    } catch (error) {
      console.warn('Error extracting numbered fields from PDF:', error);
      return [];
    }
  }
  
  /**
   * Enhanced extraction that works with both manual and auto-created templates
   */
  async extractFieldsForTemplate(ocrText: string, template: Template): Promise<Record<string, string>> {
    const templateFields = await this.getFieldNamesFromTemplate(template);
    return await this.extractFields(ocrText, templateFields);
  }
  
  async extractFields(ocrText: string, templateFields?: string[]): Promise<Record<string, string>> {
    try {
      let systemPrompt = '';
      
      if (templateFields && templateFields.length > 0) {
        // Focused extraction for specific PDF form fields
        const fieldList = templateFields.join(', ');
        systemPrompt = `You are an expert document analyzer. Extract ONLY data that corresponds to these specific PDF form fields: ${fieldList}

For each form field, look for the most relevant data in the OCR text:

FIELD MAPPING GUIDE:
- YEAR/Year/año/year/form_number: Look for 4-digit years (like 2023, 2022, etc.)
- FIRSTSURNAME/primer_apellido/first_surname: Look for first/primary surname in Spanish documents  
- SECONDSURNAME/segundo_apellido/second_surname: Look for second surname in Spanish documents
- FIRST NAME/primer_nombre/first_name: Look for first given name
- OTHER NAMES/otros_nombres/other_names: Look for additional given names
- Text Field0/NIT/tax_id/tax_identification_number: Look for tax identification numbers, NIT numbers, or document IDs
- field_1_*,field_4_*,field_5_*: Look for data in numbered positions (1. Year, 4. Form Number, 5. Tax ID, etc.)
- Assets/Liabilities/Income fields: Look for financial amounts and calculations

2. Use exact form field names as JSON keys
3. If a form field has no corresponding data in the text, omit it completely
4. Extract both personal information (names, years, IDs) and financial data when fields exist
5. For Spanish documents, map Spanish field names to English form field names when possible
6. For numbered fields (field_1_*, field_4_*, etc.), extract the data from corresponding numbered positions

Return a JSON object with form field names as keys and extracted values as strings.`;
      } else {
        // Fallback prompt for when no template fields are provided
        systemPrompt = `You are an expert document analyzer. Extract key information from the provided OCR text and structure it as JSON.

Return ONLY a JSON object with field names as keys and extracted values as strings. If a field cannot be found, omit it from the response.`;
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract structured data from this OCR text:\n\n${ocrText}` }
        ],
        response_format: { type: "json_object" }
      });

      const extractedData = JSON.parse(response.choices[0].message.content || '{}');
      return extractedData;
    } catch (error) {
      console.error('Field extraction failed:', error);
      throw new Error(`Field extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async enhanceFieldMapping(extractedData: Record<string, string>, templateFields: string[]): Promise<Record<string, string>> {
    try {
      const systemPrompt = `You are helping to map extracted document data to template fields. 
      
Template fields: ${templateFields.join(', ')}
Extracted data: ${JSON.stringify(extractedData)}

Create the best possible mapping between extracted data and template fields. Return a JSON object where:
- Keys are template field names (from the template fields list)
- Values are the most appropriate extracted values

Only include mappings where you're confident about the match. If no good match exists for a template field, omit it.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Create the field mapping." }
        ],
        response_format: { type: "json_object" }
      });

      const fieldMappings = JSON.parse(response.choices[0].message.content || '{}');
      return fieldMappings;
    } catch (error) {
      console.error('Field mapping enhancement failed:', error);
      throw new Error(`Field mapping failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Enhanced field mapping that includes context from auto-created templates
   */
  async enhanceFieldMappingForTemplate(extractedData: Record<string, string>, template: Template): Promise<Record<string, string>> {
    const templateFields = await this.getFieldNamesFromTemplate(template);
    
    // Add additional context for auto-created templates
    let enhancedPrompt = '';
    if (template.isAutoCreated && template.fieldMappings) {
      const fieldDescriptions = Object.entries(template.fieldMappings)
        .map(([fieldName, mapping]) => {
          const label = mapping.fieldDefinition?.label || fieldName;
          const description = mapping.fieldDefinition?.description || '';
          return `${fieldName}: ${label}${description ? ` - ${description}` : ''}`;
        })
        .join('\n');
      
      enhancedPrompt = `\n\nTemplate was auto-created with these field definitions:\n${fieldDescriptions}`;
    }
    
    try {
      const systemPrompt = `You are helping to map extracted document data to template fields. 
      
Template fields: ${templateFields.join(', ')}
Extracted data: ${JSON.stringify(extractedData)}${enhancedPrompt}

Create the best possible mapping between extracted data and template fields. Return a JSON object where:
- Keys are template field names (from the template fields list)
- Values are the most appropriate extracted values

Only include mappings where you're confident about the match. If no good match exists for a template field, omit it.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Create the field mapping." }
        ],
        response_format: { type: "json_object" }
      });

      const fieldMappings = JSON.parse(response.choices[0].message.content || '{}');
      return fieldMappings;
    } catch (error) {
      console.error('Enhanced field mapping failed, falling back to basic mapping:', error);
      return await this.enhanceFieldMapping(extractedData, templateFields);
    }
  }
}
