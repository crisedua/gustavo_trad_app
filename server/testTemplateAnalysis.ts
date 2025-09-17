import { TemplateAnalysisService } from './services/templateAnalysisService';
import * as path from 'path';

/**
 * Simple test function to verify template analysis service functionality
 */
async function testTemplateAnalysis() {
  console.log('🧪 Starting Template Analysis Service Test...\n');

  try {
    // Initialize the service
    const analysisService = new TemplateAnalysisService();
    console.log('✅ Template Analysis Service initialized successfully\n');

    // Test with the marriage certificate template
    const testFilePath = path.join(process.cwd(), 'attached_assets/Registro_Matrimonio_Template_with_header_1758119503199.pdf');
    console.log('📄 Testing with marriage certificate template:', testFilePath);

    console.log('🔍 Starting template analysis...');
    const startTime = Date.now();

    // Analyze the template
    const analysisResult = await analysisService.analyzeTemplate(testFilePath);

    const endTime = Date.now();
    const processingTime = endTime - startTime;

    console.log('\n✅ Template Analysis Completed Successfully!');
    console.log('⏱️  Processing Time:', processingTime, 'ms');
    console.log('\n📊 Analysis Results:');
    console.log('  • Total Markers Found:', analysisResult.analysisReport.totalMarkersFound);
    console.log('  • Fields Identified:', analysisResult.analysisReport.fieldsIdentified);
    console.log('  • Average Confidence:', (analysisResult.analysisReport.averageConfidence * 100).toFixed(1) + '%');
    console.log('  • Document Type:', analysisResult.analysisReport.documentType || 'Unknown');

    console.log('\n🗂️  Detected Fields:');
    const fieldNames = Object.keys(analysisResult.fieldMappings);
    fieldNames.forEach((fieldName, index) => {
      const field = analysisResult.fieldMappings[fieldName];
      console.log(`  ${index + 1}. ${fieldName}`);
      console.log(`     Type: ${field.fieldDefinition.type}`);
      console.log(`     Label: ${field.fieldDefinition.label}`);
      console.log(`     Instances: ${field.instances.length}`);
      console.log(`     Confidence: ${((field.detectionSummary?.averageConfidence || 0) * 100).toFixed(1)}%`);
      
      // Show position info for first instance
      if (field.instances.length > 0) {
        const firstInstance = field.instances[0];
        console.log(`     Position: Page ${firstInstance.coordinates.page}, x=${firstInstance.coordinates.rect.x.toFixed(0)}, y=${firstInstance.coordinates.rect.y.toFixed(0)}`);
      }
      console.log('');
    });

    console.log('🎯 Detection Metadata:');
    console.log('  • Detection Method:', analysisResult.detectionMetadata.detectionMethod);
    console.log('  • Overall Confidence:', ((analysisResult.detectionMetadata.confidence || 0) * 100).toFixed(1) + '%');
    console.log('  • Processing Time:', analysisResult.detectionMetadata.processingTime, 'ms');

    // Test automated template creation
    console.log('\n🚀 Testing Automated Template Creation...');
    const autoTemplate = await analysisService.createAutomatedTemplate(
      testFilePath,
      'Test Marriage Certificate Template',
      'Automatically generated template from test document'
    );

    console.log('✅ Automated Template Created Successfully!');
    console.log('  • Template Name:', autoTemplate.templateName);
    console.log('  • Template Type:', autoTemplate.templateType);
    console.log('  • Fields Detected:', Object.keys(autoTemplate.fieldMappings).length);
    console.log('  • Confidence:', ((autoTemplate.detectionMetadata?.confidence || 0) * 100).toFixed(1) + '%');

    console.log('\n🎉 All tests passed successfully!\n');
    return true;

  } catch (error) {
    console.error('\n❌ Template Analysis Test Failed:');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace available');
    console.log('\n💡 This might be due to:');
    console.log('  • Missing Google Cloud credentials');
    console.log('  • OpenAI API key not configured');
    console.log('  • File path issues');
    console.log('  • PDF processing dependencies');
    return false;
  }
}

/**
 * Run the test if called directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  testTemplateAnalysis()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

export { testTemplateAnalysis };