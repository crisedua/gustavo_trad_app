import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';
import { objectStorageClient } from '../objectStorage';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as path from 'path';
import * as fs from 'fs';
import { PathValidator } from '../security/pathValidator';
import { SSRFProtection } from '../security/ssrfProtection';
import * as mammoth from 'mammoth';

export class OCRService {
  private client: ImageAnnotatorClient;
  private storage: Storage;

  constructor() {
    // Initialize client with secure credential handling
    try {
      // Try to use environment-based credentials
      let clientConfig: any = {};

      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Use credentials file path
        clientConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        console.log('Using Google Cloud credentials from file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        // Use credentials JSON from environment
        try {
          const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
          clientConfig.credentials = credentials;
          clientConfig.projectId = credentials.project_id;
          console.log('Using Google Cloud credentials from environment JSON for project:', credentials.project_id);
        } catch (error) {
          throw new Error('Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON format');
        }
      } else {
        // No credentials found - provide clear error message
        throw new Error(
          'Google Cloud credentials not found. Please set either:\n' +
          '- GOOGLE_APPLICATION_CREDENTIALS (path to service account JSON file)\n' +
          '- GOOGLE_APPLICATION_CREDENTIALS_JSON (JSON content as string)\n' +
          'Contact your system administrator for proper credential setup.'
        );
      }

      // Require explicit project ID - no fallback
      if (!clientConfig.projectId) {
        if (process.env.GOOGLE_CLOUD_PROJECT_ID) {
          clientConfig.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
        } else {
          throw new Error(
            'Project ID not found. Please set GOOGLE_CLOUD_PROJECT_ID environment variable ' +
            'or ensure your credentials JSON includes project_id field.'
          );
        }
      }

      this.client = new ImageAnnotatorClient(clientConfig);
      
      // Initialize storage client for PDF processing
      this.storage = new Storage(clientConfig);
      
    } catch (error) {
      console.error('Failed to initialize Google Vision client:', error);
      throw error;
    }
  }

  async extractTextFromFile(filePath: string): Promise<string> {
    try {
      console.log('Processing file for OCR:', filePath.substring(0, 50) + '...');
      
      // Check if filePath is a URL (signed URL from Google Cloud Storage or localhost)
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        let fileBuffer: Buffer;
        
        // Handle localhost URLs by mapping to filesystem paths (development only)
        if (filePath.includes('localhost') || filePath.includes('127.0.0.1')) {
          console.log('OCRService: Processing localhost URL securely:', filePath.substring(0, 50) + '...');
          
          // Securely convert localhost URL to filesystem path
          const url = new URL(filePath);
          
          // Use secure path validation to prevent traversal attacks
          const localPath = PathValidator.mapLocalhostUrlToPath(url);
          
          // Validate file exists and check size limits
          PathValidator.validateFileExists(localPath);
          PathValidator.validateFileSize(localPath, 10 * 1024 * 1024); // 10MB limit
          
          console.log('OCRService: Validated filesystem path:', localPath.substring(localPath.lastIndexOf(path.sep) + 1));
          
          fileBuffer = fs.readFileSync(localPath);
          console.log('OCRService: Read localhost file securely, size:', fileBuffer.length, 'bytes');
        } else {
          // Convert to gs:// format for Google Cloud Storage URLs
          const gsUri = this.convertToGsUri(filePath);
          console.log('Converted to gs:// URI:', gsUri.substring(0, 30) + '...');
          
          // Download file with fallback authentication
          fileBuffer = await this.downloadWithFallback(gsUri);
          console.log('Downloaded file successfully, size:', fileBuffer.length, 'bytes');
        }
        
        // Detect file type from buffer
        const fileType = this.detectFileType(fileBuffer, filePath);
        console.log('Detected file type:', fileType);
        
        if (fileType === 'pdf') {
          // Process PDF using PDF-to-image conversion (no bucket permissions needed)
          return await this.extractTextFromPDFBuffer(fileBuffer);
        } else if (fileType === 'tiff') {
          // Process TIFF as image using direct buffer approach
          return await this.extractTextFromImageBuffer(fileBuffer);
        } else if (fileType === 'docx') {
          // Process DOCX files by extracting text directly
          return await this.extractTextFromDOCXBuffer(fileBuffer);
        } else {
          // Process as image using buffer
          return await this.extractTextFromImageBuffer(fileBuffer);
        }
      }
      
      // For gs:// URIs, download and process as buffer to avoid permission issues
      if (filePath.startsWith('gs://')) {
        const fileBuffer = await this.downloadWithFallback(filePath);
        const fileType = this.detectFileType(fileBuffer, filePath);
        console.log('Detected file type for gs:// URI:', fileType);
        
        if (fileType === 'pdf') {
          // Process PDF using PDF-to-image conversion (no bucket permissions needed)
          return await this.extractTextFromPDFBuffer(fileBuffer);
        } else if (fileType === 'tiff') {
          // Process TIFF as image using direct buffer approach
          return await this.extractTextFromImageBuffer(fileBuffer);
        } else if (fileType === 'docx') {
          // Process DOCX files by extracting text directly
          return await this.extractTextFromDOCXBuffer(fileBuffer);
        } else {
          return await this.extractTextFromImageBuffer(fileBuffer);
        }
      }
      
      // For local file paths, read file as buffer and process
      console.log('Processing local file path:', filePath);
      
      // Validate file exists and get file buffer
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const fileBuffer = fs.readFileSync(filePath);
      const fileType = this.detectFileType(fileBuffer, filePath);
      console.log('Detected file type for local file:', fileType);
      
      if (fileType === 'pdf') {
        // Process PDF using PDF-to-image conversion 
        return await this.extractTextFromPDFBuffer(fileBuffer);
      } else if (fileType === 'tiff') {
        // Process TIFF as image using direct buffer approach
        return await this.extractTextFromImageBuffer(fileBuffer);
      } else if (fileType === 'docx') {
        // Process DOCX files by extracting text directly
        return await this.extractTextFromDOCXBuffer(fileBuffer);
      } else {
        // Process as image using buffer
        return await this.extractTextFromImageBuffer(fileBuffer);
      }
    } catch (error) {
      console.error('OCR extraction failed:', error);
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async extractTextFromBuffer(imageBuffer: Buffer): Promise<string> {
    try {
      console.log('Processing image buffer with Vision API textDetection');
      const [result] = await this.client.textDetection(imageBuffer);
      const detections = result.textAnnotations;
      
      if (!detections || detections.length === 0) {
        throw new Error('No text detected in the document');
      }

      return detections[0].description || '';
    } catch (error) {
      console.error('OCR extraction failed:', error);
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private detectFileType(buffer: Buffer, filePath: string): 'pdf' | 'tiff' | 'image' | 'docx' {
    // Check PDF header
    if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF') {
      return 'pdf';
    }
    
    // Check TIFF headers (II* for little-endian, MM* for big-endian)
    if (buffer.length >= 4) {
      const header = buffer.subarray(0, 4);
      if ((header[0] === 0x49 && header[1] === 0x49 && header[2] === 0x2A && header[3] === 0x00) ||
          (header[0] === 0x4D && header[1] === 0x4D && header[2] === 0x00 && header[3] === 0x2A)) {
        return 'tiff';
      }
    }
    
    // Check ZIP/DOCX header (PK signature - 0x50, 0x4B)
    if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B) {
      // Check if it's a DOCX by looking for DOCX internal structure
      if (this.isDocxZipFile(buffer)) {
        return 'docx';
      }
    }
    
    // Check file extension as fallback
    return this.detectFileTypeFromPath(filePath);
  }
  
  /**
   * Check if a ZIP buffer contains DOCX internal structure
   */
  private isDocxZipFile(buffer: Buffer): boolean {
    try {
      // Convert buffer to string to search for DOCX signatures
      const bufferString = buffer.toString('binary');
      
      // Look for typical DOCX internal files
      const docxSignatures = [
        '[Content_Types].xml',
        'word/document.xml', 
        '_rels/.rels',
        'docProps/core.xml',
        'word/_rels/document.xml.rels'
      ];
      
      // Check if at least 2 of these signatures exist
      let signatureCount = 0;
      for (const signature of docxSignatures) {
        if (bufferString.includes(signature)) {
          signatureCount++;
          if (signatureCount >= 2) {
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      // If inspection fails, fall back to extension-based detection
      return false;
    }
  }
  
  private detectFileTypeFromPath(filePath: string): 'pdf' | 'tiff' | 'image' | 'docx' {
    // Extract extension, handling URLs with query parameters
    const pathWithoutQuery = filePath.split('?')[0];
    const extension = pathWithoutQuery.toLowerCase().split('.').pop() || '';
    
    if (extension === 'pdf') return 'pdf';
    if (['tiff', 'tif'].includes(extension)) return 'tiff';
    if (['docx', 'doc'].includes(extension)) return 'docx';
    return 'image';
  }
  
  private convertToGsUri(httpsUrl: string): string {
    try {
      const url = new URL(httpsUrl);
      
      // Handle multiple GCS URL formats - check specific patterns first!
      
      // Format 1: https://storage.googleapis.com/download/storage/v1/b/bucket/o/object
      if (url.pathname.startsWith('/download/storage/v1/b/')) {
        const pathMatch = url.pathname.match(/\/download\/storage\/v1\/b\/([^/]+)\/o\/(.+)/);
        if (pathMatch) {
          const bucketName = pathMatch[1];
          const objectName = decodeURIComponent(pathMatch[2]);
          return `gs://${bucketName}/${objectName}`;
        }
      }
      
      // Format 2: https://bucket-name.storage.googleapis.com/object-name
      if (url.hostname.endsWith('.storage.googleapis.com')) {
        const bucketName = url.hostname.replace('.storage.googleapis.com', '');
        const objectName = url.pathname.substring(1); // Remove leading /
        if (bucketName && objectName) {
          return `gs://${bucketName}/${decodeURIComponent(objectName)}`;
        }
      }
      
      // Format 3: https://storage.googleapis.com/bucket-name/object-name (simple path)
      if (url.hostname === 'storage.googleapis.com' && !url.pathname.startsWith('/download/')) {
        const pathParts = url.pathname.split('/').filter(part => part);
        if (pathParts.length >= 2) {
          const bucketName = pathParts[0];
          const objectName = pathParts.slice(1).join('/');
          return `gs://${bucketName}/${decodeURIComponent(objectName)}`;
        }
      }
      
      // Format 4: https://storage.cloud.google.com/bucket-name/object-name
      if (url.hostname === 'storage.cloud.google.com') {
        const pathParts = url.pathname.split('/').filter(part => part);
        if (pathParts.length >= 2) {
          const bucketName = pathParts[0];
          const objectName = pathParts.slice(1).join('/');
          return `gs://${bucketName}/${decodeURIComponent(objectName)}`;
        }
      }
      
      throw new Error(`Unsupported Google Cloud Storage URL format. Host: ${url.hostname}, Path: ${url.pathname.substring(0, 50)}...`);
    } catch (error) {
      console.error('URL conversion failed for:', httpsUrl.substring(0, 50) + '...');
      throw new Error(`Failed to convert URL to gs:// format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  private async extractTextFromDocument(gsUri: string, mimeType: string): Promise<string> {
    try {
      const docType = mimeType === 'application/pdf' ? 'PDF' : 'TIFF';
      console.log(`Processing ${docType} with Vision API asyncBatchAnnotateFiles:`, gsUri.substring(0, 30) + '...');
      
      // Create temporary output location in the same bucket
      const bucketName = gsUri.split('/')[2];
      const timestamp = Date.now();
      const outputPrefix = `vision-output/${timestamp}/`;
      const outputUri = `gs://${bucketName}/${outputPrefix}`;
      
      console.log('Using output URI:', outputUri);
      
      // Use asyncBatchAnnotateFiles for document processing
      const [operation] = await this.client.asyncBatchAnnotateFiles({
        requests: [{
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          inputConfig: {
            gcsSource: { uri: gsUri },
            mimeType: mimeType
          },
          outputConfig: {
            gcsDestination: { uri: outputUri }
          }
        }]
      });
      
      console.log(`Waiting for ${docType} processing operation to complete...`);
      const [result] = await operation.promise();
      
      // Read all output files from Google Cloud Storage
      const outputBucket = this.storage.bucket(bucketName);
      const [files] = await outputBucket.getFiles({ 
        prefix: outputPrefix,
        autoPaginate: false
      });
      
      if (files.length === 0) {
        throw new Error(`No output files found from ${docType} processing`);
      }
      
      console.log(`Found ${files.length} output files from Vision API`);
      
      // Sort files by name to ensure proper order (output-1-to-5.json, etc.)
      files.sort((a, b) => a.name.localeCompare(b.name));
      
      // Read and parse all output files
      let extractedText = '';
      for (const file of files) {
        try {
          const [content] = await file.download();
          const jsonResult = JSON.parse(content.toString());
          
          // Extract text from each response
          if (jsonResult.responses) {
            for (const response of jsonResult.responses) {
              if (response.fullTextAnnotation && response.fullTextAnnotation.text) {
                extractedText += response.fullTextAnnotation.text;
                if (!extractedText.endsWith('\n')) {
                  extractedText += '\n';
                }
              }
            }
          }
        } catch (parseError) {
          console.warn(`Failed to parse output file ${file.name}:`, parseError);
        }
      }
      
      // Clean up output files
      try {
        await Promise.all(files.map(file => file.delete().catch(err => {
          console.warn(`Failed to delete ${file.name}:`, err);
        })));
        console.log('Cleaned up temporary Vision API output files');
      } catch (cleanupError) {
        console.warn('Failed to clean up some temporary files:', cleanupError);
      }
      
      if (!extractedText.trim()) {
        throw new Error(`No text detected in the ${docType} document`);
      }
      
      console.log(`Successfully extracted text from ${docType}, length:`, extractedText.length);
      return extractedText.trim();
      
    } catch (error) {
      console.error(`${mimeType} processing failed:`, error);
      throw new Error(`Document processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async downloadWithFallback(gsUri: string): Promise<Buffer> {
    console.log('Attempting to download file with fallback authentication:', gsUri.substring(0, 30) + '...');
    
    const bucketName = gsUri.split('/')[2];
    const objectName = gsUri.split('/').slice(3).join('/');
    
    // Try user credentials first
    try {
      console.log('Trying download with user credentials...');
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(objectName);
      const [fileBuffer] = await file.download();
      console.log('✅ Download successful with user credentials');
      return fileBuffer;
    } catch (userError) {
      console.log('❌ User credentials failed:', userError instanceof Error ? userError.message : String(userError));
      
      // Fallback to Replit's storage client
      try {
        console.log('Trying download with Replit storage client...');
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectName);
        const [fileBuffer] = await file.download();
        console.log('✅ Download successful with Replit credentials');
        return fileBuffer;
      } catch (replitError) {
        console.error('❌ Both credential methods failed');
        console.error('User credentials error:', userError instanceof Error ? userError.message : String(userError));
        console.error('Replit credentials error:', replitError instanceof Error ? replitError.message : String(replitError));
        throw new Error(`Failed to download file from ${bucketName}: Both authentication methods failed. User error: ${userError instanceof Error ? userError.message : String(userError)}. Replit error: ${replitError instanceof Error ? replitError.message : String(replitError)}`);
      }
    }
  }

  private async extractTextFromPDFBuffer(fileBuffer: Buffer): Promise<string> {
    try {
      console.log('Processing PDF using direct text extraction..., file size:', fileBuffer.length);
      
      // Load the PDF document from buffer (convert Buffer to Uint8Array)
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(fileBuffer) });
      const pdfDocument = await loadingTask.promise;
      
      console.log(`PDF loaded with ${pdfDocument.numPages} pages`);
      
      if (pdfDocument.numPages === 0) {
        throw new Error('PDF has no pages');
      }
      
      // Extract text from each page
      let combinedText = '';
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        console.log(`Extracting text from page ${pageNum}/${pdfDocument.numPages}...`);
        
        try {
          // Get the page
          const page = await pdfDocument.getPage(pageNum);
          
          // Extract text content directly from PDF
          const textContent = await page.getTextContent();
          console.log(`Page ${pageNum} has ${textContent.items.length} text items`);
          
          // Combine all text items from the page with proper spacing
          const pageText = textContent.items
            .map((item: any) => {
              // Each item has str (text) and transform (positioning)
              const text = item.str;
              if (text.trim()) {
                return text;
              }
              return '';
            })
            .filter(text => text.length > 0)
            .join(' ')
            .trim();
          
          if (pageText) {
            combinedText += pageText;
            if (!combinedText.endsWith('\n')) {
              combinedText += '\n';
            }
            console.log(`✅ Page ${pageNum} processed, extracted ${pageText.length} characters`);
            console.log(`First 100 chars of page ${pageNum}:`, pageText.substring(0, 100));
          } else {
            console.log(`⚠️ Page ${pageNum} contained no text`);
          }
        } catch (pageError) {
          console.warn(`Failed to process page ${pageNum}:`, pageError);
          // Continue with other pages even if one fails
        }
      }
      
      if (!combinedText.trim()) {
        console.error('No text extracted from PDF - this might be an image-based PDF');
        // Fallback to Vision API for image-based PDFs
        console.log('Falling back to Vision API for image-based PDF...');
        return await this.extractTextFromImageBuffer(fileBuffer);
      }
      
      console.log(`✅ Successfully extracted text from PDF (${pdfDocument.numPages} pages), total length:`, combinedText.length);
      console.log('First 200 chars of extracted text:', combinedText.substring(0, 200));
      return combinedText.trim();
      
    } catch (error) {
      console.error('PDF processing failed:', error);
      console.log('Attempting fallback to Vision API...');
      // Fallback to Vision API if PDF processing fails
      try {
        return await this.extractTextFromImageBuffer(fileBuffer);
      } catch (fallbackError) {
        console.error('Vision API fallback also failed:', fallbackError);
        throw new Error(`PDF processing failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async extractTextFromImageBuffer(imageBuffer: Buffer): Promise<string> {
    try {
      // Use Vision API textDetection for image buffers (works great for images)
      const [result] = await this.client.textDetection({
        image: { content: imageBuffer }
      });

      const detections = result.textAnnotations;
      if (!detections || detections.length === 0) {
        return '';
      }

      // First annotation contains the full text
      const fullText = detections[0]?.description || '';
      return fullText;
    } catch (error) {
      console.error('Image OCR failed:', error);
      throw new Error(`Image OCR failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async extractTextFromDOCXBuffer(docxBuffer: Buffer): Promise<string> {
    try {
      console.log('Extracting text from DOCX buffer, size:', docxBuffer.length, 'bytes');
      
      // Use mammoth to extract text from DOCX
      const result = await mammoth.extractRawText({ buffer: docxBuffer });
      const extractedText = result.value;
      
      console.log('DOCX text extraction completed, length:', extractedText.length);
      console.log('First 200 chars:', extractedText.substring(0, 200));
      
      if (result.messages && result.messages.length > 0) {
        console.log('DOCX extraction warnings:', result.messages.map(m => m.message).join(', '));
      }
      
      if (!extractedText.trim()) {
        throw new Error('No text extracted from DOCX file');
      }
      
      return extractedText.trim();
    } catch (error) {
      console.error('DOCX text extraction failed:', error);
      throw new Error(`DOCX processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async uploadWithFallback(bucketName: string, filePath: string, fileBuffer: Buffer, mimeType: string): Promise<void> {
    console.log('Attempting to upload file with fallback authentication:', filePath);
    
    // Try user credentials first
    try {
      console.log('Trying upload with user credentials...');
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(filePath);
      await file.save(fileBuffer, {
        metadata: {
          contentType: mimeType
        }
      });
      console.log('✅ Upload successful with user credentials');
      return;
    } catch (userError) {
      console.log('❌ User credentials upload failed:', userError instanceof Error ? userError.message : String(userError));
      
      // Fallback to Replit's storage client
      try {
        console.log('Trying upload with Replit storage client...');
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(filePath);
        await file.save(fileBuffer, {
          metadata: {
            contentType: mimeType
          }
        });
        console.log('✅ Upload successful with Replit credentials');
        return;
      } catch (replitError) {
        console.error('❌ Both credential methods failed for upload');
        console.error('User credentials error:', userError instanceof Error ? userError.message : String(userError));
        console.error('Replit credentials error:', replitError instanceof Error ? replitError.message : String(replitError));
        throw new Error(`Failed to upload file to ${bucketName}/${filePath}: Both authentication methods failed. User error: ${userError instanceof Error ? userError.message : String(userError)}. Replit error: ${replitError instanceof Error ? replitError.message : String(replitError)}`);
      }
    }
  }

  private async listFilesWithFallback(bucketName: string, prefix: string): Promise<any[]> {
    console.log('Attempting to list files with fallback authentication, prefix:', prefix);
    
    // Try user credentials first
    try {
      console.log('Trying list files with user credentials...');
      const bucket = this.storage.bucket(bucketName);
      const [files] = await bucket.getFiles({ 
        prefix: prefix,
        autoPaginate: true 
      });
      console.log('✅ List files successful with user credentials');
      return files;
    } catch (userError) {
      console.log('❌ User credentials list failed:', userError instanceof Error ? userError.message : String(userError));
      
      // Fallback to Replit's storage client
      try {
        console.log('Trying list files with Replit storage client...');
        const bucket = objectStorageClient.bucket(bucketName);
        const [files] = await bucket.getFiles({ 
          prefix: prefix,
          autoPaginate: true 
        });
        console.log('✅ List files successful with Replit credentials');
        return files;
      } catch (replitError) {
        console.error('❌ Both credential methods failed for listing files');
        console.error('User credentials error:', userError instanceof Error ? userError.message : String(userError));
        console.error('Replit credentials error:', replitError instanceof Error ? replitError.message : String(replitError));
        throw new Error(`Failed to list files in ${bucketName} with prefix ${prefix}: Both authentication methods failed. User error: ${userError instanceof Error ? userError.message : String(userError)}. Replit error: ${replitError instanceof Error ? replitError.message : String(replitError)}`);
      }
    }
  }

  private async deleteFileWithFallback(bucketName: string, filePath: string): Promise<void> {
    console.log('Attempting to delete file with fallback authentication:', filePath);
    
    // Try user credentials first
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(filePath);
      await file.delete();
      console.log('✅ Delete successful with user credentials');
      return;
    } catch (userError) {
      console.log('❌ User credentials delete failed:', userError instanceof Error ? userError.message : String(userError));
      
      // Fallback to Replit's storage client
      try {
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(filePath);
        await file.delete();
        console.log('✅ Delete successful with Replit credentials');
        return;
      } catch (replitError) {
        console.error('❌ Both credential methods failed for delete');
        console.error('User credentials error:', userError instanceof Error ? userError.message : String(userError));
        console.error('Replit credentials error:', replitError instanceof Error ? replitError.message : String(replitError));
        throw new Error(`Failed to delete file ${bucketName}/${filePath}: Both authentication methods failed. User error: ${userError instanceof Error ? userError.message : String(userError)}. Replit error: ${replitError instanceof Error ? replitError.message : String(replitError)}`);
      }
    }
  }
}
