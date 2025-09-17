import { ImageAnnotatorClient } from '@google-cloud/vision';
import { Storage } from '@google-cloud/storage';

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
      
      // Check if filePath is a URL (signed URL from Google Cloud Storage)
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        // Download and detect file type
        const response = await fetch(filePath);
        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Detect file type from buffer
        const fileType = this.detectFileType(buffer, filePath);
        console.log('Detected file type:', fileType);
        
        if (fileType === 'pdf' || fileType === 'tiff') {
          // Convert signed URL to gs:// format and process as document
          const gsUri = this.convertToGsUri(filePath);
          const mimeType = fileType === 'pdf' ? 'application/pdf' : 'image/tiff';
          return await this.extractTextFromDocument(gsUri, mimeType);
        } else {
          // Process as image
          return await this.extractTextFromBuffer(buffer);
        }
      }
      
      // For gs:// URIs, detect type and process accordingly
      if (filePath.startsWith('gs://')) {
        const fileType = this.detectFileTypeFromPath(filePath);
        if (fileType === 'pdf' || fileType === 'tiff') {
          const mimeType = fileType === 'pdf' ? 'application/pdf' : 'image/tiff';
          return await this.extractTextFromDocument(filePath, mimeType);
        }
      }
      
      // For local file paths or image gs:// URIs, use direct image detection
      const [result] = await this.client.textDetection(filePath);
      const detections = result.textAnnotations;
      
      if (!detections || detections.length === 0) {
        throw new Error('No text detected in the document');
      }

      // The first detection contains the entire text
      return detections[0].description || '';
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

  private detectFileType(buffer: Buffer, filePath: string): 'pdf' | 'tiff' | 'image' {
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
    
    // Check file extension as fallback
    return this.detectFileTypeFromPath(filePath);
  }
  
  private detectFileTypeFromPath(filePath: string): 'pdf' | 'tiff' | 'image' {
    // Extract extension, handling URLs with query parameters
    const pathWithoutQuery = filePath.split('?')[0];
    const extension = pathWithoutQuery.toLowerCase().split('.').pop() || '';
    
    if (extension === 'pdf') return 'pdf';
    if (['tiff', 'tif'].includes(extension)) return 'tiff';
    return 'image';
  }
  
  private convertToGsUri(httpsUrl: string): string {
    try {
      const url = new URL(httpsUrl);
      
      // Handle multiple GCS URL formats
      if (url.hostname === 'storage.googleapis.com') {
        // Format: https://storage.googleapis.com/bucket-name/object-name
        const pathParts = url.pathname.split('/').filter(part => part);
        if (pathParts.length >= 2) {
          const bucketName = pathParts[0];
          const objectName = pathParts.slice(1).join('/');
          return `gs://${bucketName}/${objectName}`;
        }
      } else if (url.hostname.endsWith('.storage.googleapis.com')) {
        // Format: https://bucket-name.storage.googleapis.com/object-name
        const bucketName = url.hostname.replace('.storage.googleapis.com', '');
        const objectName = url.pathname.substring(1); // Remove leading /
        return `gs://${bucketName}/${objectName}`;
      } else if (url.pathname.startsWith('/download/storage/v1/b/')) {
        // Format: https://storage.googleapis.com/download/storage/v1/b/bucket/o/object
        const pathMatch = url.pathname.match(/\/download\/storage\/v1\/b\/([^/]+)\/o\/(.+)/);
        if (pathMatch) {
          const bucketName = pathMatch[1];
          const objectName = decodeURIComponent(pathMatch[2]);
          return `gs://${bucketName}/${objectName}`;
        }
      }
      
      throw new Error('Invalid Google Cloud Storage URL format');
    } catch (error) {
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
}
