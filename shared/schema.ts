import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

// Document Types table for organizing templates by category
export const documentTypes = pgTable("document_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(), // "Birth Certificate", "Marriage Certificate", etc.
  code: text("code").notNull().unique(), // "birth_certificate", "marriage_certificate", etc.
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Document Versions table for managing different versions of the same document type
export const documentVersions = pgTable("document_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentTypeId: varchar("document_type_id").references(() => documentTypes.id).notNull(),
  name: text("name").notNull(), // "Old Format", "New Format", "Digital Format", etc.
  code: text("code").notNull(), // "old_format", "new_format", "digital_format", etc.
  description: text("description"),
  // AI detection patterns to identify this version
  detectionPatterns: jsonb("detection_patterns").$type<{
    keywords: string[]; // Required keywords that indicate this version
    excludeKeywords?: string[]; // Keywords that exclude this version
    layoutIndicators?: string[]; // Visual/structural indicators
    confidence: number; // Base confidence for this pattern
    language?: string; // Target language for this version
  }>(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  filePath: text("file_path").notNull(),
  // Enhanced fields for automated template creation
  isAutoCreated: boolean("is_auto_created").default(false),
  sourceDocumentPath: text("source_document_path"),
  // Link to document type and version for AI-powered selection
  documentTypeId: varchar("document_type_id").references(() => documentTypes.id),
  documentVersionId: varchar("document_version_id").references(() => documentVersions.id),
  // Legacy field for backward compatibility
  templateType: text("template_type"), // 'marriage_certificate', 'birth_certificate', 'custom', etc.
  detectionMetadata: jsonb("detection_metadata").$type<{
    detectionMethod?: string;
    confidence?: number;
    totalMarkersFound?: number;
    processingTime?: number;
    ocrAccuracy?: number;
  }>(),
  fieldMappings: jsonb("field_mappings").notNull().$type<{
    [fieldName: string]: {
      // Support multiple instances of the same field across different locations
      instances: Array<{
        // PDF coordinate system with proper semantics
        coordinates: {
          page: number; // 1-based page number
          rect: {
            // PDF coordinate system: origin at bottom-left, units in points (1/72 inch)
            x: number; // left edge distance from bottom-left origin
            y: number; // bottom edge distance from bottom-left origin  
            width: number; // width in points
            height: number; // height in points
          };
          rotation?: number; // rotation in degrees (0, 90, 180, 270)
          units: 'pdf_points'; // explicit unit declaration
          origin: 'bottom-left'; // explicit origin declaration
        };
        // AcroForm integration for proper PDF field handling
        acroForm?: {
          fieldName?: string; // AcroForm field name if exists
          fieldType?: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature';
          fieldId?: string; // Unique identifier within PDF
          isRequired?: boolean; // AcroForm required flag
          maxLength?: number; // AcroForm field max length
          defaultValue?: string; // AcroForm default value
        };
        // Detection metadata for this specific instance
        detectionConfidence?: number; // 0-1 confidence for this instance
        detectionMethod?: string; // how this instance was detected
        ocrText?: string; // raw OCR text found at this location
      }>;
      // Field-level metadata and validation
      fieldDefinition: {
        type: 'text' | 'date' | 'number' | 'boolean' | 'select' | 'multiline_text' | 'signature';
        label: string; // Human-readable field label
        description?: string; // Additional field description
        validation?: {
          required?: boolean;
          minLength?: number;
          maxLength?: number;
          pattern?: string; // regex pattern
          format?: 'date' | 'email' | 'phone' | 'url' | 'currency' | 'ssn' | 'custom';
          min?: number; // for number types
          max?: number; // for number types
          customValidation?: string; // custom validation expression
        };
        displayOptions?: {
          placeholder?: string;
          helpText?: string;
          defaultValue?: string;
          options?: string[]; // for select/dropdown fields
          multiSelect?: boolean; // for select fields
          dateFormat?: string; // for date fields
          currencySymbol?: string; // for currency fields
        };
        dependencies?: {
          dependsOn?: string[]; // other field names this field depends on
          conditionalRequired?: boolean; // required only under certain conditions
          visibilityCondition?: string; // when to show this field
          calculatedValue?: string; // formula for calculated fields
        };
      };
      // Overall field detection metadata
      detectionSummary?: {
        totalInstancesFound: number;
        averageConfidence: number;
        detectionMethod: string;
        conflictingInstances?: boolean; // if multiple instances have different values
      };
    };
  }>(),
  validationRules: jsonb("validation_rules").$type<{
    globalRules?: {
      allowPartialFill?: boolean;
      requireAllFields?: boolean;
      customValidations?: string[];
      formCompletionThreshold?: number; // percentage of required fields that must be filled
    };
    fieldDependencies?: {
      [fieldName: string]: {
        dependsOn?: string[];
        conditionalRequired?: boolean;
        visibilityCondition?: string;
        calculationFormula?: string;
      };
    };
    crossFieldValidation?: {
      rules: Array<{
        name: string;
        description: string;
        condition: string; // validation expression
        errorMessage: string;
      }>;
    };
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const processingJobs = pgTable("processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalFilePath: text("original_file_path").notNull(),
  userEmail: text("user_email").notNull(),
  // Enhanced status to include version detection step
  status: text("status").notNull(), // 'pending_review', 'uploading', 'ocr', 'version_detection', 'extraction', 'mapping', 'generation', 'completed', 'error'
  extractedData: jsonb("extracted_data").$type<Record<string, string>>(),
  // User-selected document type (replaces manual template selection)
  selectedDocumentTypeId: varchar("selected_document_type_id").references(() => documentTypes.id),
  // AI-detected document version and template
  detectedVersionId: varchar("detected_version_id").references(() => documentVersions.id),
  templateId: varchar("template_id").references(() => templates.id),
  // Version detection results from AI
  versionDetectionResults: jsonb("version_detection_results").$type<{
    detectedVersions: Array<{
      versionId: string;
      versionName: string;
      confidence: number;
      matchedPatterns: string[];
      reasoning: string;
    }>;
    selectedVersion?: {
      versionId: string;
      confidence: number;
      autoSelected: boolean;
      fallbackReason?: string;
    };
    ocrText?: string; // Processed OCR text used for detection
    processingTime?: number;
    errorMessage?: string;
  }>(),
  // Renamed for clarity: this represents field names mapped to their extracted/filled values
  extractedFieldValues: jsonb("extracted_field_values").$type<Record<string, string>>(),
  generatedDocumentPath: text("generated_document_path"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Comprehensive Zod schemas for nested JSONB structures

// PDF coordinate system validation
export const pdfCoordinatesSchema = z.object({
  page: z.number().int().min(1),
  rect: z.object({
    x: z.number().min(0),
    y: z.number().min(0),
    width: z.number().min(0),
    height: z.number().min(0),
  }),
  rotation: z.number().multipleOf(90).min(0).max(270).optional(),
  units: z.literal('pdf_points'),
  origin: z.literal('bottom-left'),
});

// AcroForm field validation  
export const acroFormSchema = z.object({
  fieldName: z.string().optional(),
  fieldType: z.enum(['text', 'checkbox', 'radio', 'dropdown', 'signature']).optional(),
  fieldId: z.string().optional(),
  isRequired: z.boolean().optional(),
  maxLength: z.number().int().min(1).optional(),
  defaultValue: z.string().optional(),
});

// Field instance validation
export const fieldInstanceSchema = z.object({
  coordinates: pdfCoordinatesSchema,
  acroForm: acroFormSchema.optional(),
  detectionConfidence: z.number().min(0).max(1).optional(),
  detectionMethod: z.string().optional(),
  ocrText: z.string().optional(),
});

// Field validation rules schema
export const fieldValidationSchema = z.object({
  required: z.boolean().optional(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(1).optional(),
  pattern: z.string().optional(),
  format: z.enum(['date', 'email', 'phone', 'url', 'currency', 'ssn', 'custom']).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  customValidation: z.string().optional(),
});

// Field display options schema
export const fieldDisplayOptionsSchema = z.object({
  placeholder: z.string().optional(),
  helpText: z.string().optional(),
  defaultValue: z.string().optional(),
  options: z.array(z.string()).optional(),
  multiSelect: z.boolean().optional(),
  dateFormat: z.string().optional(),
  currencySymbol: z.string().optional(),
});

// Field dependencies schema
export const fieldDependenciesSchema = z.object({
  dependsOn: z.array(z.string()).optional(),
  conditionalRequired: z.boolean().optional(),
  visibilityCondition: z.string().optional(),
  calculatedValue: z.string().optional(),
});

// Field definition schema
export const fieldDefinitionSchema = z.object({
  type: z.enum(['text', 'date', 'number', 'boolean', 'select', 'multiline_text', 'signature']),
  label: z.string().min(1),
  description: z.string().optional(),
  validation: fieldValidationSchema.optional(),
  displayOptions: fieldDisplayOptionsSchema.optional(),
  dependencies: fieldDependenciesSchema.optional(),
});

// Detection summary schema
export const detectionSummarySchema = z.object({
  totalInstancesFound: z.number().int().min(0),
  averageConfidence: z.number().min(0).max(1),
  detectionMethod: z.string(),
  conflictingInstances: z.boolean().optional(),
});

// Complete field mapping schema
export const fieldMappingSchema = z.object({
  instances: z.array(fieldInstanceSchema).min(1),
  fieldDefinition: fieldDefinitionSchema,
  detectionSummary: detectionSummarySchema.optional(),
});

// Template field mappings validation
export const templateFieldMappingsSchema = z.record(z.string(), fieldMappingSchema);

// Template detection metadata schema
export const templateDetectionMetadataSchema = z.object({
  detectionMethod: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  totalMarkersFound: z.number().int().min(0).optional(),
  processingTime: z.number().min(0).optional(),
  ocrAccuracy: z.number().min(0).max(1).optional(),
});

// Document version detection patterns schema
export const detectionPatternsSchema = z.object({
  keywords: z.array(z.string()).min(1),
  excludeKeywords: z.array(z.string()).optional(),
  layoutIndicators: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  language: z.string().optional(),
});

// Version detection results schema
export const versionDetectionResultsSchema = z.object({
  detectedVersions: z.array(z.object({
    versionId: z.string(),
    versionName: z.string(),
    confidence: z.number().min(0).max(1),
    matchedPatterns: z.array(z.string()),
    reasoning: z.string(),
  })),
  selectedVersion: z.object({
    versionId: z.string(),
    confidence: z.number().min(0).max(1),
    autoSelected: z.boolean(),
    fallbackReason: z.string().optional(),
  }).optional(),
  ocrText: z.string().optional(),
  processingTime: z.number().min(0).optional(),
  errorMessage: z.string().optional(),
});

// Cross-field validation rules schema
export const crossFieldValidationRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  condition: z.string().min(1),
  errorMessage: z.string().min(1),
});

// Template validation rules schema
export const templateValidationRulesSchema = z.object({
  globalRules: z.object({
    allowPartialFill: z.boolean().optional(),
    requireAllFields: z.boolean().optional(),
    customValidations: z.array(z.string()).optional(),
    formCompletionThreshold: z.number().min(0).max(100).optional(),
  }).optional(),
  fieldDependencies: z.record(z.string(), z.object({
    dependsOn: z.array(z.string()).optional(),
    conditionalRequired: z.boolean().optional(),
    visibilityCondition: z.string().optional(),
    calculationFormula: z.string().optional(),
  })).optional(),
  crossFieldValidation: z.object({
    rules: z.array(crossFieldValidationRuleSchema),
  }).optional(),
});

// Base schema validations
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertDocumentTypeSchema = createInsertSchema(documentTypes).pick({
  name: true,
  code: true,
  description: true,
  isActive: true,
}).partial({
  description: true,
  isActive: true,
});

export const updateDocumentTypeSchema = createInsertSchema(documentTypes).pick({
  name: true,
  code: true,
  description: true,
  isActive: true,
}).partial();

export const insertDocumentVersionSchema = createInsertSchema(documentVersions).pick({
  documentTypeId: true,
  name: true,
  code: true,
  description: true,
  detectionPatterns: true,
  isActive: true,
}).partial({
  description: true,
  isActive: true,
}).extend({
  detectionPatterns: detectionPatternsSchema,
});

export const updateDocumentVersionSchema = createInsertSchema(documentVersions).pick({
  name: true,
  code: true,
  description: true,
  detectionPatterns: true,
  isActive: true,
}).partial().extend({
  detectionPatterns: detectionPatternsSchema.optional(),
});

export const insertTemplateSchema = createInsertSchema(templates).pick({
  name: true,
  description: true,
  filePath: true,
  isAutoCreated: true,
  sourceDocumentPath: true,
  documentTypeId: true,
  documentVersionId: true,
  templateType: true,
  detectionMetadata: true,
  fieldMappings: true,
  validationRules: true,
}).partial({
  isAutoCreated: true,
  sourceDocumentPath: true,
  documentTypeId: true,
  documentVersionId: true,
  templateType: true,
  detectionMetadata: true,
  validationRules: true,
}).extend({
  // Add strict validation for the JSONB fields
  fieldMappings: templateFieldMappingsSchema,
  detectionMetadata: templateDetectionMetadataSchema.optional(),
  validationRules: templateValidationRulesSchema.optional(),
});

export const updateTemplateSchema = createInsertSchema(templates).pick({
  name: true,
  description: true,
  documentTypeId: true,
  documentVersionId: true,
  templateType: true,
  fieldMappings: true,
  validationRules: true,
}).partial().extend({
  // Add strict validation for the JSONB fields  
  fieldMappings: templateFieldMappingsSchema.optional(),
  validationRules: templateValidationRulesSchema.optional(),
});

export const insertProcessingJobSchema = createInsertSchema(processingJobs).pick({
  originalFilePath: true,
  userEmail: true,
  status: true,
  extractedData: true,
  selectedDocumentTypeId: true,
  detectedVersionId: true,
  templateId: true,
  versionDetectionResults: true,
  extractedFieldValues: true,
}).partial({
  selectedDocumentTypeId: true,
  detectedVersionId: true,
  templateId: true,
  versionDetectionResults: true,
}).extend({
  // Add validation for extracted field values - require empty objects instead of null
  extractedData: z.record(z.string(), z.string()).default({}),
  extractedFieldValues: z.record(z.string(), z.string()).default({}),
  versionDetectionResults: versionDetectionResultsSchema.optional(),
  // Add email validation
  userEmail: z.string().email("Please enter a valid email address"),
});

// Updated schemas for automated template creation
export const autoTemplateCreationSchema = z.object({
  sourceDocumentPath: z.string(),
  fieldMappings: templateFieldMappingsSchema,
  detectionMetadata: templateDetectionMetadataSchema.optional(),
  templateName: z.string().min(1),
  templateDescription: z.string().optional(),
  templateType: z.string().optional(),
});

// Helper schema for template field list extraction
export const templateFieldListSchema = z.object({
  fieldNames: z.array(z.string()).min(1),
});

// Type exports
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type DocumentType = typeof documentTypes.$inferSelect;
export type InsertDocumentType = z.infer<typeof insertDocumentTypeSchema>;
export type UpdateDocumentType = z.infer<typeof updateDocumentTypeSchema>;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;
export type UpdateDocumentVersion = z.infer<typeof updateDocumentVersionSchema>;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type UpdateTemplate = z.infer<typeof updateTemplateSchema>;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;

// Comprehensive types for the new schema structure
export type AutoTemplateCreation = z.infer<typeof autoTemplateCreationSchema>;
export type TemplateFieldList = z.infer<typeof templateFieldListSchema>;
export type DetectionPatterns = z.infer<typeof detectionPatternsSchema>;
export type VersionDetectionResults = z.infer<typeof versionDetectionResultsSchema>;

// PDF and field mapping types
export type PdfCoordinates = z.infer<typeof pdfCoordinatesSchema>;
export type AcroForm = z.infer<typeof acroFormSchema>;
export type FieldInstance = z.infer<typeof fieldInstanceSchema>;
export type FieldValidation = z.infer<typeof fieldValidationSchema>;
export type FieldDisplayOptions = z.infer<typeof fieldDisplayOptionsSchema>;
export type FieldDependencies = z.infer<typeof fieldDependenciesSchema>;
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export type DetectionSummary = z.infer<typeof detectionSummarySchema>;
export type FieldMapping = z.infer<typeof fieldMappingSchema>;

// Template-level types
export type TemplateFieldMappings = z.infer<typeof templateFieldMappingsSchema>;
export type TemplateDetectionMetadata = z.infer<typeof templateDetectionMetadataSchema>;
export type TemplateValidationRules = z.infer<typeof templateValidationRulesSchema>;
export type CrossFieldValidationRule = z.infer<typeof crossFieldValidationRuleSchema>;

// Helper function to extract field names from fieldMappings
export function getFieldNamesFromMappings(fieldMappings: TemplateFieldMappings): string[] {
  return Object.keys(fieldMappings);
}

// Helper function to validate template field mappings
export function validateTemplateFieldMappings(fieldMappings: unknown): fieldMappings is TemplateFieldMappings {
  const result = templateFieldMappingsSchema.safeParse(fieldMappings);
  return result.success;
}
