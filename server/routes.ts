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

      // TODO: Upload template file to object storage
      // For now, store locally 
      const templatePath = `/templates/${templateFile.filename}`;

      const templateData = insertTemplateSchema.parse({
        name,
        description: description || null,
        filePath: templatePath,
        fieldMappings,
        detectionMetadata
      });

      const template = await storage.createTemplate(templateData);
      
      // Include analysis results in response for frontend feedback
      const response = {
        ...template,
        autoAnalysisPerformed: shouldAutoAnalyze,
        ...(shouldAutoAnalyze && {
          analysisResults: {
            fieldsDetected: Object.keys(fieldMappings).length,
            analysisSuccessful: !(detectionMetadata as any).analysisError,
            processingTime: (detectionMetadata as any).processingTime || 0
          }
        })
      };
      
      res.status(201).json(response);
    } catch (error) {
      console.error("Error creating template:", error);
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
      
      // Check if template exists
      const existingTemplate = await storage.getTemplate(templateId);
      if (!existingTemplate) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Validate updates using the updateTemplateSchema
      const updates = updateTemplateSchema.parse(req.body);
      
      // Ensure name is not empty if provided
      if (updates.name !== undefined && !updates.name.trim()) {
        return res.status(400).json({ error: "Template name cannot be empty" });
      }

      // Update the template
      const updatedTemplate = await storage.updateTemplate(templateId, updates);
      if (!updatedTemplate) {
        return res.status(500).json({ error: "Failed to update template" });
      }

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
      
      // Check if template exists
      const template = await storage.getTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }

      // Check if template is being used by any processing jobs
      const jobs = await storage.getProcessingJobs();
      const templatesInUse = jobs.filter(job => job.templateId === templateId);
      if (templatesInUse.length > 0) {
        return res.status(400).json({ 
          error: "Cannot delete template that is being used by processing jobs",
          jobsCount: templatesInUse.length
        });
      }

      // Delete the template
      const deleted = await storage.deleteTemplate(templateId);
      if (!deleted) {
        return res.status(500).json({ error: "Failed to delete template" });
      }

      // TODO: Clean up template file from object storage
      // For now, just log the file path that should be cleaned up
      console.log(`Template deleted, should clean up file: ${template.filePath}`);

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
        validationRules: null // Will be added later if needed
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
      const { originalFilePath, templateId } = req.body;

      if (!originalFilePath) {
        return res.status(400).json({ error: "originalFilePath is required" });
      }

      const jobData = insertProcessingJobSchema.parse({
        originalFilePath,
        templateId: templateId || null,
        status: 'uploading',
        extractedData: null
      });

      const job = await storage.createProcessingJob(jobData);
      res.status(201).json(job);

      // Start processing asynchronously
      processDocument(job.id).catch(error => {
        console.error("Document processing failed:", error);
      });

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

      // Generate the document
      // For demo purposes, we'll create a simple PDF with the extracted data
      // In production, you'd use the actual template file
      const generatedPdfBuffer = await documentGenerationService.fillPDFTemplate(
        template.filePath, 
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

      // Extract fields using AI
      let extractedData: Record<string, string>;
      try {
        const template = job.templateId ? await storage.getTemplate(job.templateId) : null;
        const templateFields = template ? Object.keys(template.fieldMappings) : [];
        
        extractedData = await fieldExtractionService.extractFields(extractedText, templateFields);
      } catch (error) {
        throw new Error(`Field extraction failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Update status to mapping
      await storage.updateProcessingJob(jobId, { 
        status: 'mapping',
        extractedData 
      });

      // Generate field mappings if template is selected
      let fieldMappings: Record<string, string> = {};
      if (job.templateId) {
        const template = await storage.getTemplate(job.templateId);
        if (template) {
          try {
            fieldMappings = await fieldExtractionService.enhanceFieldMapping(
              extractedData, 
              Object.keys(template.fieldMappings)
            );
          } catch (error) {
            console.error("Field mapping failed:", error);
            // Continue with direct mapping
            fieldMappings = extractedData;
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
