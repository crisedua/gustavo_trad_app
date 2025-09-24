export interface TemplateMatchResult {
  templateId: string;
  templateName: string;
  score: number;
  matchedFields: Record<string, string>; // OCR field -> template field mapping
  unmatchedOcrFields: string[];
  unmatchedTemplateFields: string[];
  confidence: 'high' | 'medium' | 'low' | 'none';
}

export class TemplateMatchingService {
  
  /**
   * Matches OCR extracted fields against available templates and returns scored results
   */
  async findBestTemplateMatch(
    ocrFields: Record<string, string>,
    templates: Array<{ id: string; name: string; fieldMappings: Record<string, any> }>,
    minScore: number = 0.3
  ): Promise<TemplateMatchResult[]> {
    const results: TemplateMatchResult[] = [];
    
    for (const template of templates) {
      const result = this.scoreTemplateMatch(ocrFields, template);
      if (result.score >= minScore) {
        results.push(result);
      }
    }
    
    // Sort by score descending (best matches first)
    return results.sort((a, b) => b.score - a.score);
  }
  
  /**
   * Scores how well OCR fields match a specific template
   */
  private scoreTemplateMatch(
    ocrFields: Record<string, string>,
    template: { id: string; name: string; fieldMappings: Record<string, any> }
  ): TemplateMatchResult {
    const ocrFieldNames = Object.keys(ocrFields);
    const templateFieldNames = Object.keys(template.fieldMappings || {});
    
    // Create intelligent field mappings
    const fieldMappings = this.createFieldMappings(ocrFieldNames, templateFieldNames);
    
    // Calculate scores
    const matchedOcrFields = Object.keys(fieldMappings);
    const matchedTemplateFields = Object.values(fieldMappings);
    const unmatchedOcrFields = ocrFieldNames.filter(field => !matchedOcrFields.includes(field));
    const unmatchedTemplateFields = templateFieldNames.filter(field => !matchedTemplateFields.includes(field));
    
    // Base score: percentage of OCR fields that found matches
    let score = matchedOcrFields.length / Math.max(ocrFieldNames.length, 1);
    
    // Bonus for covering template required fields
    const templateCoverage = matchedTemplateFields.length / Math.max(templateFieldNames.length, 1);
    score = (score + templateCoverage) / 2;
    
    // Penalty for having too many unmatched template fields (template is too complex)
    if (templateFieldNames.length > 0) {
      const unmatchedTemplateRatio = unmatchedTemplateFields.length / templateFieldNames.length;
      if (unmatchedTemplateRatio > 0.7) {
        score *= 0.7; // Reduce score if template has too many unmatched fields
      }
    }
    
    // Determine confidence level
    let confidence: 'high' | 'medium' | 'low' | 'none';
    if (score >= 0.8) confidence = 'high';
    else if (score >= 0.5) confidence = 'medium'; 
    else if (score >= 0.3) confidence = 'low';
    else confidence = 'none';
    
    return {
      templateId: template.id,
      templateName: template.name,
      score: Math.round(score * 100) / 100, // Round to 2 decimal places
      matchedFields: fieldMappings,
      unmatchedOcrFields,
      unmatchedTemplateFields,
      confidence
    };
  }
  
  /**
   * Creates intelligent mappings between OCR field names and template field names
   */
  private createFieldMappings(ocrFieldNames: string[], templateFieldNames: string[]): Record<string, string> {
    const mappings: Record<string, string> = {};
    
    // Define mapping rules for common patterns
    const mappingRules: Array<{ ocrPattern: RegExp; templatePatterns: RegExp[]; priority: number }> = [
      // Names mapping rules
      { 
        ocrPattern: /^first_name$/i, 
        templatePatterns: [/party_a_names?$/i, /first_names?$/i, /names?$/i], 
        priority: 10 
      },
      { 
        ocrPattern: /^other_names?$/i, 
        templatePatterns: [/party_a_names?$/i, /middle_names?$/i, /other_names?$/i], 
        priority: 8 
      },
      { 
        ocrPattern: /^first_surname$/i, 
        templatePatterns: [/party_a_surnames?$/i, /first_surnames?$/i, /surnames?$/i], 
        priority: 10 
      },
      { 
        ocrPattern: /^second_surname$/i, 
        templatePatterns: [/party_a_surnames?$/i, /second_surnames?$/i, /surnames?$/i], 
        priority: 8 
      },
      
      // Document identification rules
      { 
        ocrPattern: /^tax_identification_number$/i, 
        templatePatterns: [/party_a_document_number$/i, /document_number$/i, /identification_number$/i, /tax_id$/i], 
        priority: 10 
      },
      { 
        ocrPattern: /^nit$/i, 
        templatePatterns: [/party_a_document_number$/i, /document_number$/i, /nit$/i], 
        priority: 10 
      },
      
      // Registry information rules
      { 
        ocrPattern: /^registry_office$/i, 
        templatePatterns: [/registry_office$/i, /office$/i], 
        priority: 10 
      },
      { 
        ocrPattern: /^year$/i, 
        templatePatterns: [/year$/i, /registry_year$/i], 
        priority: 9 
      },
      { 
        ocrPattern: /^form_number$/i, 
        templatePatterns: [/form_number$/i, /serial_indicator$/i, /number$/i], 
        priority: 9 
      },
      { 
        ocrPattern: /^code$/i, 
        templatePatterns: [/code$/i, /serial_indicator$/i], 
        priority: 8 
      },
      
      // Location rules
      { 
        ocrPattern: /^regional_office_code$/i, 
        templatePatterns: [/registry_department$/i, /department$/i, /regional_code$/i], 
        priority: 7 
      },
      { 
        ocrPattern: /^municipality$/i, 
        templatePatterns: [/registry_municipality$/i, /municipality$/i], 
        priority: 9 
      }
    ];
    
    // Apply mapping rules with priority
    const usedTemplateFields = new Set<string>();
    const usedOcrFields = new Set<string>();
    
    // Sort rules by priority (highest first)
    const sortedRules = mappingRules.sort((a, b) => b.priority - a.priority);
    
    for (const rule of sortedRules) {
      for (const ocrField of ocrFieldNames) {
        if (usedOcrFields.has(ocrField) || !rule.ocrPattern.test(ocrField)) {
          continue;
        }
        
        // Find best matching template field
        let bestMatch: { field: string; score: number } | null = null;
        
        for (const templateField of templateFieldNames) {
          if (usedTemplateFields.has(templateField)) {
            continue;
          }
          
          for (let i = 0; i < rule.templatePatterns.length; i++) {
            const pattern = rule.templatePatterns[i];
            if (pattern.test(templateField)) {
              const score = rule.priority + (rule.templatePatterns.length - i); // Earlier patterns get higher scores
              if (!bestMatch || score > bestMatch.score) {
                bestMatch = { field: templateField, score };
              }
            }
          }
        }
        
        if (bestMatch) {
          mappings[ocrField] = bestMatch.field;
          usedOcrFields.add(ocrField);
          usedTemplateFields.add(bestMatch.field);
        }
      }
    }
    
    // Fallback: exact name matching for any remaining fields
    for (const ocrField of ocrFieldNames) {
      if (!usedOcrFields.has(ocrField)) {
        for (const templateField of templateFieldNames) {
          if (!usedTemplateFields.has(templateField) && ocrField.toLowerCase() === templateField.toLowerCase()) {
            mappings[ocrField] = templateField;
            usedOcrFields.add(ocrField);
            usedTemplateFields.add(templateField);
            break;
          }
        }
      }
    }
    
    return mappings;
  }
  
  /**
   * Applies the best template match to create final field values
   */
  createMergedFieldValues(
    ocrFields: Record<string, string>,
    bestMatch: TemplateMatchResult
  ): Record<string, string> {
    const mergedFields: Record<string, string> = { ...ocrFields }; // Keep original OCR fields
    
    // Apply field mappings with intelligent value combination
    const combinedTemplateFields: Record<string, string[]> = {};
    
    // Group OCR values by target template field
    for (const [ocrField, templateField] of Object.entries(bestMatch.matchedFields)) {
      const value = ocrFields[ocrField];
      if (value && value.trim()) {
        if (!combinedTemplateFields[templateField]) {
          combinedTemplateFields[templateField] = [];
        }
        combinedTemplateFields[templateField].push(value.trim());
      }
    }
    
    // Create combined values for template fields
    for (const [templateField, values] of Object.entries(combinedTemplateFields)) {
      if (values.length > 0) {
        // Combine values with proper spacing
        mergedFields[templateField] = values.join(' ').trim();
      }
    }
    
    return mergedFields;
  }
}