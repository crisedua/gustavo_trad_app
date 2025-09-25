# Render Deployment Guide

This guide explains how to deploy your AI-powered document processing application to Render.

## 🚀 Quick Setup

### 1. Environment Variables

Set these environment variables in your Render dashboard:

```bash
# Required
NODE_ENV=production
RENDER=true
DATABASE_URL=postgresql://username:password@hostname:port/database

# Optional but recommended
OPENAI_API_KEY=your-openai-api-key
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SESSION_SECRET=your-random-session-secret
```

### 2. Build Configuration

In your Render service settings:

- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Node Version**: 18 or higher

### 3. File Storage

The app now uses **local filesystem storage** instead of Replit's object storage:

- ✅ **Uploaded files**: Stored in `/uploads` directory
- ✅ **Template files**: Stored in `/public-objects` directory
- ✅ **Automatic directory creation**: Handled by the app

## 🔧 Key Changes for Render Compatibility

### File Upload System
- **Before (Replit)**: Used Google Cloud Storage with presigned URLs
- **After (Render)**: Uses local filesystem with direct upload endpoints

### Storage Detection
The app automatically detects the environment:
```javascript
const isRenderEnvironment = process.env.RENDER || process.env.NODE_ENV === 'production';
```

### Upload Flow
1. Client requests upload URL: `POST /api/objects/upload`
2. Server returns local endpoint: `/api/upload/{fileId}`
3. Client uploads file: `PUT /api/upload/{fileId}`
4. Server saves to local filesystem: `/uploads/{fileId}`

## 📁 Directory Structure

```
your-app/
├── uploads/           # User uploaded files (created automatically)
├── public-objects/    # Template files and public assets
│   └── templates/     # PDF templates
├── server/            # Backend code
├── client/            # Frontend code
└── shared/            # Shared types and schemas
```

## 🔍 Troubleshooting

### File Upload Issues
1. **Check logs**: Look for "File uploaded successfully" messages
2. **Verify directories**: Ensure `/uploads` directory is created
3. **Check permissions**: Render should have write access to the filesystem

### Environment Detection
The app detects Render environment by checking:
- `process.env.RENDER` is set
- `process.env.NODE_ENV === 'production'`
- Hostname contains 'render.com' or 'onrender.com'

### Database Connection
- Use Render's PostgreSQL add-on for best performance
- Alternatively, use Supabase for managed PostgreSQL

## 🎯 Testing

After deployment, test the file upload:

1. Go to `/process` page
2. Select a document type
3. Enter email address
4. Upload a file (PDF, image, or DOCX)
5. Check server logs for successful upload message

## 📞 Support

If you encounter issues:
1. Check Render logs for error messages
2. Verify all environment variables are set
3. Ensure your database is accessible
4. Test file upload functionality

The app is now fully compatible with Render's hosting environment! 🎉
