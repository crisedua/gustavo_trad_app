import OpenAI from "openai";

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
  
  async extractFields(ocrText: string, templateFields?: string[]): Promise<Record<string, string>> {
    try {
      const systemPrompt = `You are an expert document analyzer. Extract key information from the provided OCR text and structure it as JSON.

Common field patterns to look for:
- Names (party_a_names, party_b_names, authorized_name, etc.)
- Surnames (party_a_surnames, party_b_surnames, etc.) 
- Document numbers and types (document_number, document_type, serial_indicator, etc.)
- Dates (marriage_date, birth_date, registration_date, issue_date, etc.)
- Locations (country, department, municipality, registry_office, etc.)
- Official information (authorized_title, office_type, marriage_type, etc.)

${templateFields ? `Focus on these specific template fields: ${templateFields.join(', ')}` : ''}

Return ONLY a JSON object with field names as keys and extracted values as strings. If a field cannot be found, omit it from the response.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract structured data from this OCR text:\n\n${ocrText}` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temperature for consistent extraction
      });

      const extractedData = JSON.parse(response.choices[0].message.content || '{}');
      return extractedData;
    } catch (error) {
      console.error('Field extraction failed:', error);
      throw new Error(`Field extraction failed: ${error.message}`);
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
        model: "gpt-5",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Create the field mapping." }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const fieldMappings = JSON.parse(response.choices[0].message.content || '{}');
      return fieldMappings;
    } catch (error) {
      console.error('Field mapping enhancement failed:', error);
      throw new Error(`Field mapping failed: ${error.message}`);
    }
  }
}
