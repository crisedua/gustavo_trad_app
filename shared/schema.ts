import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  filePath: text("file_path").notNull(),
  fields: jsonb("fields").notNull().$type<string[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const processingJobs = pgTable("processing_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalFilePath: text("original_file_path").notNull(),
  status: text("status").notNull(), // 'uploading', 'ocr', 'extraction', 'mapping', 'generation', 'completed', 'error'
  extractedData: jsonb("extracted_data").$type<Record<string, string>>(),
  templateId: varchar("template_id").references(() => templates.id),
  fieldMappings: jsonb("field_mappings").$type<Record<string, string>>(),
  generatedDocumentPath: text("generated_document_path"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertTemplateSchema = createInsertSchema(templates).pick({
  name: true,
  description: true,
  filePath: true,
  fields: true,
});

export const insertProcessingJobSchema = createInsertSchema(processingJobs).pick({
  originalFilePath: true,
  status: true,
  extractedData: true,
  templateId: true,
  fieldMappings: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = z.infer<typeof insertProcessingJobSchema>;
