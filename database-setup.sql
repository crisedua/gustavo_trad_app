-- Create the database tables for your Supabase project
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard/projects/YOUR_PROJECT/sql)

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  is_auto_created BOOLEAN DEFAULT false,
  source_document_path TEXT,
  template_type TEXT,
  detection_metadata JSONB,
  field_mappings JSONB NOT NULL,
  validation_rules JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create processing_jobs table
CREATE TABLE IF NOT EXISTS processing_jobs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  original_file_path TEXT NOT NULL,
  user_email TEXT NOT NULL,
  status TEXT NOT NULL,
  extracted_data JSONB,
  template_id VARCHAR REFERENCES templates(id),
  extracted_field_values JSONB,
  generated_document_path TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(template_type);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_user_email ON processing_jobs(user_email);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON processing_jobs(created_at);

-- Enable Row Level Security (RLS) if desired
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;