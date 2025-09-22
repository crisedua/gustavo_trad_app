import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';
import { OCRService } from './ocrService';
import OpenAI from "openai";
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as fs from 'fs';
import * as path from 'path';
import { PathValidator } from '../security/pathValidator';
import { SSRFProtection } from '../security/ssrfProtection';
import { 
  TemplateFieldMappings, 
  FieldMapping, 
  FieldInstance, 
  PdfCoordinates,
  FieldDefinition,
  DetectionSummary,
  TemplateDetectionMetadata,
  AutoTemplateCreation
} from '../../shared/schema';

// Initialize OpenAI client
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key" 
});

export interface MarkerMatch {
  text: string;
  pattern: string;
  confidence: number;
  boundingBox: {
    page: number;
    vertices: Array<{ x: number; y: number }>;
  };
  surroundingText: {
    before: string;
    after: string;
    context: string;
  };
}

export interface FieldAnalysis {
  fieldName: string;
  fieldType: 'text' | 'date' | 'number' | 'boolean' | 'select' | 'multiline_text' | 'signature';
  label: string;
  confidence: number;
  markers: MarkerMatch[];
  contextAnalysis: {
    detectedLabels: string[];
    suggestedType: string;
    validationHints: string[];
  };
}

export interface TemplateAnalysisResult {
  fieldMappings: TemplateFieldMappings;
  detectionMetadata: TemplateDetectionMetadata;
  analysisReport: {
    totalMarkersFound: number;
    fieldsIdentified: number;
    averageConfidence: number;
    processingTime: number;
    documentType?: string;
  };
}

export class TemplateAnalysisService {
  private ocrService: OCRService;
  private client: ImageAnnotatorClient;
  private storage: Storage;

  // Enhanced marker patterns for detection including numbered fields
  private readonly MARKER_PATTERNS = [
    // Visual marker patterns
    { pattern: /X{3,}/g, name: 'XXX_pattern', minLength: 3 },
    { pattern: /X{2}/g, name: 'XX_pattern', minLength: 2 },
    { pattern: /__{2,}/g, name: 'underscore_pattern', minLength: 2 },
    { pattern: /\.{3,}/g, name: 'dot_pattern', minLength: 3 },
    { pattern: /-{3,}/g, name: 'dash_pattern', minLength: 3 },
    { pattern: /\[.*?\]/g, name: 'bracket_pattern', minLength: 1 },
    { pattern: /\{.*?\}/g, name: 'brace_pattern', minLength: 1 },
    { pattern: /\(\s*\)/g, name: 'empty_parentheses', minLength: 1 },
    { pattern: /\[\s*\]/g, name: 'empty_brackets', minLength: 1 },
    { pattern: /____+/g, name: 'long_underscore', minLength: 4 },
    { pattern: /\.\.\.+/g, name: 'ellipsis_pattern', minLength: 3 },
    
    // 📊 NUMBERED FIELD PATTERNS for DIAN forms and similar tax documents
    { pattern: /\b(\d{1,3})\.\s*([A-Za-z][^:\n]{1,50}?)(?=\s|:|$)/g, name: 'numbered_field', minLength: 1 },
    { pattern: /\b(Year|Form Number|Tax Identification|NIT|First Surname|Second Surname|First Name|Other Names|Regional Office|Economic Activity|Gross Assets|Liabilities|Net Worth|Income|Deductions|Balance|Penalties|Dependents)[\s\w]*(?=\s*:|\s*\d|\s*$)/gi, name: 'tax_form_field', minLength: 1 },
    { pattern: /\b\d{1,3}\s*[\.\)\]:]/g, name: 'field_number', minLength: 1 },
    { pattern: /(?:Field|Box|Line)\s*\d{1,3}/gi, name: 'field_reference', minLength: 1 },
    { pattern: /\b(\d{29,141})\b/g, name: 'field_position_number', minLength: 1 }, // Fields 29-141 range
    { pattern: /(Assets|Liabilities|Income|Deductions|Tax|Balance|Penalties)\s*\w*/gi, name: 'financial_field', minLength: 1 },
    
    // 📋 DIAN-specific patterns
    { pattern: /\b(Renta|Activos|Pasivos|Patrimonio|Ingresos|Deducciones|Impuesto|Saldo|Sanciones)\b/gi, name: 'spanish_tax_field', minLength: 1 },
    { pattern: /\b(Año|Número de formulario|Cédula|Primer apellido|Segundo apellido|Primer nombre|Otros nombres)\b/gi, name: 'spanish_personal_field', minLength: 1 }
  ];

  constructor() {
    this.ocrService = new OCRService();
    
    // Initialize Vision API client with same config as OCRService
    try {
      let clientConfig: any = {};

      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        clientConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        clientConfig.credentials = credentials;
        clientConfig.projectId = credentials.project_id;
      }

      if (!clientConfig.projectId && process.env.GOOGLE_CLOUD_PROJECT_ID) {
        clientConfig.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
      }

      this.client = new ImageAnnotatorClient(clientConfig);
      this.storage = new Storage(clientConfig);
    } catch (error) {
      console.error('Failed to initialize TemplateAnalysisService:', error);
      throw error;
    }
  }

  /**
   * Main entry point for template analysis - Enhanced with PDF form field detection
   */
  async analyzeTemplate(filePath: string): Promise<TemplateAnalysisResult> {
    const startTime = Date.now();
    
    try {
      console.log('Starting template analysis for:', filePath.substring(0, 50) + '...');
      
      // Step 1: Extract text and detailed OCR data
      const { fullText, detailedResults } = await this.extractDetailedOCRData(filePath);
      console.log('✅ OCR extraction completed, text length:', fullText.length);
      
      // Step 2: Enhanced field detection - detect file type by content, not extension
      let fieldAnalyses: FieldAnalysis[] = [];
      let totalFieldsFound = 0;
      
      // Detect actual file type by reading content
      const fileBuffer = fs.readFileSync(filePath);
      const actualFileType = this.detectFileType(fileBuffer, filePath);
      console.log('🔍 Detected file type:', actualFileType);
      
      if (actualFileType === 'pdf') {
        console.log('📋 Attempting PDF form field detection...');
        const pdfFormFields = await this.detectPDFFormFields(filePath);
        
        if (pdfFormFields.length > 0) {
          console.log(`✅ PDF form field detection found ${pdfFormFields.length} actual form fields`);
          fieldAnalyses = await this.analyzeFormFields(pdfFormFields, fullText);
          totalFieldsFound = pdfFormFields.length;
        } else {
          console.log('❌ No PDF form fields found. Template ignored - only PDFs with actual fillable form fields are supported.');
          fieldAnalyses = [];
          totalFieldsFound = 0;
        }
      } else {
        // Non-PDF files: use traditional marker detection
        const markers = await this.detectMarkersWithPositions(detailedResults);
        console.log('✅ Marker detection completed, found:', markers.length, 'markers');
        fieldAnalyses = await this.analyzeFields(markers, fullText);
        totalFieldsFound = markers.length;
      }
      
      console.log('✅ Field analysis completed, identified:', fieldAnalyses.length, 'fields');
      
      // Step 3: Generate field mappings structure
      const fieldMappings = await this.generateFieldMappings(fieldAnalyses);
      console.log('✅ Field mappings generated');
      
      // Step 4: Create detection metadata
      const detectionMetadata = this.createDetectionMetadata([], fieldAnalyses, startTime);
      
      // Step 5: Generate analysis report
      const analysisReport = {
        totalMarkersFound: totalFieldsFound,
        fieldsIdentified: fieldAnalyses.length,
        averageConfidence: fieldAnalyses.length > 0 
          ? fieldAnalyses.reduce((sum, f) => sum + f.confidence, 0) / fieldAnalyses.length 
          : 0,
        processingTime: Date.now() - startTime,
        documentType: await this.detectDocumentType(fullText),
      };
      
      console.log('✅ Template analysis completed in', analysisReport.processingTime, 'ms');
      
      return {
        fieldMappings,
        detectionMetadata,
        analysisReport,
      };
      
    } catch (error) {
      console.error('Template analysis failed:', error);
      throw new Error(`Template analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract detailed OCR data with position information
   */
  private async extractDetailedOCRData(filePath: string): Promise<{
    fullText: string;
    detailedResults: any[];
  }> {
    try {
      // Use the existing OCR service for basic text extraction
      const fullText = await this.ocrService.extractTextFromFile(filePath);
      
      // Get detailed OCR results with position data
      let detailedResults: any[] = [];
      
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        // Handle localhost URLs via filesystem, external URLs via download
        if (filePath.includes('localhost') || filePath.includes('127.0.0.1')) {
          // Securely convert localhost URL to filesystem path
          const url = new URL(filePath);
          console.log('TemplateAnalysis: Processing localhost URL securely:', url.pathname.substring(0, 50) + '...');
          
          // Use secure path validation to prevent traversal attacks
          const localPath = PathValidator.mapLocalhostUrlToPath(url);
          
          // Validate file exists and check size limits
          PathValidator.validateFileExists(localPath);
          PathValidator.validateFileSize(localPath, 10 * 1024 * 1024); // 10MB limit
          
          console.log('TemplateAnalysis: Validated filesystem path:', localPath.substring(localPath.lastIndexOf(path.sep) + 1));
          
          const fileBuffer = fs.readFileSync(localPath);
          const fileType = this.detectFileType(fileBuffer, filePath);
          
          if (fileType === 'pdf') {
            detailedResults = await this.extractPDFTextWithPositions(fileBuffer);
          } else if (fileType === 'docx') {
            detailedResults = await this.extractDOCXTextWithPositions(fileBuffer);
          } else {
            detailedResults = await this.extractImageTextWithPositions(fileBuffer);
          }
        } else {
          // For GCS URLs, download and process as buffer
          const gsUri = this.convertToGsUri(filePath);
          const fileBuffer = await this.downloadFile(gsUri);
          const fileType = this.detectFileType(fileBuffer, filePath);
          
          if (fileType === 'pdf') {
            detailedResults = await this.extractPDFTextWithPositions(fileBuffer);
          } else if (fileType === 'docx') {
            detailedResults = await this.extractDOCXTextWithPositions(fileBuffer);
          } else {
            detailedResults = await this.extractImageTextWithPositions(fileBuffer);
          }
        }
      } else if (filePath.startsWith('gs://')) {
        const fileBuffer = await this.downloadFile(filePath);
        const fileType = this.detectFileType(fileBuffer, filePath);
        
        if (fileType === 'pdf') {
          detailedResults = await this.extractPDFTextWithPositions(fileBuffer);
        } else {
          detailedResults = await this.extractImageTextWithPositions(fileBuffer);
        }
      } else {
        // For local files, detect type and process accordingly
        const fileBuffer = fs.readFileSync(filePath);
        const fileType = this.detectFileType(fileBuffer, filePath);
        
        if (fileType === 'pdf') {
          detailedResults = await this.extractPDFTextWithPositions(fileBuffer);
        } else {
          detailedResults = await this.extractImageTextWithPositions(fileBuffer);
        }
      }
      
      return { fullText, detailedResults };
      
    } catch (error) {
      console.error('Detailed OCR extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract text with positions from PDF using PDF.js
   */
  private async extractPDFTextWithPositions(pdfBuffer: Buffer): Promise<any[]> {
    try {
      console.log('Extracting PDF text with positions using PDF.js');
      
      // Load PDF document (convert Buffer to Uint8Array)
      const doc = await pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) }).promise;
      const results: any[] = [];
      
      // Process each page
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const textContent = await page.getTextContent();
        
        // Convert textContent to our format with positions
        const pageResult = {
          page: pageNum,
          width: viewport.width,
          height: viewport.height,
          textAnnotations: textContent.items.map((item: any, index: number) => ({
            description: item.str,
            boundingPoly: {
              vertices: [
                { x: item.transform[4], y: viewport.height - item.transform[5] },
                { x: item.transform[4] + item.width, y: viewport.height - item.transform[5] },
                { x: item.transform[4] + item.width, y: viewport.height - item.transform[5] - item.height },
                { x: item.transform[4], y: viewport.height - item.transform[5] - item.height },
              ]
            }
          }))
        };
        
        results.push(pageResult);
      }
      
      return results;
      
    } catch (error) {
      console.error('PDF text extraction with positions failed:', error);
      // Fallback to Vision API
      return await this.extractImageTextWithPositions(pdfBuffer);
    }
  }

  /**
   * Extract text with positions from images using Vision API
   */
  private async extractImageTextWithPositions(imageBuffer: Buffer): Promise<any[]> {
    try {
      console.log('Extracting image text with positions using Vision API');
      
      const [result] = await this.client.textDetection(imageBuffer);
      const textAnnotations = result.textAnnotations || [];
      
      // Group annotations by estimated page (for multi-page documents)
      const pageResults = [{
        page: 1,
        width: 612, // Default page width in points
        height: 792, // Default page height in points  
        textAnnotations: textAnnotations.slice(1) // Skip the first full-text annotation
      }];
      
      return pageResults;
      
    } catch (error) {
      console.error('Image text extraction with positions failed:', error);
      throw error;
    }
  }
  
  /**
   * Extract text with positions from DOCX files using OCR service
   */
  private async extractDOCXTextWithPositions(docxBuffer: Buffer): Promise<any[]> {
    try {
      console.log('Extracting DOCX text with positions');
      
      // Use mammoth to extract text from DOCX buffer directly
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: docxBuffer });
      const docxText = result.value;
      console.log('DOCX text extracted, length:', docxText.length);
      
      // Since DOCX doesn't have traditional page positions like PDF, 
      // we create synthetic position data for the text
      const words = docxText.split(/\s+/).filter((word: string) => word.trim());
      const textAnnotations = words.map((word: string, index: number) => ({
        description: word,
        boundingPoly: {
          vertices: [
            { x: (index % 10) * 50, y: Math.floor(index / 10) * 20 },
            { x: (index % 10) * 50 + word.length * 8, y: Math.floor(index / 10) * 20 },
            { x: (index % 10) * 50 + word.length * 8, y: Math.floor(index / 10) * 20 + 16 },
            { x: (index % 10) * 50, y: Math.floor(index / 10) * 20 + 16 }
          ]
        }
      }));
      
      // Return as single page result
      const pageResults = [{
        page: 1,
        width: 612, // Default page width
        height: 792, // Default page height
        textAnnotations
      }];
      
      return pageResults;
      
    } catch (error) {
      console.error('DOCX text extraction with positions failed:', error);
      // Fallback to treating as image
      return await this.extractImageTextWithPositions(docxBuffer);
    }
  }

  /**
   * Detect markers with their precise positions
   */
  private async detectMarkersWithPositions(detailedResults: any[]): Promise<MarkerMatch[]> {
    const markers: MarkerMatch[] = [];
    
    for (const pageResult of detailedResults) {
      const pageNum = pageResult.page;
      const textAnnotations = pageResult.textAnnotations || [];
      
      // Build full page text for context analysis
      const pageText = textAnnotations.map((ann: any) => ann.description).join(' ');
      
      // Check each text annotation for markers
      for (let i = 0; i < textAnnotations.length; i++) {
        const annotation = textAnnotations[i];
        const text = annotation.description || '';
        
        // Test against each marker pattern
        for (const patternDef of this.MARKER_PATTERNS) {
          patternDef.pattern.lastIndex = 0; // Reset regex state
          const matches = text.match(patternDef.pattern);
          
          if (matches) {
            for (const match of matches) {
              if (match.length >= patternDef.minLength) {
                // Get surrounding context
                const beforeText = i > 0 
                  ? textAnnotations.slice(Math.max(0, i - 3), i)
                      .map((ann: any) => ann.description).join(' ')
                  : '';
                const afterText = i < textAnnotations.length - 1 
                  ? textAnnotations.slice(i + 1, Math.min(textAnnotations.length, i + 4))
                      .map((ann: any) => ann.description).join(' ')
                  : '';
                
                const marker: MarkerMatch = {
                  text: match,
                  pattern: patternDef.name,
                  confidence: this.calculateMarkerConfidence(match, patternDef, beforeText, afterText),
                  boundingBox: {
                    page: pageNum,
                    vertices: annotation.boundingPoly?.vertices || []
                  },
                  surroundingText: {
                    before: beforeText.trim(),
                    after: afterText.trim(),
                    context: `${beforeText} ${match} ${afterText}`.trim()
                  }
                };
                
                markers.push(marker);
              }
            }
          }
        }
      }
    }
    
    // Remove duplicate markers (same position, similar text)
    return this.deduplicateMarkers(markers);
  }

  /**
   * Analyze fields to determine types and generate meaningful names
   */
  private async analyzeFields(markers: MarkerMatch[], fullText: string): Promise<FieldAnalysis[]> {
    try {
      console.log('Analyzing fields with AI assistance...');
      
      // Group markers by proximity and context to identify fields
      const fieldGroups = this.groupMarkersByField(markers);
      console.log('Grouped markers into', fieldGroups.length, 'potential fields');
      
      const fieldAnalyses: FieldAnalysis[] = [];
      
      for (const group of fieldGroups) {
        // Use AI to analyze the field context and suggest names/types
        const analysis = await this.analyzeFieldWithAI(group, fullText);
        fieldAnalyses.push(analysis);
      }
      
      return fieldAnalyses;
      
    } catch (error) {
      console.error('Field analysis failed:', error);
      // Return basic analysis without AI
      return this.createBasicFieldAnalysis(markers);
    }
  }

  /**
   * Use AI to analyze field context and suggest names and types
   */
  private async analyzeFieldWithAI(markers: MarkerMatch[], fullText: string): Promise<FieldAnalysis> {
    try {
      // Create context from surrounding text
      const contexts = markers.map(m => m.surroundingText.context);
      const uniqueContexts = Array.from(new Set(contexts));
      
      const systemPrompt = `You are an expert at analyzing document templates and form fields. 
      Given marker patterns (XXX, XX, ____, etc.) and their surrounding text context, identify:
      
      1. A meaningful field name (snake_case, descriptive)
      2. The most appropriate field type
      3. A human-readable label
      4. Confidence score (0-1)
      5. Any validation hints
      
      Field types: text, date, number, boolean, select, multiline_text, signature
      
      Return JSON with: fieldName, fieldType, label, confidence, suggestedValidations`;

      const userPrompt = `Analyze these marker contexts and suggest field information:

Marker patterns: ${markers.map(m => m.pattern).join(', ')}
Contexts: ${uniqueContexts.join('\n')}

Document excerpt: ${fullText.substring(0, 1000)}...`;

      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY_ENV_VAR) {
        console.warn('OpenAI API key not available, using fallback field analysis');
        return this.createBasicFieldAnalysisFromMarkers(markers);
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" }
      });

      const aiAnalysis = JSON.parse(response.choices[0].message.content || '{}');
      
      return {
        fieldName: aiAnalysis.fieldName || this.generateFieldNameFromContext(markers[0]),
        fieldType: aiAnalysis.fieldType || 'text',
        label: aiAnalysis.label || this.extractLabelFromContext(markers[0]),
        confidence: aiAnalysis.confidence || 0.7,
        markers,
        contextAnalysis: {
          detectedLabels: this.extractPotentialLabels(markers),
          suggestedType: aiAnalysis.fieldType || 'text',
          validationHints: aiAnalysis.suggestedValidations || []
        }
      };
      
    } catch (error) {
      console.error('AI field analysis failed, using fallback:', error);
      return this.createBasicFieldAnalysisFromMarkers(markers);
    }
  }

  /**
   * Generate field mappings structure according to the schema
   */
  private async generateFieldMappings(fieldAnalyses: FieldAnalysis[]): Promise<TemplateFieldMappings> {
    const fieldMappings: TemplateFieldMappings = {};
    
    for (const analysis of fieldAnalyses) {
      const instances: FieldInstance[] = [];
      
      // Create instances for each marker
      for (const marker of analysis.markers) {
        const vertices = marker.boundingBox.vertices;
        if (vertices.length >= 4) {
          // Calculate bounding rectangle from vertices
          const xCoords = vertices.map(v => v.x);
          const yCoords = vertices.map(v => v.y);
          const minX = Math.min(...xCoords);
          const minY = Math.min(...yCoords);
          const maxX = Math.max(...xCoords);
          const maxY = Math.max(...yCoords);
          
          const instance: FieldInstance = {
            coordinates: {
              page: marker.boundingBox.page,
              rect: {
                x: minX,
                y: minY, // Note: This may need conversion from top-left to bottom-left origin
                width: maxX - minX,
                height: maxY - minY
              },
              rotation: 0,
              units: 'pdf_points',
              origin: 'bottom-left'
            },
            detectionConfidence: marker.confidence,
            detectionMethod: `pattern_${marker.pattern}`,
            ocrText: marker.text
          };
          
          instances.push(instance);
        }
      }
      
      // Create field definition
      const fieldDefinition: FieldDefinition = {
        type: analysis.fieldType,
        label: analysis.label,
        description: `Auto-detected field from ${analysis.markers.length} marker(s)`,
        validation: this.generateValidationRules(analysis),
        displayOptions: this.generateDisplayOptions(analysis)
      };
      
      // Create detection summary
      const detectionSummary: DetectionSummary = {
        totalInstancesFound: instances.length,
        averageConfidence: analysis.confidence,
        detectionMethod: `template_analysis_${analysis.markers[0]?.pattern || 'unknown'}`,
        conflictingInstances: false
      };
      
      // Add to field mappings
      fieldMappings[analysis.fieldName] = {
        instances,
        fieldDefinition,
        detectionSummary
      };
    }
    
    return fieldMappings;
  }


  private calculateMarkerConfidence(match: string, patternDef: any, beforeText: string, afterText: string): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on pattern strength
    if (patternDef.name.includes('XXX') && match.length >= 5) confidence += 0.2;
    if (patternDef.name.includes('underscore') && match.length >= 4) confidence += 0.15;
    
    // Increase confidence if surrounded by form-like text
    const formKeywords = ['name', 'date', 'number', 'address', 'field', 'value', 'enter', 'fill'];
    const contextText = (beforeText + ' ' + afterText).toLowerCase();
    const keywordMatches = formKeywords.filter(keyword => contextText.includes(keyword));
    confidence += keywordMatches.length * 0.05;
    
    // Decrease confidence for very short markers in non-form contexts
    if (match.length < 3 && !formKeywords.some(keyword => contextText.includes(keyword))) {
      confidence -= 0.2;
    }
    
    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  private deduplicateMarkers(markers: MarkerMatch[]): MarkerMatch[] {
    const unique: MarkerMatch[] = [];
    const threshold = 10; // pixels
    
    for (const marker of markers) {
      const isDuplicate = unique.some(existing => {
        if (existing.boundingBox.page !== marker.boundingBox.page) return false;
        
        const existingVertices = existing.boundingBox.vertices;
        const markerVertices = marker.boundingBox.vertices;
        
        if (existingVertices.length === 0 || markerVertices.length === 0) return false;
        
        const existingX = existingVertices[0]?.x || 0;
        const existingY = existingVertices[0]?.y || 0;
        const markerX = markerVertices[0]?.x || 0;
        const markerY = markerVertices[0]?.y || 0;
        
        return Math.abs(existingX - markerX) < threshold && Math.abs(existingY - markerY) < threshold;
      });
      
      if (!isDuplicate) {
        unique.push(marker);
      }
    }
    
    return unique;
  }

  private groupMarkersByField(markers: MarkerMatch[]): MarkerMatch[][] {
    // Simple grouping - each marker is its own field for now
    // In a more sophisticated version, this would group nearby markers
    // that likely represent the same field across multiple pages/instances
    return markers.map(marker => [marker]);
  }

  private generateFieldNameFromContext(marker: MarkerMatch): string {
    const context = marker.surroundingText.before.toLowerCase();
    
    // Common field name patterns
    if (context.includes('name')) return 'name';
    if (context.includes('date')) return 'date';
    if (context.includes('number')) return 'number';
    if (context.includes('address')) return 'address';
    if (context.includes('phone')) return 'phone';
    if (context.includes('email')) return 'email';
    if (context.includes('signature')) return 'signature';
    
    // Generate from pattern and position
    return `field_${marker.pattern}_page${marker.boundingBox.page}`;
  }

  private extractLabelFromContext(marker: MarkerMatch): string {
    const beforeText = marker.surroundingText.before;
    const words = beforeText.split(/\s+/).filter(word => word.length > 0);
    
    // Take the last 2-3 words as potential label
    const labelWords = words.slice(-3).join(' ');
    
    return labelWords || `Field ${marker.pattern}`;
  }

  private extractPotentialLabels(markers: MarkerMatch[]): string[] {
    const labels: string[] = [];
    
    for (const marker of markers) {
      const beforeText = marker.surroundingText.before;
      const words = beforeText.split(/\s+/).filter(word => word.length > 1);
      labels.push(...words.slice(-2));
    }
    
    return Array.from(new Set(labels));
  }

  private createBasicFieldAnalysis(markers: MarkerMatch[]): FieldAnalysis[] {
    return markers.map(marker => ({
      fieldName: this.generateFieldNameFromContext(marker),
      fieldType: 'text' as const,
      label: this.extractLabelFromContext(marker),
      confidence: marker.confidence,
      markers: [marker],
      contextAnalysis: {
        detectedLabels: [this.extractLabelFromContext(marker)],
        suggestedType: 'text',
        validationHints: []
      }
    }));
  }

  private createBasicFieldAnalysisFromMarkers(markers: MarkerMatch[]): FieldAnalysis {
    return {
      fieldName: this.generateFieldNameFromContext(markers[0]),
      fieldType: 'text',
      label: this.extractLabelFromContext(markers[0]),
      confidence: markers.reduce((sum, m) => sum + m.confidence, 0) / markers.length,
      markers,
      contextAnalysis: {
        detectedLabels: this.extractPotentialLabels(markers),
        suggestedType: 'text',
        validationHints: []
      }
    };
  }

  private generateValidationRules(analysis: FieldAnalysis): any {
    const rules: any = {};
    
    if (analysis.fieldType === 'date') {
      rules.format = 'date';
    } else if (analysis.fieldType === 'number') {
      rules.pattern = '^[0-9]+$';
    }
    
    // Add required validation for fields with high confidence
    if (analysis.confidence > 0.8) {
      rules.required = true;
    }
    
    return Object.keys(rules).length > 0 ? rules : undefined;
  }

  private generateDisplayOptions(analysis: FieldAnalysis): any {
    const options: any = {};
    
    if (analysis.fieldType === 'date') {
      options.dateFormat = 'yyyy-MM-dd';
    } else if (analysis.fieldType === 'multiline_text') {
      options.placeholder = 'Enter multiple lines of text...';
    }
    
    options.helpText = `Auto-detected ${analysis.fieldType} field`;
    
    return Object.keys(options).length > 0 ? options : undefined;
  }

  private createDetectionMetadata(
    markers: MarkerMatch[], 
    analyses: FieldAnalysis[], 
    startTime: number
  ): TemplateDetectionMetadata {
    return {
      detectionMethod: 'template_analysis_service',
      confidence: analyses.length > 0 
        ? analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length 
        : 0,
      totalMarkersFound: markers.length,
      processingTime: Date.now() - startTime,
      ocrAccuracy: 0.9 // Placeholder - could be calculated from OCR confidence
    };
  }

  private async detectDocumentType(fullText: string): Promise<string | undefined> {
    try {
      // Simple keyword-based detection
      const text = fullText.toLowerCase();
      
      if (text.includes('marriage') && text.includes('certificate')) return 'marriage_certificate';
      if (text.includes('birth') && text.includes('certificate')) return 'birth_certificate';
      if (text.includes('tax') && text.includes('form')) return 'tax_form';
      if (text.includes('application') && text.includes('form')) return 'application_form';
      
      return 'custom';
      
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Create an automated template from analysis results
   */
  async createAutomatedTemplate(
    filePath: string, 
    templateName: string,
    description?: string
  ): Promise<AutoTemplateCreation> {
    const analysisResult = await this.analyzeTemplate(filePath);
    
    return {
      sourceDocumentPath: filePath,
      fieldMappings: analysisResult.fieldMappings,
      detectionMetadata: analysisResult.detectionMetadata,
      templateName,
      templateDescription: description || `Auto-generated template from ${templateName}`,
      templateType: analysisResult.analysisReport.documentType || 'custom'
    };
  }

  /**
   * Convert HTTP/HTTPS URL to Google Storage URI
   * Only convert actual GCS URLs, not localhost URLs
   */
  private convertToGsUri(url: string): string {
    if (url.startsWith('gs://')) {
      return url;
    }
    
    // Don't convert localhost URLs - they should be handled via filesystem
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      return url;
    }
    
    // Only convert actual GCS URLs, not localhost object storage URLs
    if (url.includes('storage.googleapis.com') || url.includes('storage.cloud.google.com')) {
      // Extract the path after /objects/ or /public-objects/ for GCS URLs only
      const match = url.match(/\/(objects|public-objects)\/(.+)$/);
      if (match) {
        const bucketName = process.env.GOOGLE_CLOUD_BUCKET_NAME || 'default-bucket';
        return `gs://${bucketName}/${match[2]}`;
      }
    }
    
    // Return as-is for other URLs (will be handled by downloadFile)
    return url;
  }

  /**
   * Download file from Google Storage, localhost URL, or HTTP URL
   */
  private async downloadFile(uri: string): Promise<Buffer> {
    try {
      if (uri.startsWith('gs://')) {
        // Download from Google Cloud Storage (trusted internal source)
        console.log('TemplateAnalysis downloadFile: Processing GCS URI:', uri.substring(0, 30) + '...');
        const parts = uri.replace('gs://', '').split('/');
        const bucketName = parts[0];
        const fileName = parts.slice(1).join('/');
        
        const bucket = this.storage.bucket(bucketName);
        const file = bucket.file(fileName);
        
        const [buffer] = await file.download();
        console.log('TemplateAnalysis downloadFile: Downloaded GCS file successfully, size:', buffer.length, 'bytes');
        return buffer;
      } else if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
        // Handle localhost URLs by mapping to filesystem paths (development only)
        console.log('TemplateAnalysis downloadFile: Processing localhost URL securely:', uri.substring(0, 50) + '...');
        
        const url = new URL(uri);
        
        // Use secure path validation to prevent traversal attacks
        const localPath = PathValidator.mapLocalhostUrlToPath(url);
        
        // Validate file exists and check size limits
        PathValidator.validateFileExists(localPath);
        PathValidator.validateFileSize(localPath, 10 * 1024 * 1024); // 10MB limit
        
        const buffer = fs.readFileSync(localPath);
        console.log('TemplateAnalysis downloadFile: Read localhost file securely, size:', buffer.length, 'bytes');
        return buffer;
      } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
        // Download from external HTTP URL with SSRF protection
        console.log('TemplateAnalysis downloadFile: Processing external URL with SSRF protection:', uri.substring(0, 50) + '...');
        
        // Validate URL is safe for external requests
        await SSRFProtection.validateUrl(uri);
        
        // Create secure request configuration
        const requestConfig = SSRFProtection.createSecureRequestConfig(uri);
        
        // Make the request with timeout protection
        const timeoutPromise = SSRFProtection.createTimeoutPromise(requestConfig.timeout);
        
        const fetchPromise = fetch(uri, {
          method: 'GET',
          headers: requestConfig.headers,
          signal: AbortSignal.timeout(requestConfig.timeout)
        });
        
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
        }
        
        // Validate response content type
        const contentType = response.headers.get('content-type') || '';
        SSRFProtection.validateContentType(contentType);
        
        // Validate response size
        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        if (contentLength > 0) {
          SSRFProtection.validateResponseSize(contentLength);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Final size check after download
        SSRFProtection.validateResponseSize(buffer.length);
        
        console.log('TemplateAnalysis downloadFile: Downloaded external file securely, size:', buffer.length, 'bytes');
        return buffer;
      } else {
        // Local file path - validate it's safe
        console.log('TemplateAnalysis downloadFile: Processing local file path:', uri.substring(0, 50) + '...');
        
        // Ensure local paths are within allowed directories
        const resolvedPath = path.resolve(uri);
        const allowedRoots = [
          path.resolve(process.cwd(), 'uploads'),
          path.resolve(process.cwd(), 'public-objects'),
          path.resolve(process.cwd(), 'attached_assets')
        ];
        
        const isPathAllowed = allowedRoots.some(root => 
          resolvedPath.startsWith(root + path.sep) || resolvedPath === root
        );
        
        if (!isPathAllowed) {
          throw new Error(`Access denied: Local file path outside allowed directories: ${uri}`);
        }
        
        // Validate file exists and size
        PathValidator.validateFileExists(resolvedPath);
        PathValidator.validateFileSize(resolvedPath, 10 * 1024 * 1024); // 10MB limit
        
        const buffer = fs.readFileSync(resolvedPath);
        console.log('TemplateAnalysis downloadFile: Read local file securely, size:', buffer.length, 'bytes');
        return buffer;
      }
    } catch (error) {
      console.error('TemplateAnalysis downloadFile failed:', error);
      if (error instanceof Error) {
        throw new Error(`Secure file download failed: ${error.message}`);
      }
      throw new Error(`Secure file download failed: ${String(error)}`);
    }
  }

  /**
   * Detect file type from buffer and filename
   */
  private detectFileType(buffer: Buffer, fileName: string): 'pdf' | 'tiff' | 'image' | 'docx' {
    // Check PDF header
    if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF') {
      return 'pdf';
    }
    
    // Check TIFF headers (II* for little-endian, MM* for big-endian)
    if (buffer.length >= 4) {
      const header = buffer.subarray(0, 4);
      if ((header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2A && header[3] === 0x00) ||
          (header[0] === 0x4D && header[1] === 0x4D && header[2] === 0x00 && header[3] === 0x2A)) {
        return 'tiff';
      }
    }
    
    // Check ZIP/DOCX header (PK signature - 0x50, 0x4B)
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B) {
      // Check if it's a DOCX by looking for DOCX internal structure
      if (this.isDocxZipFile(buffer)) {
        return 'docx';
      }
    }
    
    // Check file extension as fallback
    const extension = fileName.toLowerCase().split('.').pop() || '';
    if (extension === 'pdf') return 'pdf';
    if (['tiff', 'tif'].includes(extension)) return 'tiff';
    if (['docx', 'doc'].includes(extension)) return 'docx';
    
    // Default to image for other file types
    return 'image';
  }
  
  /**
   * Check if a ZIP buffer contains DOCX internal structure
   */
  private isDocxZipFile(buffer: Buffer): boolean {
    try {
      // Convert buffer to string to search for DOCX signatures
      const bufferString = buffer.toString('binary');
      
      // Look for typical DOCX internal files
      const docxSignatures = [
        '[Content_Types].xml',
        'word/document.xml', 
        '_rels/.rels',
        'docProps/core.xml',
        'word/_rels/document.xml.rels'
      ];
      
      // Check if at least 2 of these signatures exist
      let signatureCount = 0;
      for (const signature of docxSignatures) {
        if (bufferString.includes(signature)) {
          signatureCount++;
          if (signatureCount >= 2) {
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      // If inspection fails, fall back to extension-based detection
      return false;
    }
  }

  /**
   * Detect actual PDF form fields from PDF file structure
   */
  private async detectPDFFormFields(filePath: string): Promise<string[]> {
    try {
      const { PDFDocument } = await import('pdf-lib');
      const fs = await import('fs');
      const path = await import('path');
      
      // Resolve the file path
      let resolvedPath = filePath;
      if (filePath.startsWith('/') && !filePath.startsWith('/home') && !filePath.startsWith('/usr')) {
        resolvedPath = path.join(process.cwd(), filePath.substring(1));
      }
      
      console.log('🔍 Scanning PDF for form fields:', resolvedPath.substring(0, 50) + '...');
      
      // Read and load the PDF
      const pdfBytes = fs.readFileSync(resolvedPath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      
      // Get form fields
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      
      const fieldNames = fields.map(field => field.getName());
      
      console.log(`📋 Found ${fieldNames.length} PDF form fields:`, fieldNames.slice(0, 10).join(', ') + (fieldNames.length > 10 ? '...' : ''));
      
      return fieldNames;
      
    } catch (error) {
      console.error('Error detecting PDF form fields:', error);
      return [];
    }
  }

  /**
   * Analyze PDF form fields and create field analyses
   */
  private async analyzeFormFields(formFieldNames: string[], fullText: string): Promise<FieldAnalysis[]> {
    const fieldAnalyses: FieldAnalysis[] = [];
    
    for (const fieldName of formFieldNames) {
      // Create field analysis based on form field name
      const analysis: FieldAnalysis = {
        fieldName: this.sanitizeFieldName(fieldName),
        fieldType: this.inferFieldTypeFromName(fieldName),
        label: this.generateLabelFromFieldName(fieldName),
        confidence: 0.95, // High confidence for actual PDF form fields
        markers: [], // PDF form fields don't have visual markers
        contextAnalysis: {
          detectedLabels: [fieldName],
          suggestedType: this.inferFieldTypeFromName(fieldName),
          validationHints: this.generateValidationHintsFromName(fieldName)
        }
      };
      
      fieldAnalyses.push(analysis);
    }
    
    console.log(`📊 Created ${fieldAnalyses.length} field analyses from PDF form fields`);
    
    return fieldAnalyses;
  }

  /**
   * Sanitize field name for use as object key
   */
  private sanitizeFieldName(fieldName: string): string {
    return fieldName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters except spaces
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
  }

  /**
   * Infer field type from field name
   */
  private inferFieldTypeFromName(fieldName: string): "text" | "date" | "number" | "boolean" | "select" | "multiline_text" | "signature" {
    const name = fieldName.toLowerCase();
    
    if (name.includes('year') || name.includes('date')) return 'date';
    if (name.includes('number') || name.includes('amount') || name.includes('balance') || name.includes('total')) return 'number';
    if (name.includes('signature')) return 'signature';
    if (name.includes('check') || name.includes('select')) return 'select';
    if (name.includes('multiline') || name.includes('textarea')) return 'multiline_text';
    if (name.includes('boolean') || name.includes('checkbox')) return 'boolean';
    
    return 'text'; // Default to text
  }

  /**
   * Generate human-readable label from field name
   */
  private generateLabelFromFieldName(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1') // Add spaces before capital letters
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/\b\w/g, l => l.toUpperCase()) // Capitalize first letter of each word
      .trim();
  }

  /**
   * Generate validation hints from field name
   */
  private generateValidationHintsFromName(fieldName: string): string[] {
    const name = fieldName.toLowerCase();
    const hints: string[] = [];
    
    if (name.includes('year')) hints.push('4-digit year format');
    if (name.includes('email')) hints.push('valid email format');
    if (name.includes('phone')) hints.push('phone number format');
    if (name.includes('tax') || name.includes('nit')) hints.push('tax identification format');
    if (name.includes('number') && !name.includes('phone')) hints.push('numeric format');
    if (name.includes('required')) hints.push('required field');
    
    return hints;
  }
}