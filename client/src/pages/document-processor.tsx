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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-gray-900 dark:via-blue-900/20 dark:to-slate-900">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-slate-200/50 dark:border-gray-700/50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <FileText className="text-white text-xl" data-testid="logo-icon" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent" data-testid="app-title">
                    Document Processor
                  </h1>
                  <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">AI-Powered Document Extraction</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
                  <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
                  Home
                </Button>
              </Link>
              <Link href="/admin/templates">
                <Button variant="outline" size="sm" className="border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950" data-testid="button-admin">
                  <Settings className="h-4 w-4 mr-2" />
                  Template Admin
                </Button>
              </Link>
              <Button variant="ghost" size="sm" data-testid="button-help">
                <HelpCircle className="h-4 w-4" />
              </Button>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white flex items-center justify-center shadow-lg" data-testid="user-avatar">
                <User className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Document Upload & Processing */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Document Upload */}
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-document-upload">
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                      <Upload className="h-4 w-4 text-white" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Document Upload</h2>
                  </div>
                  <div className="flex items-center space-x-2 bg-green-100 dark:bg-green-900/30 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">Step 1 of 3</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={10485760} // 10MB
                    onGetUploadParameters={handleGetUploadParameters}
                    onComplete={handleUploadComplete}
                    buttonClassName="w-full"
                  >
                    <div className="upload-zone relative border-2 border-dashed border-blue-300 dark:border-blue-600 rounded-xl p-12 text-center cursor-pointer transition-all duration-300 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 group" data-testid="upload-zone">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                      <div className="relative z-10">
                        <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-transform duration-300">
                          <Upload className="h-10 w-10 text-white" />
                        </div>
                        <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">Drop your documents here</h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6 text-lg">or click to browse files from your computer</p>
                        <div className="flex justify-center space-x-6 text-sm">
                          <div className="flex items-center space-x-2 bg-red-50 dark:bg-red-900/30 px-4 py-2 rounded-full">
                            <FileText className="h-5 w-5 text-red-500" />
                            <span className="font-medium text-red-700 dark:text-red-300">PDF</span>
                          </div>
                          <div className="flex items-center space-x-2 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-full">
                            <FileIcon className="h-5 w-5 text-blue-500" />
                            <span className="font-medium text-blue-700 dark:text-blue-300">Images</span>
                          </div>
                          <div className="flex items-center space-x-2 bg-green-50 dark:bg-green-900/30 px-4 py-2 rounded-full">
                            <FileText className="h-5 w-5 text-green-500" />
                            <span className="font-medium text-green-700 dark:text-green-300">DOCX</span>
                          </div>
                        </div>
                        <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                          Maximum file size: 10MB
                        </div>
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
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-processing-status">
              <CardContent className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                      <Settings className="h-4 w-4 text-white" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Processing Status</h2>
                  </div>
                  <div className="flex items-center space-x-2 bg-blue-100 dark:bg-blue-900/30 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Step 2 of 3</span>
                  </div>
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
                  <div className="text-center py-12" data-testid="no-active-job">
                    <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-2xl flex items-center justify-center shadow-lg">
                      <Clock className="h-12 w-12 text-gray-500 dark:text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No document processing in progress</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm max-w-md mx-auto">Upload a document above to start the AI-powered extraction and processing workflow.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Extracted Data */}
            {currentJob?.extractedData && (
              <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-extracted-data">
                <CardContent className="p-8">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center">
                      <FileText className="h-4 w-4 text-white" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Extracted Data</h2>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(currentJob.extractedData)
                      .slice(0, showAllFields ? undefined : 6)
                      .map(([field, value]) => (
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
                    <Button 
                      variant="secondary" 
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
            <Card className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm border-0 shadow-xl" data-testid="card-template-selection">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center">
                      <FileText className="h-4 w-4 text-white" />
                    </div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Template Selection</h2>
                  </div>
                  <div className="flex items-center space-x-2 bg-orange-100 dark:bg-orange-900/30 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                    <span className="text-sm font-medium text-orange-700 dark:text-orange-300">Step 3 of 3</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label htmlFor="template-select">Choose Template</Label>
                  <select
                    id="template-select"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full p-2 border border-border rounded-md bg-background text-foreground"
                    data-testid="select-template"
                  >
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                  
                  {selectedTemplate && (
                    <div className="mt-3 p-3 bg-secondary rounded-lg">
                      <div className="text-sm font-medium text-foreground">{selectedTemplate.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {selectedTemplate.description || 'No description'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {selectedTemplate.fields.length} fields
                      </div>
                    </div>
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
