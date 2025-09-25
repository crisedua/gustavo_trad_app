import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import { FileText, Upload, Clock, CheckCircle, AlertCircle, Download, Settings, HelpCircle, User, FileIcon, ArrowRight, TriangleAlert, Info, Zap, Target } from "lucide-react";
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
  userEmail: string;
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
  { key: 'pending_review', label: 'Pending Admin Review', icon: Clock },
  { key: 'uploading', label: 'File Upload', icon: Upload },
  { key: 'ocr', label: 'OCR Text Extraction', icon: FileText },
  { key: 'extraction', label: 'AI Field Extraction', icon: Settings },
  { key: 'mapping', label: 'Template Mapping', icon: ArrowRight },
  { key: 'generation', label: 'Document Generation', icon: FileIcon },
  { key: 'completed', label: 'Completed', icon: CheckCircle },
];

export default function DocumentProcessor() {
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [selectedDocumentTypeId, setSelectedDocumentTypeId] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; size: string; status: string }>>([]);
  const [showAllFields, setShowAllFields] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch document types instead of templates
  const { data: documentTypes = [], isLoading: documentTypesLoading } = useQuery<{ id: string; name: string; description: string; }[]>({
    queryKey: ['/api/document-types'],
  });

  // Keep this for backwards compatibility with admin interface
  const { data: templates = [], isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
  });

  // Remove auto-selection to allow user to choose template
  // useEffect(() => {
  //   if (templates.length > 0 && !selectedTemplateId) {
  //     console.log('Auto-selecting first template:', templates[0].id);
  //     setSelectedTemplateId(templates[0].id);
  //   }
  // }, [templates, selectedTemplateId]);

  // Fetch processing jobs
  const { data: processingJobs = [], isLoading: jobsLoading } = useQuery<ProcessingJob[]>({
    queryKey: ['/api/processing-jobs'],
    refetchInterval: currentJobId ? 2000 : false, // Poll if we have an active job
  });

  // Current job
  const currentJob = currentJobId ? processingJobs.find(job => job.id === currentJobId) : null;
  const selectedDocumentType = selectedDocumentTypeId ? documentTypes.find(dt => dt.id === selectedDocumentTypeId) : null;

  // Create processing job mutation
  const createJobMutation = useMutation({
    mutationFn: async (data: { originalFilePath: string; userEmail: string; selectedDocumentTypeId?: string }) => {
      const res = await apiRequest('POST', '/api/processing-jobs', data);
      return res.json();
    },
    onSuccess: (job) => {
      setCurrentJobId(job.id);
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs'] });
      toast({
        title: "Document Uploaded",
        description: "Your document has been uploaded and is awaiting admin review.",
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

      // Get current state values at upload time (avoid stale closures)
      // Use a small timeout to ensure DOM updates and state changes have been processed  
      setTimeout(() => {
        // Get current document type selection from DOM to avoid stale closures
        const documentTypeSelect = document.getElementById('document-type-select') as HTMLSelectElement;
        const currentSelectedDocumentTypeIdFresh = documentTypeSelect?.value || selectedDocumentTypeId;
        
        // Get current email value from the DOM as backup to ensure we have the latest value
        const emailInput = document.getElementById('user-email') as HTMLInputElement;
        const currentUserEmail = emailInput?.value || userEmail;
        
        console.log('Upload validation check - document type from DOM:', documentTypeSelect?.value, 'document type from state:', selectedDocumentTypeId, 'email from DOM:', emailInput?.value, 'document types count:', documentTypes.length);
        
        if (!currentSelectedDocumentTypeIdFresh || currentSelectedDocumentTypeIdFresh === '') {
          toast({
            title: "Error",
            description: "Please select a document type before uploading a document.",
            variant: "destructive",
          });
          console.error('Processing job creation aborted: No document type selected');
          return;
        }

        if (!currentUserEmail || currentUserEmail.trim() === '') {
          toast({
            title: "Error",
            description: "Please enter your email address before uploading a document.",
            variant: "destructive",
          });
          console.error('Processing job creation aborted: No email provided');
          return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(currentUserEmail.trim())) {
          toast({
            title: "Error",
            description: "Please enter a valid email address.",
            variant: "destructive",
          });
          console.error('Processing job creation aborted: Invalid email format');
          return;
        }

        console.log('Creating processing job with documentTypeId:', currentSelectedDocumentTypeIdFresh, 'email:', currentUserEmail);
        
        // Start processing
        // Handle both Render and Replit upload response formats
        const filePath = uploadedFile.uploadURL || uploadedFile.path || '';
        console.log('Upload result:', uploadedFile, 'Using filePath:', filePath);
        
        createJobMutation.mutate({
          originalFilePath: filePath,
          userEmail: currentUserEmail.trim(),
          selectedDocumentTypeId: currentSelectedDocumentTypeIdFresh
        });
      }, 100);
    }
  }, [selectedDocumentTypeId, userEmail, documentTypes, createJobMutation, toast]);

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
    
    if (currentStatus === 'error' || currentStatus === 'validation_failed') {
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
              {/* Admin links moved to password-protected home page */}
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
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">1. Choose Document Type</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Select the type of document you want to process. We'll automatically choose the best template format after analyzing your document.</p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="document-type-select" className="text-sm font-medium text-gray-900 dark:text-white">Document Type</Label>
                  <select
                    id="document-type-select"
                    value={selectedDocumentTypeId}
                    onChange={(e) => setSelectedDocumentTypeId(e.target.value)}
                    className="w-full mt-2 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    data-testid="select-document-type"
                  >
                    <option value="" disabled>Select a document type...</option>
                    {documentTypes.map((docType) => (
                      <option key={docType.id} value={docType.id}>
                        📄 {docType.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                {selectedDocumentType && (
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{selectedDocumentType.name}</div>
                        <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-2 py-1 rounded">Document Type</span>
                      </div>
                    </div>
                    
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                      {selectedDocumentType.description || 'Document type selected. The system will automatically choose the best template format after processing your document.'}
                    </div>
                    
                    <div className="text-xs text-green-700 dark:text-green-300">
                      <span className="font-medium">Smart Matching:</span> We'll automatically detect and use the correct template variant for your document format.
                    </div>
                  </div>
                )}
                
                {/* Hidden: Manage Templates button
                <div className="text-center">
                  <Link href="/admin/templates">
                    <Button variant="outline" size="sm">
                      Manage Templates
                    </Button>
                  </Link>
                </div>
                */}
              </div>
            </CardContent>
          </Card>

          {/* Contact Information */}
          <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" data-testid="card-contact-info">
            <CardContent className="p-8">
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">2. Contact Information</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Please provide your email so we can notify you about your translation progress</p>
              </div>
              
              <div>
                <Label htmlFor="user-email" className="text-sm font-medium text-gray-900 dark:text-white">Email Address</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  className="w-full mt-2"
                  data-testid="input-user-email"
                  required
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  We'll use this email to notify you when your document translation is ready
                </p>
              </div>
            </CardContent>
          </Card>
            
          {/* Document Upload */}
          <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" data-testid="card-document-upload">
            <CardContent className="p-8">
              <div className="mb-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">3. Upload Document</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Upload the document to extract data for your selected template</p>
              </div>
              
              {documentTypesLoading ? (
                <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-12 text-center" data-testid="upload-loading">
                  <Clock className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <Skeleton className="h-6 w-48 mx-auto mb-2" />
                  <Skeleton className="h-4 w-32 mx-auto" />
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-4">Loading document types...</p>
                </div>
              ) : (
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
              )}
                  
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

          
          {/* Generate Document */}
          {currentJob?.status === 'completed' && (
            <Card className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700" data-testid="card-document-generation">
              <CardContent className="p-8">
                <div className="mb-6">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">6. Generate Document</h2>
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
