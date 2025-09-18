import { type Template, type InsertTemplate, type ProcessingJob, type InsertProcessingJob, type User, type InsertUser, type TemplateFieldMappings, getFieldNamesFromMappings } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Template methods
  createTemplate(template: InsertTemplate): Promise<Template>;
  getTemplate(id: string): Promise<Template | undefined>;
  getTemplates(): Promise<Template[]>;
  updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined>;
  deleteTemplate(id: string): Promise<boolean>;
  
  // Processing job methods
  createProcessingJob(job: InsertProcessingJob): Promise<ProcessingJob>;
  getProcessingJob(id: string): Promise<ProcessingJob | undefined>;
  getProcessingJobs(): Promise<ProcessingJob[]>;
  updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined>;
  deleteProcessingJob(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private templates: Map<string, Template> = new Map();
  private processingJobs: Map<string, ProcessingJob> = new Map();

  constructor() {
    // Add default marriage certificate template with new fieldMappings structure
    const defaultFieldMappings: TemplateFieldMappings = {
      "serial_indicator": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 750, width: 150, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Serial Indicator',
          description: 'Certificate serial number or identifier',
          validation: { required: true, maxLength: 50 }
        }
      },
      "registry_country": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 700, width: 200, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Registry Country',
          description: 'Country where the marriage was registered',
          validation: { required: true, maxLength: 100 }
        }
      },
      "registry_department": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 650, width: 200, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Registry Department',
          description: 'Department or state where registered',
          validation: { required: true, maxLength: 100 }
        }
      },
      "registry_municipality": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 600, width: 200, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Registry Municipality',
          description: 'Municipality where registered',
          validation: { required: true, maxLength: 100 }
        }
      },
      "registry_date_of_registration": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 350, y: 600, width: 150, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'date',
          label: 'Registry Date',
          description: 'Date of registration',
          validation: { required: true, format: 'date' },
          displayOptions: { dateFormat: 'YYYY-MM-DD' }
        }
      },
      "party_a_names": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 450, width: 250, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Party A - First Names',
          description: 'First names of party A',
          validation: { required: true, maxLength: 200 }
        }
      },
      "party_a_surnames": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 400, width: 250, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Party A - Surnames',
          description: 'Surnames of party A',
          validation: { required: true, maxLength: 200 }
        }
      },
      "party_a_document_type": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 350, width: 150, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'select',
          label: 'Party A - Document Type',
          description: 'Type of identification document',
          validation: { required: true },
          displayOptions: { 
            options: ['Cedula', 'Passport', 'ID Card', 'Other'] 
          }
        }
      },
      "party_a_document_number": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 280, y: 350, width: 150, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Party A - Document Number',
          description: 'Document identification number',
          validation: { required: true, maxLength: 50 }
        }
      },
      "party_b_names": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 250, width: 250, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Party B - First Names',
          description: 'First names of party B',
          validation: { required: true, maxLength: 200 }
        }
      },
      "party_b_surnames": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 200, width: 250, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Party B - Surnames',
          description: 'Surnames of party B',
          validation: { required: true, maxLength: 200 }
        }
      },
      "party_b_document_type": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 100, y: 150, width: 150, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'select',
          label: 'Party B - Document Type',
          description: 'Type of identification document',
          validation: { required: true },
          displayOptions: { 
            options: ['Cedula', 'Passport', 'ID Card', 'Other'] 
          }
        }
      },
      "party_b_document_number": {
        instances: [{
          coordinates: {
            page: 1,
            rect: { x: 280, y: 150, width: 150, height: 20 },
            units: 'pdf_points',
            origin: 'bottom-left'
          },
          detectionConfidence: 0.95,
          detectionMethod: 'template_predefined'
        }],
        fieldDefinition: {
          type: 'text',
          label: 'Party B - Document Number',
          description: 'Document identification number',
          validation: { required: true, maxLength: 50 }
        }
      }
    };

    const defaultTemplate: Template = {
      id: "default-marriage-cert",
      name: "Marriage Certificate Template",
      description: "National Civil Registry format",
      filePath: "/public-objects/templates/marriage_certificate_template.pdf",
      fieldMappings: defaultFieldMappings,
      isAutoCreated: false,
      sourceDocumentPath: null,
      templateType: "marriage_certificate",
      detectionMetadata: {
        detectionMethod: "template_predefined",
        confidence: 1.0,
        totalMarkersFound: Object.keys(defaultFieldMappings).length,
        processingTime: 0,
        ocrAccuracy: 1.0
      },
      validationRules: {
        globalRules: {
          requireAllFields: true,
          allowPartialFill: false,
          formCompletionThreshold: 100
        }
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.templates.set(defaultTemplate.id, defaultTemplate);
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Template methods
  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const id = randomUUID();
    const template: Template = { 
      id,
      name: insertTemplate.name,
      description: insertTemplate.description ?? null,
      filePath: insertTemplate.filePath,
      fieldMappings: insertTemplate.fieldMappings,
      isAutoCreated: insertTemplate.isAutoCreated ?? false,
      sourceDocumentPath: insertTemplate.sourceDocumentPath ?? null,
      templateType: insertTemplate.templateType ?? null,
      detectionMetadata: insertTemplate.detectionMetadata ?? null,
      validationRules: insertTemplate.validationRules ?? {},
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.templates.set(id, template);
    return template;
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    return this.templates.get(id);
  }

  async getTemplates(): Promise<Template[]> {
    return Array.from(this.templates.values());
  }

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined> {
    const template = this.templates.get(id);
    if (!template) return undefined;

    const updatedTemplate = { ...template, ...updates };
    this.templates.set(id, updatedTemplate);
    return updatedTemplate;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return this.templates.delete(id);
  }

  // Processing job methods
  async createProcessingJob(insertJob: InsertProcessingJob): Promise<ProcessingJob> {
    const id = randomUUID();
    const job: ProcessingJob = {
      ...insertJob,
      id,
      extractedData: insertJob.extractedData ?? {},
      templateId: insertJob.templateId ?? null,
      extractedFieldValues: insertJob.extractedFieldValues ?? {},
      errorMessage: null,
      generatedDocumentPath: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.processingJobs.set(id, job);
    return job;
  }

  async getProcessingJob(id: string): Promise<ProcessingJob | undefined> {
    return this.processingJobs.get(id);
  }

  async getProcessingJobs(): Promise<ProcessingJob[]> {
    return Array.from(this.processingJobs.values()).sort(
      (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
    );
  }

  async updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined> {
    const job = this.processingJobs.get(id);
    if (!job) return undefined;

    const updatedJob = { 
      ...job, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.processingJobs.set(id, updatedJob);
    return updatedJob;
  }

  async deleteProcessingJob(id: string): Promise<boolean> {
    return this.processingJobs.delete(id);
  }
}

export const storage = new MemStorage();
