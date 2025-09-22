import { eq, desc } from 'drizzle-orm';
import { db } from '../db.js';
import { users, templates, processingJobs } from '@shared/schema';
import { type Template, type InsertTemplate, type ProcessingJob, type InsertProcessingJob, type User, type InsertUser, type TemplateFieldMappings } from "@shared/schema";
import { type IStorage } from '../storage.js';

export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  // Template methods
  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const result = await db.insert(templates).values(insertTemplate).returning();
    return result[0];
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const result = await db.select().from(templates).where(eq(templates.id, id)).limit(1);
    return result[0];
  }

  async getTemplates(): Promise<Template[]> {
    return await db.select().from(templates);
  }

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined> {
    const result = await db.update(templates).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(templates.id, id)).returning();
    return result[0];
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const result = await db.delete(templates).where(eq(templates.id, id)).returning();
    return result.length > 0;
  }

  // Processing job methods
  async createProcessingJob(insertJob: InsertProcessingJob): Promise<ProcessingJob> {
    const result = await db.insert(processingJobs).values(insertJob).returning();
    return result[0];
  }

  async getProcessingJob(id: string): Promise<ProcessingJob | undefined> {
    const result = await db.select().from(processingJobs).where(eq(processingJobs.id, id)).limit(1);
    return result[0];
  }

  async getProcessingJobs(): Promise<ProcessingJob[]> {
    return await db.select().from(processingJobs).orderBy(desc(processingJobs.createdAt));
  }

  async updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined> {
    const result = await db.update(processingJobs).set({
      ...updates,
      updatedAt: new Date()
    }).where(eq(processingJobs.id, id)).returning();
    return result[0];
  }

  async deleteProcessingJob(id: string): Promise<boolean> {
    const result = await db.delete(processingJobs).where(eq(processingJobs.id, id)).returning();
    return result.length > 0;
  }

  // Initialize default templates
  async initializeDefaultTemplates(): Promise<void> {
    // Check if default template already exists
    const existingDefault = await db.select().from(templates).where(eq(templates.id, "default-marriage-cert")).limit(1);
    if (existingDefault.length > 0) {
      console.log('Default template already exists, skipping initialization');
      return;
    }

    // Add default marriage certificate template
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

    const defaultTemplate: InsertTemplate = {
      name: "Marriage Certificate Template",
      description: "National Civil Registry format", 
      filePath: "/public-objects/templates/6f14972ca0ffbc137936e5f03eba3231.pdf",
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
      }
    };

    await db.insert(templates).values({ ...defaultTemplate, id: "default-marriage-cert" });
  }
}