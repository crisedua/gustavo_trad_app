import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import { FileText, Upload, Clock, CheckCircle, AlertCircle, Download, Settings, HelpCircle, User, FileIcon, ArrowRight, TriangleAlert, Info } from "lucide-react";
import { Link } from "wouter";
import type { UploadResult } from "@uppy/core";

interface Template {
  id: string;
  name: string;
  description: string;
  filePath: string;
  fieldMappings: Record<string, any>;
  isAutoCreated?: boolean;
  sourceDocumentPath?: string;
  templateType?: string;
  detectionMetadata?: any;
  validationRules?: any;
  createdAt: string;
  updatedAt?: string;
}

interface ProcessingJob {
  id: string;
  originalFilePath: string;
  status: string;
  extractedData?: Record<string, string>;
  templateId?: string;
  extractedFieldValues?: Record<string, string>;
  generatedDocumentPath?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

const statusSteps = [
  { key: 'uploading', label: 'File Upload', icon: Upload },
  { key: 'ocr', label: 'OCR Text Extraction', icon: FileText },
  { key: 'extraction', label: 'AI Field Extraction', icon: Settings },
  { key: 'mapping', label: 'Template Mapping', icon: ArrowRight },
  { key: 'generation', label: 'Document Generation', icon: FileIcon },
  { key: 'completed', label: 'Completed', icon: CheckCircle },
];

export default function DocumentProcessor() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('default-marriage-cert');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; size: string; status: string }>>([]);
  const [showAllFields, setShowAllFields] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
  });

  // Fetch processing jobs
  const { data: processingJobs = [], isLoading: jobsLoading } = useQuery<ProcessingJob[]>({
    queryKey: ['/api/processing-jobs'],
    refetchInterval: currentJobId ? 2000 : false, // Poll if we have an active job
  });

  // Current job
  const currentJob = currentJobId ? processingJobs.find(job => job.id === currentJobId) : null;
  const selectedTemplate = selectedTemplateId ? templates.find(t => t.id === selectedTemplateId) : null;

  // Create processing job mutation
  const createJobMutation = useMutation({
    mutationFn: async (data: { originalFilePath: string; templateId?: string }) => {
      const res = await apiRequest('POST', '/api/processing-jobs', data);
      return res.json();
    },
    onSuccess: (job) => {
      setCurrentJobId(job.id);
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs'] });
      toast({
        title: "Processing Started",
        description: "Your document is being processed...",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Generate document mutation
  const generateDocumentMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest('POST', `/api/processing-jobs/${jobId}/generate`);
      return res.blob();
    },
    onSuccess: (blob, jobId) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'generated_document.pdf';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs'] });
      toast({
        title: "Document Generated",
        description: "Your document has been generated and downloaded.",
      });
    },
    onError: (error) => {
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update processing job mutation
  const updateJobMutation = useMutation({
    mutationFn: async (data: { jobId: string; updates: Partial<ProcessingJob> }) => {
      const res = await apiRequest('PATCH', `/api/processing-jobs/${data.jobId}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs'] });
    },
  });

  // Handle file upload
  const handleGetUploadParameters = useCallback(async () => {
    const res = await apiRequest('POST', '/api/objects/upload');
    const data = await res.json();
    return {
      method: 'PUT' as const,
      url: data.uploadURL,
    };
  }, []);

  const handleUploadComplete = useCallback((result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      const fileName = uploadedFile.name || 'document.pdf';
      
      setUploadedFiles([{
        name: fileName,
        size: `${(uploadedFile.size || 0 / (1024 * 1024)).toFixed(1)} MB`,
        status: 'Uploaded'
      }]);

      // Start processing
      createJobMutation.mutate({
        originalFilePath: uploadedFile.uploadURL || '',
        templateId: selectedTemplateId
      });
    }
  }, [selectedTemplateId, createJobMutation]);

  // Handle extracted data changes
  const handleExtractedDataChange = (field: string, value: string) => {
    if (!currentJob) return;
    
    const updatedData = { ...currentJob.extractedData, [field]: value };
    updateJobMutation.mutate({
      jobId: currentJob.id,
      updates: { extractedData: updatedData }
    });
  };

  // Get progress percentage
  const getProgressPercentage = (status: string) => {
    const stepIndex = statusSteps.findIndex(step => step.key === status);
    return stepIndex >= 0 ? ((stepIndex + 1) / statusSteps.length) * 100 : 0;
  };

  // Get status icon and color
  const getStatusDisplay = (step: typeof statusSteps[0], currentStatus: string) => {
    const currentIndex = statusSteps.findIndex(s => s.key === currentStatus);
    const stepIndex = statusSteps.findIndex(s => s.key === step.key);
    
    if (currentStatus === 'error') {
      return { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' };
    }
    
    if (stepIndex < currentIndex) {
      return { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100' };
    } else if (stepIndex === currentIndex) {
      return { icon: Clock, color: 'text-blue-600', bg: 'bg-blue-100' };
    } else {
      return { icon: step.icon, color: 'text-muted-foreground', bg: 'bg-muted' };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <FileText className="h-6 w-6 text-gray-700 dark:text-gray-300" data-testid="logo-icon" />
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white" data-testid="app-title">
                Document Processor
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                  Home
                </Button>
              </Link>
              <Link href="/admin/templates">
                <Button variant="outline" size="sm" data-testid="button-admin">
                  Template Admin
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-8">
          
          {/* Template Selection */}
          <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" data-testid="card-template-selection">
            <CardContent className="p-8">
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">1. Choose Template</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Select the template you want to fill with extracted data</p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="template-select" className="text-sm font-medium text-gray-900 dark:text-white">Template</Label>
                  <select
                    id="template-select"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full mt-2 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    data-testid="select-template"
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                {selectedTemplate && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{selectedTemplate.name}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {selectedTemplate.description || 'No description'}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {Object.keys(selectedTemplate.fieldMappings || {}).length} fields required
                    </div>
                  </div>
                )}
                
                <div className="text-center">
                  <Link href="/admin/templates">
                    <Button variant="outline" size="sm">
                      Manage Templates
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
            
          {/* Document Upload */}
          <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" data-testid="card-document-upload">
            <CardContent className="p-8">
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">2. Upload Document</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Upload the document to extract data for your selected template</p>
              </div>
              
              <ObjectUploader
                maxNumberOfFiles={1}
                maxFileSize={10485760} // 10MB
                onGetUploadParameters={handleGetUploadParameters}
                onComplete={handleUploadComplete}
                buttonClassName="w-full"
              >
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors" data-testid="upload-zone">
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Drop files here or click to browse</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">PDF, Images, or DOCX files up to 10MB</p>
                </div>
              </ObjectUploader>
                  
              {/* Uploaded Files */}
              {uploadedFiles.length > 0 && (
                <div className="mt-6 space-y-3" data-testid="uploaded-files">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                      <div className="flex items-center space-x-3">
                        <FileText className="h-5 w-5 text-gray-500" />
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white" data-testid={`file-name-${index}`}>{file.name}</span>
                          <div className="text-xs text-gray-500 dark:text-gray-400" data-testid={`file-size-${index}`}>{file.size}</div>
                        </div>
                      </div>
                      <div className="text-xs text-green-600 font-medium">{file.status}</div>
                    </div>
                  ))}
                </div>
              )}
              </CardContent>
            </Card>

          {/* Processing Status */}
          <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" data-testid="card-processing-status">
            <CardContent className="p-8">
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">3. Processing Status</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">AI-powered extraction and document processing</p>
              </div>
              
              {currentJob ? (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Overall Progress</span>
                    <span className="text-sm text-gray-500">{Math.round(getProgressPercentage(currentJob.status))}%</span>
                  </div>
                  <Progress value={getProgressPercentage(currentJob.status)} className="h-2" data-testid="progress-overall" />
                  
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Current step: <span className="font-medium">{statusSteps.find(s => s.key === currentJob.status)?.label || currentJob.status}</span>
                  </div>

                  {currentJob.status === 'error' && currentJob.errorMessage && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg" data-testid="error-message">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                        <div className="text-sm text-red-800 dark:text-red-200">
                          <div className="font-medium">Processing Error</div>
                          <div className="mt-1">{currentJob.errorMessage}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8" data-testid="no-active-job">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 text-sm">No document processing in progress</p>
                </div>
              )}
              </CardContent>
            </Card>

          {/* Extracted Data */}
          {currentJob?.extractedData && (
            <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" data-testid="card-extracted-data">
              <CardContent className="p-8">
                <div className="mb-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">4. Extracted Data</h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">Review and edit the extracted fields</p>
                </div>
                  
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(currentJob.extractedData)
                    .slice(0, showAllFields ? undefined : 6)
                    .map(([field, value]) => (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={field} className="text-sm font-medium text-gray-900 dark:text-white">
                        {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Label>
                      <Input
                        id={field}
                        value={value}
                        onChange={(e) => handleExtractedDataChange(field, e.target.value)}
                        className="w-full"
                        data-testid={`input-${field}`}
                      />
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-between mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowAllFields(!showAllFields)}
                    data-testid="button-show-all-fields"
                  >
                    {showAllFields 
                      ? `Show Less (${Object.keys(currentJob.extractedData).length > 6 ? '6' : Object.keys(currentJob.extractedData).length})` 
                      : `Show All Fields (${Object.keys(currentJob.extractedData).length})`
                    }
                  </Button>
                  <Button 
                    onClick={() => updateJobMutation.mutate({ 
                      jobId: currentJob.id, 
                      updates: { templateId: selectedTemplateId }
                    })}
                    data-testid="button-proceed-template"
                  >
                    Continue to Template
                  </Button>
                </div>
                </CardContent>
              </Card>
            )}
          
          {/* Generate Document */}
          {currentJob?.status === 'completed' && (
            <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" data-testid="card-document-generation">
              <CardContent className="p-8">
                <div className="mb-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">5. Generate Document</h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">Create the filled document using your template</p>
                </div>
                
                <Button 
                  onClick={() => generateDocumentMutation.mutate(currentJob.id)}
                  disabled={generateDocumentMutation.isPending}
                  className="w-full"
                  data-testid="button-generate-document"
                >
                  {generateDocumentMutation.isPending ? 'Generating...' : 'Generate Document'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
