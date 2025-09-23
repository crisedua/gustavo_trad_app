import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTemplateSchema, updateTemplateSchema, insertProcessingJobSchema } from "@shared/schema";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { OCRService } from "./services/ocrService";
import { FieldExtractionService } from "./services/fieldExtractionService";
import { DocumentGenerationService } from "./services/documentGenerationService";
import { TemplateAnalysisService } from "./services/templateAnalysisService";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";

const upload = multer({ dest: 'uploads/' });

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Initialize services
  const objectStorageService = new ObjectStorageService();
  const ocrService = new OCRService();
  const fieldExtractionService = new FieldExtractionService();
  const documentGenerationService = new DocumentGenerationService();
  const templateAnalysisService = new TemplateAnalysisService();

  // Serve public objects (templates, etc.)
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // Serve private objects (uploaded documents, generated files)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Get upload URL for documents
  app.post("/api/objects/upload", async (req, res) => {
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Templates API
  app.get("/api/templates", async (req, res) => {
    try {
      const templates = await storage.getTemplates();
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Utility function to convert legacy fields array to new fieldMappings structure
  function convertLegacyFieldsToMappings(legacyFields: any[]): any {
    const fieldMappings: any = {};
    
    legacyFields.forEach((field, index) => {
      const fieldName = field.name || `field_${index}`;
      fieldMappings[fieldName] = {
        instances: [{
          coordinates: {
            page: 1,
            rect: {
              x: field.x || 0,
              y: field.y || 0,
              width: field.width || 100,
              height: field.height || 20
            },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.8
        }],
        fieldDefinition: {
          type: field.type || 'text',
          label: field.label || field.name || `Field ${index + 1}`,
          description: field.description,
          validation: field.validation || {},
          displayOptions: field.displayOptions || {}
        },
        detectionSummary: {
          totalInstancesFound: 1,
          averageConfidence: 0.8,
          detectionMethod: 'legacy_conversion'
        }
      };
    });
    
    return fieldMappings;
  }

  // Helper function to validate file types
  function validateFileType(file: Express.Multer.File): { valid: boolean; error?: string } {
    const allowedMimeTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/tiff',
      'image/bmp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/octet-stream' // Sometimes DOCX files are detected as this
    ];
    
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.tiff', '.tif', '.bmp', '.docx'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return { 
        valid: false, 
        error: `Unsupported file type: ${file.mimetype}. Supported types: PDF, PNG, JPEG, GIF, TIFF, BMP` 
      };
    }
    
    if (!allowedExtensions.includes(fileExtension)) {
      return { 
        valid: false, 
        error: `Unsupported file extension: ${fileExtension}. Supported extensions: ${allowedExtensions.join(', ')}` 
      };
    }
    
    return { valid: true };
  }

  // Helper function to sanitize detection metadata for API response
  function sanitizeDetectionMetadata(metadata: any): any {
    if (!metadata) return metadata;
    
    const sanitized = { ...metadata };
    // Remove potentially sensitive file paths
    delete sanitized.sourceFilePath;
    
    // Keep only safe metadata for API response
    return {
      autoDetected: sanitized.autoDetected,
      analysisTimestamp: sanitized.analysisTimestamp,
      originalFilename: sanitized.originalFilename,
      analysisError: sanitized.analysisError,
      manualConfiguration: sanitized.manualConfiguration,
      // Include detection stats but not file paths
      detectionMethod: sanitized.detectionMethod,
      confidence: sanitized.confidence,
      totalMarkersFound: sanitized.totalMarkersFound,
      processingTime: sanitized.processingTime,
      ocrAccuracy: sanitized.ocrAccuracy
    };
  }

  app.post("/api/templates", upload.single('templateFile'), async (req, res) => {
    try {
      const { name, description, fields, autoAnalyze = 'true' } = req.body;
      const templateFile = req.file;

      if (!templateFile) {
        return res.status(400).json({ error: "Template file is required" });
      }

      if (!name) {
        return res.status(400).json({ error: "Template name is required" });
      }

      // Check for duplicate template names
      const allTemplates = await storage.getTemplates();
      const duplicateName = allTemplates.find((t: any) => 
        t.name.toLowerCase().trim() === name.toLowerCase().trim()
      );
      
      if (duplicateName) {
        // Clean up uploaded file
        try {
          fs.unlinkSync(templateFile.path);
        } catch (cleanupError) {
          console.warn('Failed to clean up temp file:', templateFile.path);
        }
        
        console.log(`❌ Duplicate template name "${name}" already exists`);
        return res.status(409).json({ 
          error: `Template name "${name}" already exists. Please choose a different name.` 
        });
      }

      // Validate file type
      const fileValidation = validateFileType(templateFile);
      if (!fileValidation.valid) {
        // Clean up the temp file
        try {
          fs.unlinkSync(templateFile.path);
        } catch (cleanupError) {
          console.warn('Failed to clean up temp file:', templateFile.path);
        }
        return res.status(400).json({ error: fileValidation.error });
      }

      // Parse fields if provided as string (legacy format)
      // Convert to new fieldMappings format or provide empty structure
      let fieldMappings = {};
      let detectionMetadata = {};
      
      if (fields) {
        try {
          const parsedFields = JSON.parse(fields);
          // Convert legacy fields array to new fieldMappings structure
          if (Array.isArray(parsedFields)) {
            fieldMappings = convertLegacyFieldsToMappings(parsedFields);
          } else {
            fieldMappings = parsedFields; // Assume it's already in the correct format
          }
        } catch (error) {
          return res.status(400).json({ error: "Invalid fields format" });
        }
      }

      // Automatically analyze template if no fields provided or autoAnalyze is enabled
      const shouldAutoAnalyze = !fields || autoAnalyze === 'true';
      
      if (shouldAutoAnalyze) {
        try {
          console.log('Starting automated template analysis for:', name);
          
          // Analyze the uploaded template file for field mappings
          const analysisResult = await templateAnalysisService.analyzeTemplate(templateFile.path);
          
          // Use the automatically detected field mappings
          fieldMappings = analysisResult.fieldMappings;
          detectionMetadata = {
            ...analysisResult.detectionMetadata,
            autoDetected: true,
            analysisTimestamp: new Date().toISOString(),
            sourceFilePath: templateFile.path,
            originalFilename: templateFile.originalname
          };
          
          console.log('✅ Automated template analysis completed:', {
            fieldsDetected: analysisResult.analysisReport.fieldsIdentified,
            markersFound: analysisResult.analysisReport.totalMarkersFound,
            averageConfidence: analysisResult.analysisReport.averageConfidence,
            processingTime: analysisResult.analysisReport.processingTime
          });
          
        } catch (analysisError) {
          console.error('Template analysis failed:', analysisError);
          
          // Don't fail the template creation, just log the error and continue with manual fields
          console.log('Continuing with manual field mappings due to analysis failure');
          
          // Create basic detection metadata indicating analysis failed
          detectionMetadata = {
            autoDetected: false,
            analysisError: analysisError instanceof Error ? analysisError.message : String(analysisError),
            analysisTimestamp: new Date().toISOString(),
            sourceFilePath: templateFile.path,
            originalFilename: templateFile.originalname
          };
        }
      } else {
        // Manual field mapping
        detectionMetadata = {
          autoDetected: false,
          manualConfiguration: true,
          analysisTimestamp: new Date().toISOString(),
          sourceFilePath: templateFile.path,
          originalFilename: templateFile.originalname
        };
      }

      // CRITICAL FIX: Move uploaded file to proper storage location
      // Generate a safe filename with extension preservation
      const fileExtension = path.extname(templateFile.originalname);
      const safeFileName = `${templateFile.filename}${fileExtension}`;
      const publicTemplateDir = path.join(process.cwd(), 'public-objects', 'templates');
      const destinationPath = path.join(publicTemplateDir, safeFileName);
      
      // Ensure the templates directory exists
      if (!fs.existsSync(publicTemplateDir)) {
        fs.mkdirSync(publicTemplateDir, { recursive: true });
      }
      
      try {
        // Move file from uploads/ to public-objects/templates/
        fs.renameSync(templateFile.path, destinationPath);
        console.log(`✅ Template file moved from ${templateFile.path} to ${destinationPath}`);
      } catch (moveError) {
        console.error('Failed to move template file:', moveError);
        // Clean up temp file if move failed
        try {
          fs.unlinkSync(templateFile.path);
        } catch (cleanupError) {
          console.warn('Failed to clean up temp file after move failure:', templateFile.path);
        }
        return res.status(500).json({ error: "Failed to store template file" });
      }

      // Set template path to match actual file location for document generation
      const templatePath = `public-objects/templates/${safeFileName}`;

      // Sanitize detection metadata before storing and responding
      const sanitizedDetectionMetadata = sanitizeDetectionMetadata(detectionMetadata);

      const templateData = insertTemplateSchema.parse({
        name,
        description: description || null,
        filePath: templatePath,
        fieldMappings,
        detectionMetadata: sanitizedDetectionMetadata
      });

      const template = await storage.createTemplate(templateData);
      
      // Include analysis results in response for frontend feedback (with sanitized data)
      const response = {
        ...template,
        // Ensure detection metadata in response is also sanitized
        detectionMetadata: sanitizedDetectionMetadata,
        autoAnalysisPerformed: shouldAutoAnalyze,
        ...(shouldAutoAnalyze && {
          analysisResults: {
            fieldsDetected: Object.keys(fieldMappings).length,
            analysisSuccessful: !(sanitizedDetectionMetadata as any).analysisError,
            processingTime: (sanitizedDetectionMetadata as any).processingTime || 0
          }
        })
      };
      
      res.status(201).json(response);
    } catch (error) {
      console.error("Error creating template:", error);
      
      // Clean up any files if template creation failed after file was moved
      if (req.file) {
        const fileExtension = path.extname(req.file.originalname);
        const safeFileName = `${req.file.filename}${fileExtension}`;
        const publicTemplateDir = path.join(process.cwd(), 'public-objects', 'templates');
        const destinationPath = path.join(publicTemplateDir, safeFileName);
        
        try {
          if (fs.existsSync(destinationPath)) {
            fs.unlinkSync(destinationPath);
            console.log('✅ Cleaned up template file after failed creation:', destinationPath);
          }
        } catch (cleanupError) {
          console.warn('Failed to clean up template file after failed creation:', cleanupError);
        }
        
        // Also clean up original temp file if it still exists
        try {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
            console.log('✅ Cleaned up temp file after failed creation:', req.file.path);
          }
        } catch (cleanupError) {
          console.warn('Failed to clean up temp file after failed creation:', cleanupError);
        }
      }
      
      res.status(500).json({ error: "Failed to create template" });
    }
  });

  app.get("/api/templates/:id", async (req, res) => {
    try {
      const template = await storage.getTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.json(template);
    } catch (error) {
      console.error("Error fetching template:", error);
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });

  app.patch("/api/templates/:id", async (req, res) => {
    try {
      const templateId = req.params.id;
      
      console.log(`📝 Template update request for ID: ${templateId}`, req.body);
      
      // Check if template exists
      const existingTemplate = await storage.getTemplate(templateId);
      if (!existingTemplate) {
        console.log(`❌ Template ${templateId} not found`);
        return res.status(404).json({ error: "Template not found" });
      }

      // Validate updates using the updateTemplateSchema
      const updates = updateTemplateSchema.parse(req.body);
      
      // Ensure name is not empty if provided
      if (updates.name !== undefined && !updates.name.trim()) {
        return res.status(400).json({ error: "Template name cannot be empty" });
      }

      // Check for duplicate template names (excluding current template)
      if (updates.name && updates.name.trim() !== existingTemplate.name) {
        const allTemplates = await storage.getTemplates();
        const duplicateName = allTemplates.find((t: any) => 
          t.id !== templateId && 
          t.name.toLowerCase().trim() === updates.name!.toLowerCase().trim()
        );
        
        if (duplicateName) {
          console.log(`❌ Duplicate template name "${updates.name}" already exists`);
          return res.status(409).json({ 
            error: `Template name "${updates.name}" already exists. Please choose a different name.` 
          });
        }
      }

      console.log(`✅ Updating template ${templateId} with:`, updates);

      // Update the template
      const updatedTemplate = await storage.updateTemplate(templateId, updates);
      if (!updatedTemplate) {
        console.log(`❌ Failed to update template ${templateId}`);
        return res.status(500).json({ error: "Failed to update template" });
      }

      console.log(`✅ Template ${templateId} updated successfully: "${updatedTemplate.name}"`);
      res.json(updatedTemplate);
    } catch (error) {
      console.error("Error updating template:", error);
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid template data", details: (error as any).errors });
      }
      res.status(500).json({ error: "Failed to update template" });
    }
  });

  app.delete("/api/templates/:id", async (req, res) => {
    try {
      const templateId = req.params.id;
      const force = req.query.force === 'true';
      
      // Check if template exists
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Check if template is being used by any processing jobs
      const jobs = await storage.getProcessingJobs();
      const templatesInUse = jobs.filter((job: any) => job.templateId === templateId);
      
      if (templatesInUse.length > 0 && !force) {
        return res.status(400).json({ 
          error: "Cannot delete template that is being used by processing jobs",
          jobsCount: templatesInUse.length,
          message: "Add ?force=true to delete template and cleanup associated jobs"
        });
      }
      
      // If force delete, clean up associated jobs first
      if (force && templatesInUse.length > 0) {
        console.log(`🗑️ Force deleting template ${templateId} and cleaning up ${templatesInUse.length} associated jobs`);
        
        for (const job of templatesInUse) {
          try {
            await storage.deleteProcessingJob(job.id);
            console.log(`✅ Deleted job ${job.id}`);
          } catch (error) {
            console.warn(`⚠️ Failed to delete job ${job.id}:`, error);
          }
        }
        
        console.log(`✅ Cleaned up ${templatesInUse.length} associated processing jobs`);
      }

      // Delete the template
      const deleted = await storage.deleteTemplate(templateId);
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete template" });
      }

      // Clean up template file from storage
      try {
        // Fix: template.filePath already contains 'public-objects/templates/', so join directly with cwd
        const templateFilePath = path.join(process.cwd(), template.filePath);
        if (fs.existsSync(templateFilePath)) {
          fs.unlinkSync(templateFilePath);
          console.log(`✅ Template file deleted: ${templateFilePath}`);
        } else {
          console.warn(`⚠️ Template file not found for cleanup: ${templateFilePath}`);
        }
      } catch (fileCleanupError) {
        console.error('Failed to clean up template file:', fileCleanupError);
        // Don't fail the deletion if file cleanup fails
      }

      res.json({ success: true, message: "Template deleted successfully" });
    } catch (error) {
      console.error("Error deleting template:", error);
      res.status(500).json({ error: "Failed to delete template" });
    }
  });

  // Template Analysis API - Analyze document for markers and field positions
  app.post("/api/templates/analyze", async (req, res) => {
    try {
      const { filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: "filePath is required" });
      }

      console.log('Starting template analysis for:', filePath);

      // Analyze the template using the new service
      const analysisResult = await templateAnalysisService.analyzeTemplate(filePath);

      res.json({
        success: true,
        analysis: analysisResult,
        message: `Analysis completed: found ${analysisResult.analysisReport.fieldsIdentified} fields from ${analysisResult.analysisReport.totalMarkersFound} markers`
      });

    } catch (error) {
      console.error("Error analyzing template:", error);
      res.status(500).json({ 
        error: "Template analysis failed", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Auto-create template from analysis results
  app.post("/api/templates/auto-create", async (req, res) => {
    try {
      const { filePath, templateName, description } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: "filePath is required" });
      }

      if (!templateName) {
        return res.status(400).json({ error: "templateName is required" });
      }

      console.log('Creating automated template:', templateName);

      // Create automated template
      const autoTemplate = await templateAnalysisService.createAutomatedTemplate(
        filePath, 
        templateName, 
        description
      );

      // Save the template to storage
      const templateData = insertTemplateSchema.parse({
        name: autoTemplate.templateName,
        description: autoTemplate.templateDescription || null,
        filePath: autoTemplate.sourceDocumentPath,
        isAutoCreated: true,
        sourceDocumentPath: autoTemplate.sourceDocumentPath,
        templateType: autoTemplate.templateType,
        detectionMetadata: autoTemplate.detectionMetadata,
        fieldMappings: autoTemplate.fieldMappings,
        validationRules: {} // Default empty validation rules
      });

      const template = await storage.createTemplate(templateData);

      res.status(201).json({
        success: true,
        template,
        analysisResults: {
          fieldsDetected: Object.keys(autoTemplate.fieldMappings).length,
          documentType: autoTemplate.templateType,
          confidence: autoTemplate.detectionMetadata?.confidence || 0
        },
        message: `Template created successfully with ${Object.keys(autoTemplate.fieldMappings).length} detected fields`
      });

    } catch (error) {
      console.error("Error creating automated template:", error);
      res.status(500).json({ 
        error: "Failed to create automated template", 
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Processing Jobs API
  app.get("/api/processing-jobs", async (req, res) => {
    try {
      const jobs = await storage.getProcessingJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching processing jobs:", error);
      res.status(500).json({ error: "Failed to fetch processing jobs" });
    }
  });

  app.post("/api/processing-jobs", async (req, res) => {
    try {
      const { originalFilePath, userEmail, templateId } = req.body;

      if (!originalFilePath) {
        return res.status(400).json({ error: "originalFilePath is required" });
      }

      if (!userEmail) {
        return res.status(400).json({ error: "userEmail is required" });
      }

      const jobData = insertProcessingJobSchema.parse({
        originalFilePath,
        userEmail,
        templateId: templateId || null,
        status: 'pending_review',
        extractedData: {},
        extractedFieldValues: {}
      });

      const job = await storage.createProcessingJob(jobData);
      res.status(201).json(job);

      // Job created with 'pending_review' status - no automatic processing

    } catch (error) {
      console.error("Error creating processing job:", error);
      res.status(500).json({ error: "Failed to create processing job" });
    }
  });

  app.get("/api/processing-jobs/:id", async (req, res) => {
    try {
      const job = await storage.getProcessingJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Processing job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error fetching processing job:", error);
      res.status(500).json({ error: "Failed to fetch processing job" });
    }
  });

  app.patch("/api/processing-jobs/:id", async (req, res) => {
    try {
      const updates = req.body;
      const job = await storage.updateProcessingJob(req.params.id, updates);
      if (!job) {
        return res.status(404).json({ error: "Processing job not found" });
      }
      res.json(job);
    } catch (error) {
      console.error("Error updating processing job:", error);
      res.status(500).json({ error: "Failed to update processing job" });
    }
  });

  // Generate document from processing job
  app.post("/api/processing-jobs/:id/generate", async (req, res) => {
    try {
      const job = await storage.getProcessingJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Processing job not found" });
      }

      if (!job.templateId) {
        return res.status(400).json({ error: "No template selected for this job" });
      }

      if (!job.extractedFieldValues) {
        return res.status(400).json({ error: "No extracted field values available for this job" });
      }

      const template = await storage.getTemplate(job.templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Update status to generation
      await storage.updateProcessingJob(job.id, { status: 'generation' });

      // Generate the document using the new method that supports both manual and auto-created templates
      const generatedPdfBuffer = await documentGenerationService.fillPDFTemplateWithTemplate(
        template, 
        job.extractedFieldValues
      );

      // TODO: Save generated document to object storage
      const generatedPath = `/generated/${job.id}_generated.pdf`;
      
      // Update job with completion
      await storage.updateProcessingJob(job.id, {
        status: 'completed',
        generatedDocumentPath: generatedPath
      });

      // Return the generated document
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="generated_document.pdf"`);
      res.send(generatedPdfBuffer);

    } catch (error) {
      console.error("Error generating document:", error);
      
      // Update job with error
      await storage.updateProcessingJob(req.params.id, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      res.status(500).json({ error: "Failed to generate document" });
    }
  });

  // Manual OCR and field processing endpoint
  app.post("/api/processing-jobs/:id/process", async (req, res) => {
    try {
      const job = await storage.getProcessingJob(req.params.id);
      if (!job) {
        return res.status(404).json({ error: "Processing job not found" });
      }

      // Update status to OCR processing
      await storage.updateProcessingJob(job.id, { status: 'ocr' });

      // Perform OCR on the original document
      console.log('Starting OCR processing for job:', job.id);
      console.log('Job data received:', {
        id: job.id,
        originalFilePath: job.originalFilePath,
        originalFilePathType: typeof job.originalFilePath,
        jobKeys: Object.keys(job),
        hasOriginalFilePath: 'originalFilePath' in job,
        hasOriginal_file_path: 'original_file_path' in job
      });
      
      const ocrResult = await ocrService.extractTextFromFile(job.originalFilePath);
      
      // Update status to version detection
      await storage.updateProcessingJob(job.id, { status: 'version_detection' });

      // 🔍 AUTOMATIC DOCUMENT VERSION DETECTION
      console.log('🔍 Starting automatic document version detection...');
      let selectedTemplate: Template | undefined = undefined;
      
      // For now, assume marriage certificate type (can be extended for other document types)
      const marriageDocType = await storage.getDocumentTypeByCode('marriage_certificate');
      
      if (marriageDocType) {
        console.log('📋 Found marriage certificate document type:', marriageDocType.id);
        
        // Detect the specific version (old vs new format)
        const detectedVersion = await storage.detectDocumentVersion(ocrResult, marriageDocType.id);
        
        if (detectedVersion) {
          console.log('✅ Document version detected:', detectedVersion.name, '(' + detectedVersion.code + ')');
          
          // Find templates for this version
          const templatesForVersion = await storage.getTemplatesByVersion(detectedVersion.id);
          
          if (templatesForVersion.length > 0) {
            selectedTemplate = templatesForVersion[0]; // Use first available template
            console.log('🎯 Selected template:', selectedTemplate.name, '(' + selectedTemplate.id + ')');
            
            // Update job with detected version and selected template
            await storage.updateProcessingJob(job.id, {
              detectedVersionId: detectedVersion.id,
              templateId: selectedTemplate.id,
              versionDetectionResults: {
                detectedVersions: [{
                  versionId: detectedVersion.id,
                  versionName: detectedVersion.name,
                  confidence: detectedVersion.detectionPatterns?.confidence || 0.8,
                  matchedPatterns: detectedVersion.detectionPatterns?.keywords || [],
                  reasoning: `Detected based on keywords and layout patterns`
                }],
                selectedVersion: {
                  versionId: detectedVersion.id,
                  confidence: detectedVersion.detectionPatterns?.confidence || 0.8,
                  autoSelected: true
                },
                ocrText: ocrResult.substring(0, 500), // Store first 500 chars
                processingTime: Date.now()
              }
            });
          } else {
            console.log('⚠️ No templates found for detected version:', detectedVersion.name);
          }
        } else {
          console.log('❌ Could not detect document version automatically');
          
          // Fallback to manual template selection if provided
          if (job.templateId) {
            selectedTemplate = await storage.getTemplate(job.templateId);
            console.log('🔄 Falling back to manually selected template:', selectedTemplate?.name);
          }
        }
      } else {
        console.log('❌ Marriage certificate document type not found in database');
        
        // Fallback to manual template selection if provided
        if (job.templateId) {
          selectedTemplate = await storage.getTemplate(job.templateId);
          console.log('🔄 Using manually selected template:', selectedTemplate?.name);
        }
      }
      
      // Update job status to extraction
      await storage.updateProcessingJob(job.id, { status: 'extraction' });

      // Perform field extraction with automatically selected or fallback template
      if (selectedTemplate) {
        console.log('Starting field extraction for job:', job.id, 'with template:', selectedTemplate.id);
        
        // Extract field values using the template
        const extractedFields = await fieldExtractionService.extractFieldsForTemplate(
          ocrResult,
          selectedTemplate
        );
        
        // Update job with extracted field values
        await storage.updateProcessingJob(job.id, {
          status: 'mapping',
          extractedData: extractedFields,
          extractedFieldValues: extractedFields
        });
      } else {
        console.log('⚠️ No template available for field extraction');
        
        // Update job with extracted OCR text only
        await storage.updateProcessingJob(job.id, {
          status: 'extraction',
          extractedData: { raw_ocr_text: ocrResult },
          extractedFieldValues: {}
        });
      }

      // Update final status to pending_review for admin to verify
      await storage.updateProcessingJob(job.id, { status: 'pending_review' });

      // Fetch and return updated job
      const updatedJob = await storage.getProcessingJob(job.id);
      res.json(updatedJob);

    } catch (error) {
      console.error("Error processing job:", error);
      
      // Update job with error
      await storage.updateProcessingJob(req.params.id, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
      
      res.status(500).json({ error: "Failed to process job" });
    }
  });

  // Delete processing job
  app.delete("/api/processing-jobs/:id", async (req, res) => {
    try {
      const jobId = req.params.id;
      
      // Check if job exists
      const job = await storage.getProcessingJob(jobId);
      if (!job) {
        return res.status(404).json({ error: "Processing job not found" });
      }

      // Delete the job
      const deleted = await storage.deleteProcessingJob(jobId);
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete processing job" });
      }

      res.json({ success: true, message: "Processing job deleted successfully" });
    } catch (error) {
      console.error("Error deleting processing job:", error);
      res.status(500).json({ error: "Failed to delete processing job" });
    }
  });

  // Async document processing function
  async function processDocument(jobId: string) {
    try {
      const job = await storage.getProcessingJob(jobId);
      if (!job) throw new Error("Job not found");

      // Update status to OCR
      await storage.updateProcessingJob(jobId, { status: 'ocr' });

      // Extract text using OCR
      let extractedText: string;
      try {
        // Use real Google Vision OCR
        extractedText = await ocrService.extractTextFromFile(job.originalFilePath);
        console.log('OCR extraction successful, text length:', extractedText.length);
      } catch (error) {
        throw new Error(`OCR failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Update status to extraction
      await storage.updateProcessingJob(jobId, { status: 'extraction' });

      // Extract fields using AI with template context
      let extractedData: Record<string, string>;
      try {
        const template = job.templateId ? await storage.getTemplate(job.templateId) : null;
        
        if (template) {
          // Use enhanced extraction for templates (both manual and auto-created)
          extractedData = await fieldExtractionService.extractFieldsForTemplate(extractedText, template);
        } else {
          // Fallback to generic extraction
          extractedData = await fieldExtractionService.extractFields(extractedText);
        }
      } catch (error) {
        throw new Error(`Field extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Update status to mapping
      await storage.updateProcessingJob(jobId, { 
        status: 'mapping',
        extractedData 
      });

      // Generate enhanced field mappings if template is selected
      let fieldMappings: Record<string, string> = {};
      if (job.templateId) {
        const template = await storage.getTemplate(job.templateId);
        if (template) {
          try {
            // Use enhanced field mapping for both manual and auto-created templates
            fieldMappings = await fieldExtractionService.enhanceFieldMappingForTemplate(
              extractedData, 
              template
            );
            console.log(`Enhanced field mapping completed for ${template.isAutoCreated ? 'auto-created' : 'manual'} template`);
          } catch (error) {
            console.error("Enhanced field mapping failed, using basic mapping:", error);
            // Fallback to basic mapping
            const templateFields = Object.keys(template.fieldMappings);
            try {
              fieldMappings = await fieldExtractionService.enhanceFieldMapping(
                extractedData, 
                templateFields
              );
            } catch (fallbackError) {
              console.error("Basic field mapping also failed:", fallbackError);
              // Final fallback to direct mapping
              fieldMappings = extractedData;
            }
          }
        }
      }

      // Update job with final results
      await storage.updateProcessingJob(jobId, {
        status: 'completed',
        extractedFieldValues: fieldMappings,
        extractedData
      });

    } catch (error) {
      console.error(`Processing job ${jobId} failed:`, error);
      await storage.updateProcessingJob(jobId, {
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}
