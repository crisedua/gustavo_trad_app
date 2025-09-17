import { ImageAnnotatorClient } from '@google-cloud/vision';

export class OCRService {
  private client: ImageAnnotatorClient;

  constructor() {
    // Try to use credentials from environment variables first
    let credentials;
    let projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        projectId = credentials.project_id;
      } catch (error) {
        console.error('Failed to parse Google Cloud credentials JSON:', error);
      }
    }

    // Fallback to your specific project configuration
    if (!credentials && !projectId) {
      projectId = 'traduccion-471914';
      // For development, we'll create a basic configuration
      // In production, make sure to set GOOGLE_APPLICATION_CREDENTIALS_JSON properly
    }

    this.client = new ImageAnnotatorClient({
      ...(credentials && { credentials }),
      ...(process.env.GOOGLE_APPLICATION_CREDENTIALS && { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS }),
      projectId,
    });
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
