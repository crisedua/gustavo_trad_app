#!/usr/bin/env tsx
import { db } from './db.js';
import { sql } from 'drizzle-orm';
import { DatabaseStorage } from './storage/DatabaseStorage.js';

async function initializeDatabase() {
  try {
    console.log('Creating database tables...');
    
    // Create users table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        username text NOT NULL UNIQUE,
        password text NOT NULL
      )
    `);
    
    // Create templates table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS templates (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        description text,
        file_path text NOT NULL,
        is_auto_created boolean DEFAULT false,
        source_document_path text,
        template_type text,
        detection_metadata jsonb,
        field_mappings jsonb NOT NULL,
        validation_rules jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    
    // Create processing_jobs table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS processing_jobs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        original_file_path text NOT NULL,
        user_email text NOT NULL,
        status text NOT NULL,
        extracted_data jsonb,
        template_id varchar REFERENCES templates(id),
        extracted_field_values jsonb,
        generated_document_path text,
        error_message text,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    
    console.log('✅ Database tables created successfully');
    
    // Initialize default templates using DatabaseStorage
    const storage = new DatabaseStorage();
    await storage.initializeDefaultTemplates();
    console.log('✅ Default templates initialized');
    
    // Test template persistence
    const templates = await storage.getTemplates();
    console.log(`✅ Templates loaded: ${templates.length} templates found`);
    templates.forEach(t => console.log(`  - ${t.name} (ID: ${t.id})`));
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase().then(() => {
    console.log('✅ Database initialization complete');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  });
}