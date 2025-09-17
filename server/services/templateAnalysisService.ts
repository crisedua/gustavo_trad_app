import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';
import { OCRService } from './ocrService';
import OpenAI from "openai";
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as fs from 'fs';
import * as path from 'path';
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

  // Common marker patterns for detection
  private readonly MARKER_PATTERNS = [
    { pattern: /X{3,}/g, name: 'XXX_pattern', minLength: 3 },
    { pattern: /X{2}/g, name: 'XX_pattern', minLength: 2 },
    { pattern: /__{2,}/g, name: 'underscore_pattern', minLength: 2 },
    { pattern: /\.{3,}/g, name: 'dot_pattern', minLength: 3 },
    { pattern: /-{3,}/g, name: 'dash_pattern', minLength: 3 },
    { pattern: /\[.*?\]/g, name: 'bracket_pattern', minLength: 1 },
    { pattern: /\{.*?\}/g, name: 'brace_pattern', minLength: 1 },
    { pattern: /\(\s*\)/g, name: 'empty_parentheses', minLength: 1 },
    { pattern: /\[\s*\]/g, name: 'empty_brackets', minLength: 1 },
    // Custom patterns for form fields
    { pattern: /____+/g, name: 'long_underscore', minLength: 4 },
    { pattern: /\.\.\.+/g, name: 'ellipsis_pattern', minLength: 3 },
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
   * Main entry point for template analysis
   */
  async analyzeTemplate(filePath: string): Promise<TemplateAnalysisResult> {
    const startTime = Date.now();
    
    try {
      console.log('Starting template analysis for:', filePath.substring(0, 50) + '...');
      
      // Step 1: Extract text and detailed OCR data
      const { fullText, detailedResults } = await this.extractDetailedOCRData(filePath);
      console.log('✅ OCR extraction completed, text length:', fullText.length);
      
      // Step 2: Detect markers with position data
      const markers = await this.detectMarkersWithPositions(detailedResults);
      console.log('✅ Marker detection completed, found:', markers.length, 'markers');
      
      // Step 3: Analyze fields and generate names
      const fieldAnalyses = await this.analyzeFields(markers, fullText);
      console.log('✅ Field analysis completed, identified:', fieldAnalyses.length, 'fields');
      
      // Step 4: Generate field mappings structure
      const fieldMappings = await this.generateFieldMappings(fieldAnalyses);
      console.log('✅ Field mappings generated');
      
      // Step 5: Create detection metadata
      const detectionMetadata = this.createDetectionMetadata(markers, fieldAnalyses, startTime);
      
      // Step 6: Generate analysis report
      const analysisReport = {
        totalMarkersFound: markers.length,
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
          // Convert localhost URL to filesystem path
          const url = new URL(filePath);
          let localPath = '';
          
          if (url.pathname.startsWith('/public-objects/')) {
            // Map /public-objects/ to the actual filesystem directory
            localPath = path.join(process.cwd(), 'public-objects', url.pathname.substring('/public-objects/'.length));
          } else if (url.pathname.startsWith('/objects/')) {
            // Map /objects/ to uploads directory 
            localPath = path.join(process.cwd(), 'uploads', url.pathname.substring('/objects/'.length));
          } else {
            // Try direct file access in current directory
            localPath = path.join(process.cwd(), url.pathname.substring(1));
          }
          
          console.log('TemplateAnalysis: Mapped localhost URL to filesystem path:', localPath);
          
          // Check if file exists and read it
          if (!fs.existsSync(localPath)) {
            throw new Error(`File not found at filesystem path: ${localPath}`);
          }
          
          const fileBuffer = fs.readFileSync(localPath);
          const fileType = this.detectFileType(fileBuffer, filePath);
          
          if (fileType === 'pdf') {
            detailedResults = await this.extractPDFTextWithPositions(fileBuffer);
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
      
      // Load PDF document
      const doc = await pdfjsLib.getDocument({ data: pdfBuffer }).promise;
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
        model: "gpt-4",
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
   */
  private convertToGsUri(url: string): string {
    if (url.startsWith('gs://')) {
      return url;
    }
    
    // Simple conversion for Replit object storage URLs
    if (url.includes('/objects/') || url.includes('/public-objects/')) {
      // Extract the path after /objects/ or /public-objects/
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
   * Download file from Google Storage or HTTP URL
   */
  private async downloadFile(uri: string): Promise<Buffer> {
    if (uri.startsWith('gs://')) {
      // Download from Google Cloud Storage
      const parts = uri.replace('gs://', '').split('/');
      const bucketName = parts[0];
      const fileName = parts.slice(1).join('/');
      
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(fileName);
      
      const [buffer] = await file.download();
      return buffer;
    } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
      // Download from HTTP URL
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } else {
      // Local file path
      const fs = await import('fs');
      return fs.readFileSync(uri);
    }
  }

  /**
   * Detect file type from buffer and filename
   */
  private detectFileType(buffer: Buffer, fileName: string): 'pdf' | 'image' {
    // Check file extension first
    const extension = fileName.toLowerCase().split('.').pop();
    if (extension === 'pdf') {
      return 'pdf';
    }
    
    // Check magic bytes for PDF
    if (buffer.length >= 4) {
      const header = buffer.subarray(0, 4).toString();
      if (header === '%PDF') {
        return 'pdf';
      }
    }
    
    // Default to image for other file types
    return 'image';
  }
}