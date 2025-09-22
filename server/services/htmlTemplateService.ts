import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export class HTMLTemplateService {
  
  async generateDIANDocument(extractedData: any): Promise<Buffer> {
    console.log('Generating professional DIAN tax form with extracted data:', extractedData);
    
    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Standard letter size
    const { width, height } = page.getSize();
    
    // Embed fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    // Header section with professional layout
    this.drawHeader(page, font, boldFont, width, height);
    
    // Basic Information section with borders
    let currentY = height - 120;
    currentY = this.drawBasicInfoSection(page, font, boldFont, width, currentY, extractedData);
    
    // Declarant Information section with table structure
    currentY -= 20;
    currentY = this.drawDeclarantSection(page, font, boldFont, width, currentY, extractedData);
    
    // Economic Activity section
    currentY -= 20;  
    currentY = this.drawEconomicActivitySection(page, font, boldFont, width, currentY, extractedData);
    
    // Assets and Liabilities section
    currentY -= 20;
    currentY = this.drawAssetsSection(page, font, boldFont, width, currentY, extractedData);
    
    // Income section with table structure
    currentY -= 20;
    this.drawIncomeSection(page, font, boldFont, width, currentY);
    
    console.log('Successfully created professional DIAN tax form PDF');
    
    // Save the PDF
    const filledPdfBytes = await pdfDoc.save();
    return Buffer.from(filledPdfBytes);
  }
  
  private drawHeader(page: any, font: any, boldFont: any, width: number, height: number) {
    // Draw border around entire form
    page.drawRectangle({
      x: 30,
      y: height - 770,
      width: width - 60,
      height: 730,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    // Header with DIAN and form title
    page.drawRectangle({
      x: 40,
      y: height - 80,
      width: 80,
      height: 30,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText('DIAN', {
      x: 50,
      y: height - 70,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Title section
    page.drawRectangle({
      x: 120,
      y: height - 80,
      width: 350,
      height: 30,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText('Income Tax Return and Complementary Return for Resident', {
      x: 125,
      y: height - 60,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    page.drawText('Individuals and Equivalent Taxpayers, and Estates of Resident Decedents', {
      x: 125,
      y: height - 73,
      size: 10,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Form number box
    page.drawRectangle({
      x: 470,
      y: height - 80,
      width: 100,
      height: 30,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    page.drawText('PRIVATE', {
      x: 475,
      y: height - 60,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    page.drawText('210', {
      x: 520,
      y: height - 70,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
  }
  
  private drawBasicInfoSection(page: any, font: any, boldFont: any, width: number, startY: number, extractedData: any): number {
    let currentY = startY;
    
    // Basic Information section border
    page.drawRectangle({
      x: 40,
      y: currentY - 60,
      width: width - 80,
      height: 60,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    // Year field
    page.drawRectangle({
      x: 50,
      y: currentY - 30,
      width: 60,
      height: 20,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });
    
    page.drawText('1. Year', {
      x: 52,
      y: currentY - 20,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(extractedData.year || '2023', {
      x: 52,
      y: currentY - 28,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Form Number field  
    page.drawRectangle({
      x: 400,
      y: currentY - 30,
      width: 120,
      height: 20,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });
    
    page.drawText('4. Form Number:', {
      x: 402,
      y: currentY - 20,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(extractedData.tax_id || '2118615051596', {
      x: 402,
      y: currentY - 28,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Barcode area
    page.drawRectangle({
      x: 50,
      y: currentY - 50,
      width: 470,
      height: 15,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
      color: rgb(0.95, 0.95, 0.95),
    });
    
    page.drawText('Space reserved for use by DIAN', {
      x: 52,
      y: currentY - 47,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    page.drawText('/barcode/', {
      x: 300,
      y: currentY - 47,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    page.drawText('/barcode/', {
      x: 450,
      y: currentY - 47,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5),
    });
    
    return currentY - 60;
  }
  
  private drawDeclarantSection(page: any, font: any, boldFont: any, width: number, startY: number, extractedData: any): number {
    let currentY = startY;
    
    // Declarant Information section border
    page.drawRectangle({
      x: 40,
      y: currentY - 80,
      width: width - 80,
      height: 80,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    // Row 1: NIT and VD
    page.drawRectangle({
      x: 50,
      y: currentY - 30,
      width: 150,
      height: 20,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });
    
    page.drawText('5. Tax Identification Number (NIT):', {
      x: 52,
      y: currentY - 20,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    page.drawText(extractedData.tax_id || 'N/A', {
      x: 52,
      y: currentY - 28,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    page.drawRectangle({
      x: 200,
      y: currentY - 30,
      width: 40,
      height: 20,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });
    
    page.drawText('6. VD:', {
      x: 202,
      y: currentY - 20,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    page.drawText('X', {
      x: 215,
      y: currentY - 28,
      size: 10,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    // Row 2: Names
    const nameFields = [
      { x: 50, width: 90, label: '7. First Surname', value: extractedData.first_surname || 'N/A' },
      { x: 140, width: 90, label: '8. Second Surname', value: extractedData.second_surname || 'N/A' },
      { x: 230, width: 90, label: '9. First Name:', value: extractedData.first_name || 'N/A' },
      { x: 320, width: 90, label: '10. Other Names', value: extractedData.other_names || 'N/A' },
      { x: 410, width: 110, label: '12. Regional Office Code:', value: 'XX' }
    ];
    
    nameFields.forEach(field => {
      page.drawRectangle({
        x: field.x,
        y: currentY - 60,
        width: field.width,
        height: 20,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      
      page.drawText(field.label, {
        x: field.x + 2,
        y: currentY - 50,
        size: 7,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      page.drawText(field.value, {
        x: field.x + 2,
        y: currentY - 58,
        size: 9,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    });
    
    return currentY - 80;
  }
  
  private drawEconomicActivitySection(page: any, font: any, boldFont: any, width: number, startY: number, extractedData: any): number {
    let currentY = startY;
    
    // Economic Activity section border
    page.drawRectangle({
      x: 40,
      y: currentY - 50,
      width: width - 80,
      height: 50,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    const activityFields = [
      { x: 50, width: 150, label: '24. Main Economic Activity:', value: extractedData.economic_activity || 'N/A' },
      { x: 200, width: 60, label: '25. Code:', value: 'XX' },
      { x: 260, width: 100, label: '26. Prior Year Return No.:', value: extractedData.prior_year || 'N/A' },
      { x: 360, width: 80, label: '27. Partial-Year Return:', value: '' },
      { x: 440, width: 80, label: '28. 1% purchases:', value: extractedData.purchases || 'N/A' }
    ];
    
    activityFields.forEach(field => {
      page.drawRectangle({
        x: field.x,
        y: currentY - 30,
        width: field.width,
        height: 20,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      
      page.drawText(field.label, {
        x: field.x + 2,
        y: currentY - 20,
        size: 7,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      page.drawText(field.value, {
        x: field.x + 2,
        y: currentY - 28,
        size: 9,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    });
    
    return currentY - 50;
  }
  
  private drawAssetsSection(page: any, font: any, boldFont: any, width: number, startY: number, extractedData: any): number {
    let currentY = startY;
    
    // Assets section border
    page.drawRectangle({
      x: 40,
      y: currentY - 40,
      width: width - 80,
      height: 40,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });
    
    const assetFields = [
      { x: 50, width: 120, label: '29. Total Gross Assets:', value: extractedData.total_assets || 'N/A' },
      { x: 170, width: 120, label: '30. Liabilities/Debts:', value: extractedData.liabilities || 'N/A' },
      { x: 290, width: 120, label: '31. Net Worth:', value: extractedData.net_worth || 'N/A' }
    ];
    
    assetFields.forEach(field => {
      page.drawRectangle({
        x: field.x,
        y: currentY - 25,
        width: field.width,
        height: 20,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      
      page.drawText(field.label, {
        x: field.x + 2,
        y: currentY - 15,
        size: 7,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      page.drawText(field.value, {
        x: field.x + 2,
        y: currentY - 23,
        size: 9,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    });
    
    return currentY - 40;
  }
  
  private drawIncomeSection(page: any, font: any, boldFont: any, width: number, startY: number) {
    let currentY = startY;
    
    // Income Section title
    page.drawRectangle({
      x: 40,
      y: currentY - 20,
      width: width - 80,
      height: 20,
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
      color: rgb(0.9, 0.9, 0.9),
    });
    
    page.drawText('Income Section', {
      x: 50,
      y: currentY - 15,
      size: 12,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    
    currentY -= 20;
    
    // Table headers
    const headers = ['Sources/Income', 'Column 1', 'Column 2', 'Column 3', 'Column 4'];
    const colWidths = [200, 80, 80, 80, 80];
    let xPos = 40;
    
    headers.forEach((header, index) => {
      page.drawRectangle({
        x: xPos,
        y: currentY - 20,
        width: colWidths[index],
        height: 20,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
        color: rgb(0.95, 0.95, 0.95),
      });
      
      page.drawText(header, {
        x: xPos + 5,
        y: currentY - 15,
        size: 8,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      
      xPos += colWidths[index];
    });
    
    currentY -= 20;
    
    // Table rows
    const incomeRows = [
      '32-43-58-74. Gross Income',
      '75. Refunds, Rebates and Discounts',
      '33-44-59-76. Non-Taxable Income',
      '45-60-77. Allowable Costs and Deductions',
      '34-46-61-78. Taxable Income'
    ];
    
    incomeRows.forEach(rowLabel => {
      xPos = 40;
      
      // Row label
      page.drawRectangle({
        x: xPos,
        y: currentY - 20,
        width: colWidths[0],
        height: 20,
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      
      page.drawText(rowLabel, {
        x: xPos + 5,
        y: currentY - 15,
        size: 7,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      xPos += colWidths[0];
      
      // Data columns
      for (let i = 1; i < colWidths.length; i++) {
        page.drawRectangle({
          x: xPos,
          y: currentY - 20,
          width: colWidths[i],
          height: 20,
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.5,
        });
        xPos += colWidths[i];
      }
      
      currentY -= 20;
    });
  }
}