# Overview

This is a document processing and translation system that automatically extracts data from uploaded documents (like marriage certificates, birth certificates, etc.) and fills out template forms. The system uses AI-powered OCR and field extraction to process various document types, then generates filled templates using the extracted data.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **React + TypeScript SPA**: Built with Vite for fast development and building
- **UI Framework**: Shadcn/ui components with Radix UI primitives and Tailwind CSS
- **State Management**: TanStack React Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **File Upload**: Uppy integration with AWS S3 support for direct-to-cloud uploads

### Backend Architecture
- **Express.js Server**: Node.js/TypeScript backend with ESM modules
- **Database ORM**: Drizzle with PostgreSQL (Neon Database) for data persistence
- **File Storage**: Google Cloud Storage with ACL-based access control
- **Document Processing Pipeline**:
  - OCR text extraction using Google Vision API
  - AI field extraction using OpenAI GPT-5
  - PDF template filling using pdf-lib
  - Multi-format document generation (PDF/DOCX)

### Data Storage Solutions
- **PostgreSQL Database**: User accounts, templates, and processing job tracking
- **Google Cloud Storage**: Document and template file storage with custom ACL policies
- **In-Memory Storage**: Fallback storage implementation for development

### Authentication & Authorization
- **Object-Level ACL**: Custom access control system for file storage
- **Service Account Authentication**: Google Cloud services integration via OAuth2
- **Replit Integration**: Built-in authentication for Replit environment

### Processing Workflow
1. **Document Upload**: Files uploaded via drag-and-drop interface
2. **OCR Processing**: Google Vision API extracts text from images/PDFs
3. **AI Field Extraction**: OpenAI analyzes text and extracts structured data
4. **Template Mapping**: System maps extracted fields to template placeholders
5. **Document Generation**: Creates filled PDFs/DOCX files
6. **Secure Download**: Provides signed URLs for result downloads

## External Dependencies

### Cloud Services
- **Google Cloud Vision API**: OCR text extraction from documents
- **Google Cloud Storage**: File storage with custom access controls
- **OpenAI API (GPT-5)**: AI-powered field extraction and data structuring
- **Neon Database**: PostgreSQL hosting for application data

### Development Tools
- **Replit Platform**: Integrated development environment with sidecar services
- **Vite**: Frontend build tool with HMR and development server
- **Drizzle Kit**: Database schema management and migrations

### UI/UX Libraries
- **Radix UI**: Headless component primitives for accessibility
- **Tailwind CSS**: Utility-first styling framework
- **Uppy**: File upload handling with progress tracking
- **Lucide React**: Icon library for consistent iconography

### Document Processing
- **pdf-lib**: PDF manipulation and form filling
- **Multer**: File upload middleware for Express
- **Google Vision Client**: OCR processing integration