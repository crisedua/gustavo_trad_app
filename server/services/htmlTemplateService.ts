import fs from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';

export class HTMLTemplateService {
  async fillDIANTemplate(extractedData: any): Promise<string> {
    try {
      // Read the HTML template
      const templatePath = path.join(process.cwd(), 'attached_assets', 'dian_tax_form_1758553965627.html');
      let htmlContent = await fs.readFile(templatePath, 'utf-8');
      
      // Replace form field values with extracted data
      const fieldMappings = {
        'year': extractedData.year || '2023',
        'form-number': extractedData.taxId || extractedData.form_number || '2118615051596',
        'nit': extractedData.taxId || extractedData.nit || '',
        'first-surname': extractedData.firstSurname || extractedData.first_surname || '',
        'second-surname': extractedData.secondSurname || extractedData.second_surname || '',
        'first-name': extractedData.firstName || extractedData.first_name || '',
        'other-names': extractedData.otherNames || extractedData.other_names || '',
        'regional-office': 'XX',
        'economic-activity': extractedData.economicActivity || '',
        'correction-code': '',
        'prior-year-return': '',
        'total-assets': '',
        'liabilities': '',
        'net-worth': ''
      };
      
      // Fill form fields by replacing input values
      Object.entries(fieldMappings).forEach(([fieldId, value]) => {
        if (value) {
          // Replace input field values
          const inputPattern = new RegExp(`(<input[^>]*id="${fieldId}"[^>]*)(>)`, 'gi');
          htmlContent = htmlContent.replace(inputPattern, (match, p1, p2) => {
            // Check if value attribute already exists
            if (p1.includes('value=')) {
              return p1.replace(/value="[^"]*"/, `value="${value}"`) + p2;
            } else {
              return p1 + ` value="${value}"` + p2;
            }
          });
        }
      });
      
      return htmlContent;
    } catch (error) {
      console.error('Error filling DIAN template:', error);
      throw new Error('Failed to process HTML template');
    }
  }
  
  async convertHTMLToPDF(htmlContent: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    try {
      const page = await browser.newPage();
      
      // Set content and wait for it to load
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      // Generate PDF with proper settings
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });
      
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
  
  async generateDIANDocument(extractedData: any): Promise<Buffer> {
    const filledHTML = await this.fillDIANTemplate(extractedData);
    const pdfBuffer = await this.convertHTMLToPDF(filledHTML);
    return pdfBuffer;
  }
}