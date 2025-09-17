import { ImageAnnotatorClient } from '@google-cloud/vision';

export class OCRService {
  private client: ImageAnnotatorClient;

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
      
    } catch (error) {
      console.error('Failed to initialize Google Vision client:', error);
      throw error;
    }
  }

  async extractTextFromFile(filePath: string): Promise<string> {
    try {
      // Check if filePath is a URL (signed URL from Google Cloud Storage)
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        console.log('Downloading file from URL for OCR processing:', filePath.substring(0, 50) + '...');
        
        // Download the file content from the URL
        const response = await fetch(filePath);
        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Process the downloaded buffer
        return await this.extractTextFromBuffer(buffer);
      }
      
      // For local file paths or gs:// URIs, use direct file detection
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
}
