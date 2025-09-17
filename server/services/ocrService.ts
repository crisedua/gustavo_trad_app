import { ImageAnnotatorClient } from '@google-cloud/vision';

export class OCRService {
  private client: ImageAnnotatorClient;

  constructor() {
    // Use your specific Google Cloud credentials
    const credentials = {
      type: "service_account",
      project_id: "traduccion-471914",
      private_key_id: "d27e5cab123f589e8e9a5e200137d135dd6097f8",
      private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDvFTJPQTdQIN7v\n1vif7aTRXDbpJU9CjUhKDZOZNIyCnOs+B5PoWHnP+KjlbboztDv9YAECevpZJBt2\nir3zIfqCpP/mxfXkwzv9SnrrWh5ix6HwkHLka24ui+cOLdHNgYIHWsUKE6NBAO9O\nXf5i5Ht3CR4ibpaH3laxmRb2B8OWkdbHuaSBZl+k+EvWPqJs+xEKwwjTVfjmQRNl\nyI/vgGwFWaYaJB50jR/oJdkb2TcoC9HjSVGkDLcWqvzd4AZjWaO/d51JQS90mInA\nzCA7uiPZBQmSypSgWKf5j3/tzOgoKN394g3/9gQ74BuKeemxrFdsS+tZN4TwiHhW\ncHPEBePZAgMBAAECggEAFngYTlKDiRUakdFsp4froX4+ut9pLFWfoZxwO3z9mswP\nxh8E/r6x7aKIKc4lXcHM9+pGrgQyWwZSfmvzn7hlyFMLEC+ZBT+qXgratBu4F1h9\nShQi3n/3AiQSOi1PaZzuREd6yF1BtO49j1C0g6uT3umm2pDCHOrMaWYV1/F+DdX6\nCHfMr5wNABb6WNBS/p2uYJptF1zH3riRYThxO4xlsKyz4gfaSzPMOBtaL6pjD6mB\nwKXyVfFXade0uF++2FMo0Yd7prbz8aYEuK7DFMiskWhElhZGWQTv00uxZLXxY2R5\nT9Sy6qalRrOV1ecdiqGCT44Yeawsuh5LC9Y+ZbIM8QKBgQD/g9C8OKUSX/o2gThJ\n7Fr57rQJExAeVKLeddp6NVTvrrEscobhCCQ32xmFnuDUl3+cVHWM6IBL0QuDiiBV\n90hmgqLmYC+sH/mYPYPePLpFaKNgFFAyriiL/+Xon6mU+wcnSIgj66Zj8u88hbr4\n1uujel+43gCFqIPR53OAQDbROwKBgQDviWUV3NulA2OY6k+SkdJCEyWsHeWGKkFm\nG5RWiLDnbc0YP52ooYZKi2uHRIT0+9NGQphTFcWnfYV2/wn4o/qUuc8lT/jUeK7n\nuXg/uHvwX+MxIIZNOgo8BQVm3/i1pMqZkVtDYq91b09hsyy5yN6wglkxZMbO30jm\nQOo83ohN+wKBgQDuMkzZ2piQK6cPPqFh0JPzIQL23q2NCOuYJRfaC3O1yQ3j2JRC\nnhtdcsQ1G6qOpPjSnK3FAU3w390y8AY6/b6hybDgwNRQSrKcqOQQvl4LrIN5YxZs\nWIz2DkWe+ZDWkLnXdjdr/RdtX6CEtEpcBcc/7CnmJhcogrL4cCLtcW9o1wKBgECF\nfNIPxKZFLG3DJ53uY3li2PHst6eU+Dq90Q4iEay0+dq/QANtRtQLi/JKtZmbv4Qc\nahVvNudvuySbfB8aZGPtTOvbB8aLn2lRnx9i3ReZbIQOI77nlFwoahUU3VRoSB5n\ndfLHwUVbr0E81x5QChP3eHkCkT6mDGfhMnck5ghDAoGBAO6GZ9xRea5C8BNepZ/N\nsyXDRq95ok9u3v/yrQLwjvW06QDDzcy1fpdW002/6KBRuqnsgJq+FRPhk1WtThpF\nKoryHwVT5hrXnG+mtisz/Sc6rIlQYMEC0kOlcQEJuwhMV2jnmjIULd1YERubxv8T\n9QH9GqVgwcJrPD6ydSs59G3o\n-----END PRIVATE KEY-----\n",
      client_email: "translation@traduccion-471914.iam.gserviceaccount.com",
      client_id: "113964214002221055106",
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/translation%40traduccion-471914.iam.gserviceaccount.com",
      universe_domain: "googleapis.com"
    };

    console.log('Initializing Google Vision client with credentials for project:', credentials.project_id);

    this.client = new ImageAnnotatorClient({
      credentials,
      projectId: credentials.project_id,
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
