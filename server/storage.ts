import { type Template, type InsertTemplate, type ProcessingJob, type InsertProcessingJob, type User, type InsertUser } from "@shared/schema";
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
    // Add default marriage certificate template
    const defaultTemplate: Template = {
      id: "default-marriage-cert",
      name: "Marriage Certificate Template",
      description: "National Civil Registry format",
      filePath: "/public-objects/templates/marriage_certificate_template.pdf",
      fields: [
        "serial_indicator",
        "registry_country",
        "registry_department", 
        "registry_municipality",
        "registry_date_of_registration",
        "registry_office_type",
        "registry_office_name",
        "marriage_country",
        "marriage_department",
        "marriage_municipality", 
        "marriage_date_of_registration",
        "marriage_type",
        "party_a_names",
        "party_a_surnames",
        "party_a_document_type",
        "party_a_document_number",
        "party_b_names",
        "party_b_surnames", 
        "party_b_document_type",
        "party_b_document_number",
        "issue_day",
        "issue_month",
        "issue_year",
        "authorized_name",
        "authorized_title"
      ] as string[],
      createdAt: new Date(),
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
      fields: insertTemplate.fields as string[],
      createdAt: new Date()
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
      extractedData: insertJob.extractedData ?? null,
      templateId: insertJob.templateId ?? null,
      fieldMappings: insertJob.fieldMappings ?? null,
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
