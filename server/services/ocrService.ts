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

      // Set default project ID if not provided
      if (!clientConfig.projectId) {
        clientConfig.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'traduccion-471914';
      }

      this.client = new ImageAnnotatorClient(clientConfig);
      
    } catch (error) {
      console.error('Failed to initialize Google Vision client:', error);
      throw error;
    }
  }

  async extractTextFromFile(filePath: string): Promise<string> {
    try {
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
