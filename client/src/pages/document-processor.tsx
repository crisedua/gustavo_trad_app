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
import { FileText, Upload, Clock, CheckCircle, AlertCircle, Download, Settings, HelpCircle, User, Plus, FileIcon, ArrowRight, TriangleAlert, Info } from "lucide-react";
import type { UploadResult } from "@uppy/core";

interface Template {
  id: string;
  name: string;
  description: string;
  filePath: string;
  fields: string[];
  createdAt: string;
}

interface ProcessingJob {
  id: string;
  originalFilePath: string;
  status: string;
  extractedData?: Record<string, string>;
  templateId?: string;
  fieldMappings?: Record<string, string>;
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
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    description: '',
    fields: [] as string[]
  });
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; size: string; status: string }>>([]);

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
    <div className="bg-background text-foreground min-h-screen">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <FileText className="text-primary text-2xl" data-testid="logo-icon" />
                <h1 className="text-xl font-bold text-foreground" data-testid="app-title">Document Processor</h1>
              </div>
              <span className="text-sm text-muted-foreground">AI-Powered Document Extraction</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" data-testid="button-settings">
                <Settings className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" data-testid="button-help">
                <HelpCircle className="h-4 w-4" />
              </Button>
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium" data-testid="user-avatar">
                <User className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Document Upload & Processing */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Document Upload */}
            <Card data-testid="card-document-upload">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Document Upload</h2>
                  <span className="text-sm text-muted-foreground">Step 1 of 3</span>
                </div>
                
                <div className="space-y-4">
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10485760} // 10MB
                    onGetUploadParameters={handleGetUploadParameters}
                    onComplete={handleUploadComplete}
                    buttonClassName="w-full"
                  >
                    <div className="upload-zone border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer" data-testid="upload-zone">
                      <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-medium text-foreground mb-2">Drop your documents here</h3>
                      <p className="text-muted-foreground mb-4">or click to browse files</p>
                      <div className="flex justify-center space-x-4 text-sm text-muted-foreground">
                        <span><FileText className="inline h-4 w-4 text-red-500 mr-1" />PDF</span>
                        <span><FileIcon className="inline h-4 w-4 text-blue-500 mr-1" />Images</span>
                        <span><FileText className="inline h-4 w-4 text-green-500 mr-1" />DOCX</span>
                      </div>
                    </div>
                  </ObjectUploader>
                  
                  {/* Uploaded Files */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2" data-testid="uploaded-files">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                          <div className="flex items-center space-x-3">
                            <FileText className="h-5 w-5 text-red-500" />
                            <span className="text-sm font-medium" data-testid={`file-name-${index}`}>{file.name}</span>
                            <span className="text-xs text-muted-foreground" data-testid={`file-size-${index}`}>{file.size}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">{file.status}</span>
                            <Button variant="ghost" size="sm" data-testid={`button-remove-${index}`}>
                              <AlertCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Processing Status */}
            <Card data-testid="card-processing-status">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Processing Status</h2>
                  <span className="text-sm text-muted-foreground">Step 2 of 3</span>
                </div>
                
                {currentJob ? (
                  <div className="space-y-4">
                    {/* Overall Progress */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Overall Progress</span>
                        <span className="text-sm text-muted-foreground">{Math.round(getProgressPercentage(currentJob.status))}%</span>
                      </div>
                      <Progress value={getProgressPercentage(currentJob.status)} className="h-2" data-testid="progress-overall" />
                    </div>

                    {/* Status Steps */}
                    {statusSteps.slice(0, -1).map((step) => {
                      const { icon: IconComponent, color, bg } = getStatusDisplay(step, currentJob.status);
                      const isActive = step.key === currentJob.status;
                      
                      return (
                        <div key={step.key} className="flex items-center space-x-4" data-testid={`status-${step.key}`}>
                          <div className={`w-8 h-8 rounded-full ${bg} ${color} flex items-center justify-center ${isActive ? 'pulse-animation' : ''}`}>
                            <IconComponent className="h-4 w-4" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{step.label}</span>
                              <span className="text-xs text-muted-foreground">
                                {currentJob.status === step.key ? 'Processing...' : 
                                 statusSteps.findIndex(s => s.key === currentJob.status) > statusSteps.findIndex(s => s.key === step.key) ? 'Completed' : 'Pending'}
                              </span>
                            </div>
                            <div className="w-full bg-secondary rounded-full h-2 mt-1">
                              <div 
                                className={`h-2 rounded-full progress-bar ${
                                  currentJob.status === step.key ? 'bg-blue-600' :
                                  statusSteps.findIndex(s => s.key === currentJob.status) > statusSteps.findIndex(s => s.key === step.key) ? 'bg-green-600' : 'bg-muted'
                                }`}
                                style={{
                                  width: currentJob.status === step.key ? '65%' :
                                         statusSteps.findIndex(s => s.key === currentJob.status) > statusSteps.findIndex(s => s.key === step.key) ? '100%' : '0%'
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Error Display */}
                    {currentJob.status === 'error' && currentJob.errorMessage && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg" data-testid="error-message">
                        <div className="flex items-start space-x-2">
                          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                          <div className="text-sm text-red-800">
                            <div className="font-medium">Processing Error</div>
                            <div className="mt-1">{currentJob.errorMessage}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Debug Information */}
                    <div className="mt-6 p-4 bg-muted rounded-lg" data-testid="debug-log">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Debug Log</span>
                        <Button variant="link" size="sm" className="text-xs">Clear Log</Button>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground space-y-1">
                        <div>[{new Date().toLocaleTimeString()}] Job created: {currentJob.id}</div>
                        <div>[{new Date().toLocaleTimeString()}] Status: {currentJob.status}</div>
                        {currentJob.extractedData && (
                          <div>[{new Date().toLocaleTimeString()}] Extracted {Object.keys(currentJob.extractedData).length} fields</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-8" data-testid="no-active-job">
                    <Clock className="mx-auto h-12 w-12 mb-4" />
                    <p>No document processing in progress.</p>
                    <p className="text-sm">Upload a document to start processing.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Extracted Data */}
            {currentJob?.extractedData && (
              <Card data-testid="card-extracted-data">
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Extracted Data</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(currentJob.extractedData).slice(0, 6).map(([field, value]) => (
                      <div key={field} className="space-y-2">
                        <Label htmlFor={field} className="text-sm font-medium text-foreground">
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
                    <Button variant="secondary" data-testid="button-show-all-fields">
                      Show All Fields ({Object.keys(currentJob.extractedData).length})
                    </Button>
                    <Button 
                      onClick={() => updateJobMutation.mutate({ 
                        jobId: currentJob.id, 
                        updates: { templateId: selectedTemplateId }
                      })}
                      data-testid="button-proceed-template"
                    >
                      Proceed to Template
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          
          {/* Right Column: Template Management & Results */}
          <div className="space-y-6">
            
            {/* Template Selection */}
            <Card data-testid="card-template-selection">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Templates</h2>
                  <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
                    <DialogTrigger asChild>
                      <Button variant="link" size="sm" data-testid="button-add-template">
                        <Plus className="h-4 w-4 mr-1" />Add Template
                      </Button>
                    </DialogTrigger>
                    <DialogContent data-testid="dialog-template-upload">
                      <DialogHeader>
                        <DialogTitle>Upload Template</DialogTitle>
                        <DialogDescription>
                          Upload a new PDF or DOCX template with placeholders.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="templateName">Template Name</Label>
                          <Input
                            id="templateName"
                            placeholder="e.g., Birth Certificate Template"
                            value={templateForm.name}
                            onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                            data-testid="input-template-name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="templateDescription">Description</Label>
                          <Textarea
                            id="templateDescription"
                            placeholder="Describe the template and its use case..."
                            value={templateForm.description}
                            onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                            data-testid="textarea-template-description"
                          />
                        </div>
                        <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                          <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">Drop template file here or click to browse</p>
                          <p className="text-xs text-muted-foreground mt-1">Supports PDF and DOCX files</p>
                        </div>
                        <div className="flex space-x-3">
                          <Button 
                            variant="outline" 
                            className="flex-1" 
                            onClick={() => setIsTemplateModalOpen(false)}
                            data-testid="button-cancel-template"
                          >
                            Cancel
                          </Button>
                          <Button className="flex-1" data-testid="button-upload-template">
                            Upload Template
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                
                <div className="space-y-3">
                  {templatesLoading ? (
                    <div className="text-center text-muted-foreground py-4">Loading templates...</div>
                  ) : templates.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <FileText className="mx-auto h-12 w-12 mb-4" />
                      <p>No templates available.</p>
                      <p className="text-sm">Upload a template to get started.</p>
                    </div>
                  ) : (
                    templates.map((template) => (
                      <div 
                        key={template.id} 
                        className={`border border-border rounded-lg p-4 hover:bg-accent transition-colors cursor-pointer ${
                          selectedTemplateId === template.id ? 'ring-2 ring-ring' : ''
                        }`}
                        onClick={() => setSelectedTemplateId(template.id)}
                        data-testid={`template-${template.id}`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="w-12 h-16 bg-red-100 rounded border flex items-center justify-center">
                            <FileText className="h-6 w-6 text-red-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-foreground truncate">{template.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{template.description || 'No description'}</p>
                            <div className="flex items-center space-x-2 mt-2">
                              <span className={`text-xs px-2 py-1 rounded-full ${
                                selectedTemplateId === template.id ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                              }`}>
                                {selectedTemplateId === template.id ? 'Active' : 'Available'}
                              </span>
                              <span className="text-xs text-muted-foreground">{template.fields.length} fields</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Field Mapping */}
            {currentJob?.fieldMappings && selectedTemplate && (
              <Card data-testid="card-field-mapping">
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">Field Mapping</h2>
                  
                  <div className="space-y-3">
                    {selectedTemplate.fields.slice(0, 3).map((templateField) => {
                      const mappedValue = currentJob.fieldMappings?.[templateField];
                      const hasMapping = !!mappedValue;
                      
                      return (
                        <div key={templateField} className={`flex items-center justify-between p-3 rounded-lg ${
                          hasMapping ? 'bg-secondary' : 'bg-yellow-50 border border-yellow-200'
                        }`} data-testid={`mapping-${templateField}`}>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-foreground">{`{{${templateField}}}`}</div>
                            <div className="text-xs text-muted-foreground">Template field</div>
                          </div>
                          <div className="mx-3">
                            {hasMapping ? (
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <TriangleAlert className="h-4 w-4 text-yellow-600" />
                            )}
                          </div>
                          <div className="flex-1 text-right">
                            <div className={`text-sm font-medium ${hasMapping ? 'text-foreground' : 'text-yellow-700'}`}>
                              {mappedValue || 'No match found'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {hasMapping ? 'Extracted value' : 'Needs manual input'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg" data-testid="mapping-status">
                    <div className="flex items-start space-x-2">
                      <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                      <div className="text-sm text-blue-800">
                        <div className="font-medium">Mapping Status</div>
                        <div className="text-xs mt-1">
                          {Object.keys(currentJob.fieldMappings || {}).length} of {selectedTemplate.fields.length} fields mapped automatically
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Document Generation */}
            {currentJob && currentJob.status === 'completed' && (
              <Card data-testid="card-document-generation">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-foreground">Generated Documents</h2>
                    <span className="text-sm text-muted-foreground">Step 3 of 3</span>
                  </div>
                  
                  <div className="space-y-4">
                    <Button 
                      className="w-full" 
                      onClick={() => generateDocumentMutation.mutate(currentJob.id)}
                      disabled={generateDocumentMutation.isPending}
                      data-testid="button-generate-document"
                    >
                      {generateDocumentMutation.isPending ? (
                        <>
                          <Clock className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2" />
                          Generate Document
                        </>
                      )}
                    </Button>
                    
                    {currentJob.generatedDocumentPath && (
                      <div className="border border-border rounded-lg p-4 fade-in" data-testid="generated-document">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <FileText className="h-5 w-5 text-red-500" />
                            <div>
                              <div className="text-sm font-medium text-foreground">generated_document.pdf</div>
                              <div className="text-xs text-muted-foreground">Generated just now</div>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" data-testid="button-download-document">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">Complete</span>
                          <span className="text-xs text-muted-foreground">PDF format</span>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recent Activity */}
            <Card data-testid="card-recent-activity">
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">Recent Activity</h2>
                
                <div className="space-y-3">
                  {jobsLoading ? (
                    <div className="text-center text-muted-foreground py-4">Loading activity...</div>
                  ) : processingJobs.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <Clock className="mx-auto h-12 w-12 mb-4" />
                      <p>No processing history yet.</p>
                      <p className="text-sm">Your processed documents will appear here.</p>
                    </div>
                  ) : (
                    processingJobs.slice(0, 5).map((job) => (
                      <div 
                        key={job.id} 
                        className="flex items-center space-x-3 p-3 rounded-lg hover:bg-accent transition-colors cursor-pointer"
                        onClick={() => setCurrentJobId(job.id)}
                        data-testid={`activity-job-${job.id}`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                          job.status === 'completed' ? 'bg-green-100 text-green-600' :
                          job.status === 'error' ? 'bg-red-100 text-red-600' :
                          'bg-blue-100 text-blue-600'
                        }`}>
                          {job.status === 'completed' ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : job.status === 'error' ? (
                            <AlertCircle className="h-4 w-4" />
                          ) : (
                            <Clock className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            Processing Job {job.id.slice(0, 8)}...
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(job.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
                
                {processingJobs.length > 5 && (
                  <Button variant="link" className="w-full mt-4" data-testid="button-view-all-history">
                    View All History
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
