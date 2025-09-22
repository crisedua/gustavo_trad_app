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
   * Extract field names from template - use actual PDF form fields for manual templates
   */
  async getFieldNamesFromTemplate(template: Template): Promise<string[]> {
    // For manual templates, get the actual PDF form field names
    if (!template.isAutoCreated) {
      try {
        const pdfFormFields = await this.getPDFFormFieldNames(template);
        if (pdfFormFields.length > 0) {
          console.log(`📋 Using PDF form field names for extraction: ${pdfFormFields.join(', ')}`);
          return pdfFormFields;
        }
      } catch (error) {
        console.warn('Failed to get PDF form fields, falling back to fieldMappings:', error);
      }
    }
    
    // Fallback to fieldMappings for auto-created templates or if PDF scan fails
    if (!template.fieldMappings) {
      return [];
    }
    
    return Object.keys(template.fieldMappings);
  }
  
  /**
   * Get actual form field names from PDF template
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
      
      // Get form field names
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      return fields.map(field => field.getName());
    } catch (error) {
      console.error('Error reading PDF form fields:', error);
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
        systemPrompt = `You are an expert document analyzer. Extract ONLY data that corresponds to these specific PDF form fields: ${templateFields.join(', ')}

For each form field, look for the most relevant data in the OCR text:

FIELD MAPPING GUIDE:
- YEAR/Year/año: Look for 4-digit years (like 2023, 2022, etc.)
- FIRSTSURNAME/primer_apellido: Look for first/primary surname in Spanish documents  
- SECONDSURNAME/segundo_apellido: Look for second surname in Spanish documents
- FIRST NAME/primer_nombre: Look for first given name
- OTHER NAMES/otros_nombres: Look for additional given names
- Text Field0/NIT/tax_id: Look for tax identification numbers, NIT numbers, or document IDs

EXTRACTION RULES:
1. Return ONLY data for the exact form field names provided: ${templateFields.join(', ')}
2. Use exact form field names as JSON keys
3. If a form field has no corresponding data in the text, omit it completely
4. Focus on extracting personal information (names, years, IDs) rather than financial data
5. For Spanish documents, map Spanish field names to English form field names when possible

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
    const templateFields = this.getFieldNamesFromTemplate(template);
    
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
