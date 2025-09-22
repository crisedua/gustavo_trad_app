import { supabase } from '../supabase.js';
import { type Template, type InsertTemplate, type ProcessingJob, type InsertProcessingJob, type User, type InsertUser, type TemplateFieldMappings } from "@shared/schema";
import { type IStorage } from '../storage.js';

export class SupabaseStorage implements IStorage {
  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching user:', error);
      return undefined;
    }
    return data;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error) {
      console.error('Error fetching user by username:', error);
      return undefined;
    }
    return data;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert(insertUser)
      .select()
      .single();
    
    if (error) {
      console.error('Error creating user:', error);
      throw error;
    }
    return data;
  }

  // Template methods
  async createTemplate(insertTemplate: InsertTemplate): Promise<Template> {
    const { data, error } = await supabase
      .from('templates')
      .insert({
        name: insertTemplate.name,
        description: insertTemplate.description,
        file_path: insertTemplate.filePath,
        is_auto_created: insertTemplate.isAutoCreated,
        source_document_path: insertTemplate.sourceDocumentPath,
        template_type: insertTemplate.templateType,
        detection_metadata: insertTemplate.detectionMetadata,
        field_mappings: insertTemplate.fieldMappings,  // snake_case column
        fieldMappings: insertTemplate.fieldMappings,   // camelCase column
        validation_rules: insertTemplate.validationRules,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating template:', error);
      throw error;
    }
    return data;
  }

  async getTemplate(id: string): Promise<Template | undefined> {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching template:', error);
      return undefined;
    }
    return data;
  }

  async getTemplates(): Promise<Template[]> {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching templates:', error);
      return [];
    }
    return data || [];
  }

  async updateTemplate(id: string, updates: Partial<Template>): Promise<Template | undefined> {
    // Map camelCase properties to snake_case column names
    const dbUpdates: any = {
      updated_at: new Date().toISOString()
    };
    
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.description !== undefined) dbUpdates.description = updates.description;
    if (updates.filePath !== undefined) dbUpdates.file_path = updates.filePath;
    if (updates.isAutoCreated !== undefined) dbUpdates.is_auto_created = updates.isAutoCreated;
    if (updates.sourceDocumentPath !== undefined) dbUpdates.source_document_path = updates.sourceDocumentPath;
    if (updates.templateType !== undefined) dbUpdates.template_type = updates.templateType;
    if (updates.detectionMetadata !== undefined) dbUpdates.detection_metadata = updates.detectionMetadata;
    if (updates.fieldMappings !== undefined) {
      dbUpdates.field_mappings = updates.fieldMappings;
      dbUpdates.fieldMappings = updates.fieldMappings; // Populate both columns
    }
    if (updates.validationRules !== undefined) dbUpdates.validation_rules = updates.validationRules;
    
    const { data, error } = await supabase
      .from('templates')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating template:', error);
      return undefined;
    }
    return data;
  }

  async deleteTemplate(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('templates')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting template:', error);
      return false;
    }
    return true;
  }

  // Processing job methods
  async createProcessingJob(insertJob: InsertProcessingJob): Promise<ProcessingJob> {
    const { data, error } = await supabase
      .from('processing_jobs')
      .insert({
        original_file_path: insertJob.originalFilePath,
        user_email: insertJob.userEmail,
        status: insertJob.status,
        extracted_data: insertJob.extractedData || {},
        template_id: insertJob.templateId,
        extracted_field_values: insertJob.extractedFieldValues || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating processing job:', error);
      throw error;
    }
    return data;
  }

  async getProcessingJob(id: string): Promise<ProcessingJob | undefined> {
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching processing job:', error);
      return undefined;
    }
    return data;
  }

  async getProcessingJobs(): Promise<ProcessingJob[]> {
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching processing jobs:', error);
      return [];
    }
    return data || [];
  }

  async updateProcessingJob(id: string, updates: Partial<ProcessingJob>): Promise<ProcessingJob | undefined> {
    // Map camelCase properties to snake_case column names
    const dbUpdates: any = {
      updated_at: new Date().toISOString()
    };
    
    if (updates.originalFilePath !== undefined) dbUpdates.original_file_path = updates.originalFilePath;
    if (updates.userEmail !== undefined) dbUpdates.user_email = updates.userEmail;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.extractedData !== undefined) dbUpdates.extracted_data = updates.extractedData;
    if (updates.templateId !== undefined) dbUpdates.template_id = updates.templateId;
    if (updates.extractedFieldValues !== undefined) dbUpdates.extracted_field_values = updates.extractedFieldValues;
    
    const { data, error } = await supabase
      .from('processing_jobs')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Error updating processing job:', error);
      return undefined;
    }
    return data;
  }

  async deleteProcessingJob(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('processing_jobs')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting processing job:', error);
      return false;
    }
    return true;
  }

  // Initialize default templates
  async initializeDefaultTemplates(): Promise<void> {
    // First, check if tables exist by trying a simple query
    try {
      const { error: testError } = await supabase.from('templates').select('id').limit(1);
      if (testError && testError.message.includes('relation "public.templates" does not exist')) {
        throw new Error('Database tables do not exist. Please create the tables in your Supabase dashboard first.');
      }
    } catch (error) {
      console.error('Table existence check failed:', error);
      throw error;
    }

    // Check if default template already exists (by name since we can't use string ID)
    const { data: existingTemplates, error: checkError } = await supabase
      .from('templates')
      .select('*')
      .eq('name', 'Marriage Certificate Template')
      .eq('template_type', 'marriage_certificate')
      .limit(1);
      
    if (checkError) {
      console.error('Error checking existing templates:', checkError);
      throw checkError;
    }
    
    if (existingTemplates && existingTemplates.length > 0) return;

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

    // Insert default template (let database generate UUID)
    console.log('Inserting default template with field mappings:', Object.keys(defaultFieldMappings).length, 'fields');
    
    const { data, error } = await supabase
      .from('templates')
      .insert({
        name: "Marriage Certificate Template",
        description: "National Civil Registry format", 
        file_path: "/public-objects/templates/marriage_certificate_template.pdf",
        field_mappings: defaultFieldMappings,     // snake_case column
        fieldMappings: defaultFieldMappings,      // camelCase column
        is_auto_created: false,
        source_document_path: null,
        template_type: "marriage_certificate",
        detection_metadata: {
          detectionMethod: "template_predefined",
          confidence: 1.0,
          totalMarkersFound: Object.keys(defaultFieldMappings).length,
          processingTime: 0,
          ocrAccuracy: 1.0
        },
        validation_rules: {
          globalRules: {
            requireAllFields: true,
            allowPartialFill: false,
            formCompletionThreshold: 100
          }
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select();

    if (error) {
      console.error('Error creating default template:', error);
      throw error;
    }
  }
}