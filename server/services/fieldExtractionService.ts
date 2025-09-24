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
   * Extract basic field structure from OCR text for template matching purposes
   * This is a lightweight extraction to identify field names without full processing
   */
  async extractBasicFieldsFromText(ocrText: string): Promise<Record<string, string>> {
    try {
      const systemPrompt = `You are extracting field names and values from OCR text of official documents.
      
Your task: Identify field names and their corresponding values from the OCR text. Focus on finding structured data like names, numbers, dates, and official document fields.

Return a JSON object where:
- Keys are field names (lowercase with underscores, e.g., "first_name", "document_number")
- Values are the extracted values from the text

Example output:
{
  "first_name": "JOHN",
  "last_name": "DOE", 
  "document_number": "12345",
  "registry_office": "CIVIL REGISTRY"
}

Only include fields where you can clearly identify both the field name and its value. If unsure, omit the field.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract field names and values from this OCR text:\n\n${ocrText}` }
        ],
        response_format: { type: "json_object" }
      });

      const extractedFields = JSON.parse(response.choices[0].message.content || '{}');
      return extractedFields;
    } catch (error) {
      console.error('Basic field extraction failed:', error);
      // Fallback: try to extract some basic patterns manually
      return this.extractBasicFieldsManually(ocrText);
    }
  }

  /**
   * Manual fallback for basic field extraction
   */
  private extractBasicFieldsManually(text: string): Record<string, string> {
    const fields: Record<string, string> = {};
    
    // Common patterns for document fields
    const patterns = [
      { pattern: /first_name[:\s]+([A-Z\s]+)/i, field: 'first_name' },
      { pattern: /other_names?[:\s]+([A-Z\s]+)/i, field: 'other_names' },
      { pattern: /first_surname[:\s]+([A-Z\s]+)/i, field: 'first_surname' },
      { pattern: /second_surname[:\s]+([A-Z\s]+)/i, field: 'second_surname' },
      { pattern: /tax_identification_number[:\s]+([0-9]+)/i, field: 'tax_identification_number' },
      { pattern: /document_number[:\s]+([A-Z0-9]+)/i, field: 'document_number' },
      { pattern: /serial[:\s]+([A-Z0-9]+)/i, field: 'serial_indicator' },
      { pattern: /registry[:\s]+([A-Z\s]+)/i, field: 'registry_office' }
    ];
    
    for (const { pattern, field } of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        fields[field] = match[1].trim();
      }
    }
    
    return fields;
  }
  
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
        // Enhanced semantic field extraction with intelligent type recognition
        const fieldList = templateFields.join(', ');
        systemPrompt = `You are an expert bilingual document analyzer specializing in tax forms and legal documents. Extract ONLY data that corresponds to these specific PDF form fields: ${fieldList}

🧠 FIELD TYPE INTELLIGENCE - Understand the semantic meaning of each field:

📋 PERSONAL IDENTIFICATION FIELDS:
- "Tax Identification Number"/"NIT"/"tax_id": Look for ACTUAL tax ID numbers (longer format like "79524018 9" or "91900175066331"). DO NOT use form numbers here.
- "Form Number"/"form_number": Look for specific form reference numbers (like "2118615051596"). This is NOT the tax ID.
- "Year"/"year"/"año": Look for 4-digit years (2023, 2022, etc.) that represent the tax year.

👤 NAME FIELDS (Spanish document order matters):
- "First Surname"/"primer apellido"/"first_surname": First surname in Spanish name order (e.g., "MORENO")
- "Second Surname"/"segundo apellido"/"second_surname": Second surname in Spanish name order (e.g., "GUTIERREZ")
- "First Name"/"primer nombre"/"first_name": Given/first name (e.g., "HECTOR")
- "Other Names"/"otros nombres"/"other_names": Additional given names (e.g., "ANTONIO")

🏢 ADMINISTRATIVE FIELDS:
- "Regional Office Code"/"código oficina": Geographic/office codes
- "Main Economic Activity"/"actividad económica": Business activity codes

💰 FINANCIAL FIELDS (numbered 29-141):
- "Total Gross Assets"/"activos brutos": Large monetary amounts in assets section
- "Liabilities"/"pasivos": Debt amounts
- "Net Worth"/"patrimonio": Net worth calculations
- "Gross Income"/"ingresos brutos": Income amounts
- "Taxable Income"/"renta gravable": Taxable amounts
- "Balance Tax Due"/"saldo a pagar": Final tax amounts
- "Penalties"/"sanciones": Penalty amounts

🎯 EXTRACTION RULES:
1. **Field Semantic Matching**: Match data based on field MEANING, not just keywords
2. **Data Type Validation**: 
   - Tax IDs: Look for longer numeric sequences with spaces/formatting
   - Form Numbers: Look for specific form reference numbers (usually shorter)
   - Names: Extract from name sections, respect Spanish naming order
   - Financial: Look for large monetary amounts with commas/periods
3. **Spanish-English Semantic Mapping**: 
   - "primer apellido" → "First Surname" (not "First Name")
   - "segundo apellido" → "Second Surname" 
   - "primer nombre" → "First Name"
   - "NIT" or long tax numbers → "Tax Identification Number" (not Form Number)
4. **Context Awareness**: Use document structure and positioning to disambiguate similar data
5. **Exact Field Names**: Use the EXACT template field names as JSON keys
6. **Quality Control**: If uncertain about a mapping, omit it rather than guess incorrectly

⚠️ CRITICAL DISTINCTIONS:
- Form Number (like "2118615051596") ≠ Tax ID (like "79524018 9" or "91900175066331")
- First Surname ≠ First Name (different concepts in Spanish documents)
- Financial amounts go to numbered fields, personal data to header fields

Return a JSON object with exact template field names as keys and correctly mapped values as strings.`;
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
      const systemPrompt = `You are an expert bilingual document mapping specialist. Your task is to create intelligent semantic mappings between extracted document data and template fields.

🎯 TEMPLATE FIELDS: ${templateFields.join(', ')}
📄 EXTRACTED DATA: ${JSON.stringify(extractedData)}

🧠 INTELLIGENT MAPPING STRATEGY:

1. **Semantic Field Analysis**: 
   - Analyze what each template field is asking for (Tax ID vs Form Number vs Names)
   - Match based on field MEANING, not just string similarity

2. **Data Type Recognition**:
   - Tax IDs: Longer numbers with formatting ("79524018 9", "91900175066331")
   - Form Numbers: Specific form references ("2118615051596")
   - Names: Personal names in Spanish order (primer apellido, segundo apellido, primer nombre)
   - Financial: Monetary amounts with commas/formatting

3. **Spanish-English Cross-Mapping**:
   - "primer_apellido" → "First Surname" field
   - "segundo_apellido" → "Second Surname" field
   - "primer_nombre" → "First Name" field
   - "NIT" or tax numbers → "Tax Identification Number" field (NOT Form Number)
   - Form references → "Form Number" field (NOT Tax ID)

4. **Context-Aware Disambiguation**:
   - If multiple numbers exist, distinguish between tax IDs, form numbers, and amounts
   - Respect Spanish naming conventions when mapping to English name fields
   - Use document structure clues to identify correct data types

⚠️ CRITICAL MAPPING RULES:
- Map "79524018 9" → Tax ID field (NOT Form Number)
- Map "2118615051596" → Form Number field (NOT Tax ID)
- Map "MORENO" → First Surname, "GUTIERREZ" → Second Surname
- Map "HECTOR" → First Name, "ANTONIO" → Other Names
- Only create mappings you're confident about - omit uncertain ones

Return a JSON object with template field names as keys and correctly mapped extracted values.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Create the intelligent field mapping." }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1 // Lower temperature for more consistent semantic mapping
      });

      const fieldMappings = JSON.parse(response.choices[0].message.content || '{}');
      console.log(`🎯 Enhanced field mapping created ${Object.keys(fieldMappings).length} intelligent mappings:`, fieldMappings);
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
