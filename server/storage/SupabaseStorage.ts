import { supabase } from '../supabase.js';
import { type Template, type InsertTemplate, type ProcessingJob, type InsertProcessingJob, type User, type InsertUser, type TemplateFieldMappings, type DocumentType, type InsertDocumentType, type DocumentVersion, type InsertDocumentVersion } from "@shared/schema";
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
    // Debug: Log what we're about to insert to Supabase
    console.log('🔍 SupabaseStorage.createTemplate - Data to insert:', {
      name: insertTemplate.name,
      fieldMappingsType: typeof insertTemplate.fieldMappings,
      fieldMappingsIsNull: insertTemplate.fieldMappings === null,
      fieldMappingsIsUndefined: insertTemplate.fieldMappings === undefined,
      fieldMappingsKeysCount: insertTemplate.fieldMappings ? Object.keys(insertTemplate.fieldMappings).length : 0,
      sampleFieldMapping: insertTemplate.fieldMappings ? Object.entries(insertTemplate.fieldMappings)[0] : null
    });

    // CRITICAL FIX: Ensure JSONB fields are properly structured for Supabase
    let safeFieldMappings = insertTemplate.fieldMappings;
    
    // If fieldMappings is empty or null, provide minimal valid structure
    if (!safeFieldMappings || Object.keys(safeFieldMappings).length === 0) {
      console.warn('⚠️  No field mappings provided, creating minimal structure');
      safeFieldMappings = {
        "default_field": {
          instances: [{
            coordinates: {
              page: 1,
              rect: { x: 0, y: 0, width: 100, height: 20 },
              rotation: 0,
              units: 'pdf_points',
              origin: 'bottom-left'
            },
            detectionConfidence: 0.5,
            detectionMethod: 'manual'
          }],
          fieldDefinition: {
            type: 'text',
            label: 'Default Field',
            description: 'Default field mapping'
          },
          detectionSummary: {
            totalInstancesFound: 1,
            averageConfidence: 0.5,
            detectionMethod: 'manual',
            conflictingInstances: false
          }
        }
      };
    }
    
    const safeDetectionMetadata = insertTemplate.detectionMetadata || {
      confidence: 0.5,
      processingTime: 0,
      detectionMethod: 'manual'
    };
    const safeValidationRules = insertTemplate.validationRules || {};

    const insertData = {
      name: insertTemplate.name,
      description: insertTemplate.description,
      file_path: insertTemplate.filePath,
      is_auto_created: insertTemplate.isAutoCreated || false,
      source_document_path: insertTemplate.sourceDocumentPath,
      document_type_id: insertTemplate.documentTypeId,
      document_version_id: insertTemplate.documentVersionId,
      template_type: insertTemplate.templateType,
      detection_metadata: safeDetectionMetadata,
      field_mappings: safeFieldMappings,
      validation_rules: safeValidationRules,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Ensure field_mappings is never null or undefined
    if (!insertData.field_mappings || Object.keys(insertData.field_mappings).length === 0) {
      console.warn('⚠️  Field mappings is empty, using minimal structure');
      insertData.field_mappings = {};
    }

    console.log('🔍 Final insert data:', {
      fieldMappingsInInsertData: insertData.field_mappings !== null && insertData.field_mappings !== undefined,
      fieldMappingsType: typeof insertData.field_mappings,
      fieldMappingsStringified: insertData.field_mappings ? JSON.stringify(insertData.field_mappings).substring(0, 200) + '...' : null
    });

    // FINALIZED: Use camelCase fieldMappings (confirmed working)
    console.log('🚀 Creating template...');
    
    const { data, error } = await supabase
      .from('templates')
      .insert({
        name: insertData.name,
        description: insertData.description || null,
        file_path: insertData.file_path,
        is_auto_created: insertData.is_auto_created || false,
        source_document_path: insertData.source_document_path || null,
        document_type_id: insertData.document_type_id || null,
        document_version_id: insertData.document_version_id || null,
        template_type: insertData.template_type || null,
        detection_metadata: safeDetectionMetadata,
        fieldMappings: safeFieldMappings,  // Use camelCase (confirmed working)
        validation_rules: safeValidationRules
      })
      .select('*')
      .single();

    if (error) {
      console.error('❌ Template creation failed:', error);
      throw error;
    }

    console.log('✅ Template successfully created:', data.id);
    return this.mapDbRowToTemplate(data);
  }

  // Helper method to map database row to Template object
  private mapDbRowToTemplate(data: any): Template {
    // Handle both camelCase and snake_case field mappings
    const fieldMappings = data.fieldMappings || data.field_mappings || {};
    const validationRules = data.validationRules || data.validation_rules || {};
    
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      filePath: data.file_path,
      isAutoCreated: data.is_auto_created || false,
      sourceDocumentPath: data.source_document_path,
      documentTypeId: data.document_type_id,
      documentVersionId: data.document_version_id,
      templateType: data.template_type,
      detectionMetadata: data.detection_metadata || {},
      fieldMappings: typeof fieldMappings === 'string' 
        ? JSON.parse(fieldMappings) 
        : fieldMappings,
      validationRules: typeof validationRules === 'string'
        ? JSON.parse(validationRules)
        : validationRules,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
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
    
    if (!data) return undefined;
    
    return this.mapDbRowToTemplate(data);
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
    
    if (!data) return [];
    
    return data.map(template => this.mapDbRowToTemplate(template));
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
    if (updates.documentTypeId !== undefined) dbUpdates.document_type_id = updates.documentTypeId;
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
        // Temporarily comment out until column is added
        // selected_document_type_id: insertJob.selectedDocumentTypeId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating processing job:', error);
      throw error;
    }
    
    // Map snake_case database columns to camelCase TypeScript properties
    return {
      id: data.id,
      originalFilePath: data.original_file_path,
      userEmail: data.user_email,
      status: data.status,
      extractedData: data.extracted_data,
      templateId: data.template_id,
      extractedFieldValues: data.extracted_field_values,
      generatedDocumentPath: data.generated_document_path,
      errorMessage: data.error_message,
      selectedDocumentTypeId: data.selected_document_type_id || null,
      detectedVersionId: data.detected_version_id,
      versionDetectionResults: data.version_detection_results,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
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
    
    if (!data) return undefined;
    
    // Map snake_case database columns to camelCase TypeScript properties
    return {
      id: data.id,
      originalFilePath: data.original_file_path,
      userEmail: data.user_email,
      status: data.status,
      extractedData: data.extracted_data,
      templateId: data.template_id,
      extractedFieldValues: data.extracted_field_values,
      generatedDocumentPath: data.generated_document_path,
      errorMessage: data.error_message,
      selectedDocumentTypeId: data.selected_document_type_id || null,
      detectedVersionId: data.detected_version_id,
      versionDetectionResults: data.version_detection_results,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
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
    
    if (!data) return [];
    
    // Map snake_case database columns to camelCase TypeScript properties  
    return data.map(job => ({
      id: job.id,
      originalFilePath: job.original_file_path,
      userEmail: job.user_email,
      status: job.status,
      extractedData: job.extracted_data,
      templateId: job.template_id,
      extractedFieldValues: job.extracted_field_values,
      generatedDocumentPath: job.generated_document_path,
      errorMessage: job.error_message,
      selectedDocumentTypeId: job.selected_document_type_id,
      detectedVersionId: job.detected_version_id,
      versionDetectionResults: job.version_detection_results,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    }));
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

    // 🚀 Initialize document types and versions first
    await this.initializeDefaultData();

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
    
    if (existingTemplates && existingTemplates.length > 0) {
      console.log('✅ Default template already exists, skipping template creation');
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

  // Initialize default document types, versions, and templates
  async initializeDefaultData(): Promise<void> {
    console.log('🚀 Initializing default document types and versions...');
    
    // Create Marriage Certificate document type
    let marriageDocType: DocumentType;
    const existingType = await this.getDocumentTypeByCode('marriage_certificate');
    
    if (existingType) {
      marriageDocType = existingType;
      console.log('✅ Marriage Certificate document type already exists');
    } else {
      marriageDocType = await this.createDocumentType({
        name: 'Marriage Certificate',
        code: 'marriage_certificate',
        description: 'Official marriage certificates from civil registry'
      });
      console.log('✅ Created Marriage Certificate document type');
    }
    
    // Create Old Format version
    const { data: existingOldVersion } = await supabase
      .from('document_versions')
      .select('*')
      .eq('document_type_id', marriageDocType.id)
      .eq('code', 'old_format')
      .single();
    
    if (!existingOldVersion) {
      await this.createDocumentVersion({
        documentTypeId: marriageDocType.id,
        name: 'Old Format',
        code: 'old_format',
        description: 'Traditional handwritten or typewritten format from pre-digital era',
        detectionPatterns: {
          keywords: [
            'REGISTRO DEL ESTADO CIVIL',
            'REGISTRO CIVIL',
            'MATRIMONIO',
            'REGISTRO NACIONAL DEL ESTADO CIVIL',
            'CERTIFICADO DE MATRIMONIO'
          ],
          excludeKeywords: [
            'DIGITAL',
            'QR',
            'DIGITALLY SIGNED',
            'FIRMADO DIGITALMENTE'
          ],
          layoutIndicators: [
            'STAMP',
            'SELLO',
            'CIRCULAR STAMP',
            'HANDWRITTEN'
          ],
          confidence: 0.8,
          language: 'es'
        }
      });
      console.log('✅ Created Old Format document version');
    }
    
    // Create New Format version
    const { data: existingNewVersion } = await supabase
      .from('document_versions')
      .select('*')
      .eq('document_type_id', marriageDocType.id)
      .eq('code', 'new_format')
      .single();
    
    if (!existingNewVersion) {
      await this.createDocumentVersion({
        documentTypeId: marriageDocType.id,
        name: 'New Format',
        code: 'new_format',
        description: 'Modern digital format with QR codes and digital signatures',
        detectionPatterns: {
          keywords: [
            'NATIONAL CIVIL REGISTRY',
            'DIGITAL CIVIL STATUS REGISTRATION',
            'QR',
            'DIGITALLY SIGNED',
            'FIRMADO DIGITALMENTE'
          ],
          excludeKeywords: [
            'HANDWRITTEN',
            'TYPEWRITTEN'
          ],
          layoutIndicators: [
            'QR CODE',
            'COAT OF ARMS',
            'SERIAL INDICATOR'
          ],
          confidence: 0.9,
          language: 'en'
        }
      });
      console.log('✅ Created New Format document version');
    }

    // Create Birth Certificate document type
    let birthDocType: DocumentType;
    const existingBirthType = await this.getDocumentTypeByCode('birth_certificate');
    
    if (existingBirthType) {
      birthDocType = existingBirthType;
      console.log('✅ Birth Certificate document type already exists');
    } else {
      birthDocType = await this.createDocumentType({
        name: 'Registro Nacimiento',
        code: 'birth_certificate',
        description: 'Official birth certificates from civil registry'
      });
      console.log('✅ Created Birth Certificate document type');
    }
    
    // Create Birth Certificate Old Format version
    const { data: existingBirthOldVersion } = await supabase
      .from('document_versions')
      .select('*')
      .eq('document_type_id', birthDocType.id)
      .eq('code', 'old_format')
      .single();
    
    if (!existingBirthOldVersion) {
      await this.createDocumentVersion({
        documentTypeId: birthDocType.id,
        name: 'Old Format',
        code: 'old_format',
        description: 'Traditional handwritten or typewritten birth certificate format',
        detectionPatterns: {
          keywords: [
            'REGISTRO DEL ESTADO CIVIL',
            'REGISTRO CIVIL',
            'NACIMIENTO',
            'PARTIDA DE NACIMIENTO',
            'CERTIFICADO DE NACIMIENTO'
          ],
          excludeKeywords: [
            'DIGITAL',
            'QR',
            'DIGITALLY SIGNED',
            'FIRMADO DIGITALMENTE'
          ],
          layoutIndicators: [
            'STAMP',
            'SELLO',
            'CIRCULAR STAMP',
            'HANDWRITTEN'
          ],
          confidence: 0.8,
          language: 'es'
        }
      });
      console.log('✅ Created Birth Certificate Old Format document version');
    }
    
    // Create Birth Certificate New Format version
    const { data: existingBirthNewVersion } = await supabase
      .from('document_versions')
      .select('*')
      .eq('document_type_id', birthDocType.id)
      .eq('code', 'new_format')
      .single();
    
    if (!existingBirthNewVersion) {
      await this.createDocumentVersion({
        documentTypeId: birthDocType.id,
        name: 'New Format',
        code: 'new_format',
        description: 'Modern digital birth certificate format with QR codes and digital signatures',
        detectionPatterns: {
          keywords: [
            'REGISTRO DEL ESTADO CIVIL',
            'REGISTRO CIVIL',
            'NACIMIENTO',
            'PARTIDA DE NACIMIENTO',
            'CERTIFICADO DE NACIMIENTO',
            'QR',
            'DIGITAL',
            'FIRMADO DIGITALMENTE'
          ],
          excludeKeywords: [],
          layoutIndicators: [
            'QR_CODE',
            'DIGITAL_SIGNATURE',
            'BARCODE'
          ],
          confidence: 0.9,
          language: 'es'
        }
      });
      console.log('✅ Created Birth Certificate New Format document version');
    }

    // Create DIAN Tax Form document type
    let dianDocType: DocumentType;
    const existingDianType = await this.getDocumentTypeByCode('dian_tax_form');
    
    if (existingDianType) {
      dianDocType = existingDianType;
      console.log('✅ DIAN Tax Form document type already exists');
    } else {
      dianDocType = await this.createDocumentType({
        name: 'DIAN Formulario',
        code: 'dian_tax_form',
        description: 'Colombian tax forms and declarations (DIAN)'
      });
      console.log('✅ Created DIAN Tax Form document type');
    }
    
    // Create DIAN Tax Form version
    const { data: existingDianVersion } = await supabase
      .from('document_versions')
      .select('*')
      .eq('document_type_id', dianDocType.id)
      .eq('code', 'standard_form')
      .single();
    
    if (!existingDianVersion) {
      await this.createDocumentVersion({
        documentTypeId: dianDocType.id,
        name: 'Standard Form',
        code: 'standard_form',
        description: 'Standard DIAN tax form format',
        detectionPatterns: {
          keywords: [
            'DIAN',
            'Dirección de Impuestos',
            'Impuesto sobre la Renta',
            'Formulario',
            'Declaración',
            'RUT',
            'NIT'
          ],
          excludeKeywords: [],
          layoutIndicators: [
            'TAX_FORM',
            'FORM_NUMBER',
            'YEAR_FIELD'
          ],
          confidence: 0.8,
          language: 'es'
        }
      });
      console.log('✅ Created DIAN Tax Form Standard version');
    }
    
    console.log('🎉 Document types and versions initialization complete');
  }

  // Document type methods
  async createDocumentType(documentType: InsertDocumentType): Promise<DocumentType> {
    const { data, error } = await supabase
      .from('document_types')
      .insert({
        name: documentType.name,
        code: documentType.code,
        description: documentType.description,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating document type:', error);
      throw error;
    }
    
    return {
      id: data.id,
      name: data.name,
      code: data.code,
      description: data.description,
      isActive: data.is_active ?? true,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async getDocumentType(id: string): Promise<DocumentType | undefined> {
    const { data, error } = await supabase
      .from('document_types')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching document type:', error);
      return undefined;
    }
    
    if (!data) return undefined;
    
    return {
      id: data.id,
      name: data.name,
      code: data.code,
      description: data.description,
      isActive: data.is_active ?? true,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async getDocumentTypes(): Promise<DocumentType[]> {
    const { data, error } = await supabase
      .from('document_types')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching document types:', error);
      return [];
    }
    
    if (!data) return [];
    
    return data.map(type => ({
      id: type.id,
      name: type.name,
      code: type.code,
      description: type.description,
      isActive: type.is_active ?? true,
      createdAt: type.created_at,
      updatedAt: type.updated_at
    }));
  }

  async getDocumentTypeByCode(code: string): Promise<DocumentType | undefined> {
    const { data, error } = await supabase
      .from('document_types')
      .select('*')
      .eq('code', code)
      .single();
    
    if (error) {
      console.error('Error fetching document type by code:', error);
      return undefined;
    }
    
    if (!data) return undefined;
    
    return {
      id: data.id,
      name: data.name,
      code: data.code,
      description: data.description,
      isActive: data.is_active ?? true,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async deleteDocumentType(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('document_types')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Error deleting document type:', error);
      return false;
    }
    
    return true;
  }

  // Document version methods
  async createDocumentVersion(documentVersion: InsertDocumentVersion): Promise<DocumentVersion> {
    const { data, error } = await supabase
      .from('document_versions')
      .insert({
        document_type_id: documentVersion.documentTypeId,
        name: documentVersion.name,
        code: documentVersion.code,
        description: documentVersion.description,
        detection_patterns: documentVersion.detectionPatterns,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('Error creating document version:', error);
      throw error;
    }
    
    return {
      id: data.id,
      documentTypeId: data.document_type_id,
      name: data.name,
      code: data.code,
      description: data.description,
      detectionPatterns: data.detection_patterns,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async getDocumentVersion(id: string): Promise<DocumentVersion | undefined> {
    const { data, error } = await supabase
      .from('document_versions')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Error fetching document version:', error);
      return undefined;
    }
    
    if (!data) return undefined;
    
    return {
      id: data.id,
      documentTypeId: data.document_type_id,
      name: data.name,
      code: data.code,
      description: data.description,
      detectionPatterns: data.detection_patterns,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }

  async getDocumentVersionsByType(documentTypeId: string): Promise<DocumentVersion[]> {
    const { data, error } = await supabase
      .from('document_versions')
      .select('*')
      .eq('document_type_id', documentTypeId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching document versions by type:', error);
      return [];
    }
    
    if (!data) return [];
    
    return data.map(version => ({
      id: version.id,
      documentTypeId: version.document_type_id,
      name: version.name,
      code: version.code,
      description: version.description,
      detectionPatterns: version.detection_patterns,
      isActive: version.is_active,
      createdAt: version.created_at,
      updatedAt: version.updated_at
    }));
  }

  async detectDocumentVersion(ocrText: string, documentTypeId: string): Promise<DocumentVersion | undefined> {
    const versions = await this.getDocumentVersionsByType(documentTypeId);
    
    let bestMatch: DocumentVersion | undefined = undefined;
    let highestConfidence = 0;
    
    for (const version of versions) {
      if (!version.detectionPatterns) continue;
      
      const patterns = version.detectionPatterns;
      let confidence = patterns.confidence || 0.5;
      
      // Check for required keywords
      if (patterns.keywords) {
        const keywordMatches = patterns.keywords.filter(keyword => 
          ocrText.toLowerCase().includes(keyword.toLowerCase())
        ).length;
        confidence *= (keywordMatches / patterns.keywords.length);
      }
      
      // Check for exclusion keywords
      if (patterns.excludeKeywords) {
        const excludeMatches = patterns.excludeKeywords.filter(keyword => 
          ocrText.toLowerCase().includes(keyword.toLowerCase())
        ).length;
        if (excludeMatches > 0) {
          confidence *= 0.1; // Heavily penalize if exclude keywords are found
        }
      }
      
      // Check for layout indicators
      if (patterns.layoutIndicators) {
        const layoutMatches = patterns.layoutIndicators.filter(indicator => 
          ocrText.toLowerCase().includes(indicator.toLowerCase())
        ).length;
        if (layoutMatches > 0) {
          confidence *= 1.2; // Boost confidence for layout indicators
        }
      }
      
      if (confidence > highestConfidence && confidence > 0.3) {
        highestConfidence = confidence;
        bestMatch = version;
      }
    }
    
    return bestMatch;
  }

  async getTemplatesByVersion(documentVersionId: string): Promise<Template[]> {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('document_version_id', documentVersionId);
    
    if (error) {
      console.error('Error fetching templates by version:', error);
      return [];
    }
    
    if (!data) return [];
    
    return data.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      filePath: template.file_path,
      isAutoCreated: template.is_auto_created,
      sourceDocumentPath: template.source_document_path,
      documentTypeId: template.document_type_id,
      documentVersionId: template.document_version_id,
      templateType: template.template_type,
      detectionMetadata: template.detection_metadata,
      fieldMappings: template.field_mappings,
      validationRules: template.validation_rules,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    }));
  }

  async getTemplatesByDocumentType(documentTypeId: string): Promise<Template[]> {
    const { data, error } = await supabase
      .from('templates')
      .select('*')
      .eq('document_type_id', documentTypeId);
    
    if (error) {
      console.error('Error fetching templates by document type:', error);
      return [];
    }
    
    if (!data) return [];
    
    return data.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      filePath: template.file_path,
      isAutoCreated: template.is_auto_created,
      sourceDocumentPath: template.source_document_path,
      documentTypeId: template.document_type_id,
      documentVersionId: template.document_version_id,
      templateType: template.template_type,
      detectionMetadata: template.detection_metadata,
      fieldMappings: template.field_mappings,
      validationRules: template.validation_rules,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    }));
  }
}