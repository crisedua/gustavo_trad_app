import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, FileText, Trash2, Edit, Calendar, Upload, Settings, ArrowLeft, HelpCircle, AlertTriangle, CheckCircle, Eye, Target, Zap, BarChart3, Download } from "lucide-react";
import { Link } from "wouter";
import { Template, getFieldNamesFromMappings } from "@shared/schema";

interface AnalysisResult {
  fieldsDetected: number;
  analysisSuccessful: boolean;
  processingTime: number;
  confidence?: number;
  detectionMethod?: string;
  totalMarkersFound?: number;
}

export default function TemplateAdmin() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    fields: [] as string[]
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewingTemplate, setPreviewingTemplate] = useState<Template | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Edit state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: ''
  });

  // Force delete state
  const [forceDeleteDialogOpen, setForceDeleteDialogOpen] = useState(false);
  const [templateToForceDelete, setTemplateToForceDelete] = useState<Template | null>(null);
  const [deleteError, setDeleteError] = useState<{jobsCount?: number; message?: string} | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading, error: templatesError } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
  });

  // Delete template mutation with force delete support
  const deleteTemplateMutation = useMutation({
    mutationFn: async ({ templateId, force = false }: { templateId: string; force?: boolean }) => {
      const url = force ? `/api/templates/${templateId}?force=true` : `/api/templates/${templateId}`;
      const res = await apiRequest('DELETE', url);
      return res.json();
    },
    onSuccess: (data, { templateId, force }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      toast({
        title: "Template Deleted",
        description: force 
          ? "Template and associated processing jobs have been successfully deleted."
          : "Template has been successfully deleted.",
      });
    },
    onError: (error: any, { templateId, force }) => {
      let errorData: any = {};
      
      // Parse error response - the error message contains JSON if it's from our API
      try {
        if (error.message && error.message.includes(':')) {
          const jsonPart = error.message.split(': ', 2)[1];
          if (jsonPart && (jsonPart.startsWith('{') || jsonPart.startsWith('['))) {
            errorData = JSON.parse(jsonPart);
          }
        }
      } catch (parseError) {
        console.warn('Failed to parse error response:', parseError);
        errorData = { message: error.message };
      }
      
      // Check if error is due to associated jobs
      if (errorData.jobsCount && !force) {
        // Find the template and show force delete dialog
        const template = templates.find(t => t.id === templateId);
        if (template) {
          setTemplateToForceDelete(template);
          setDeleteError(errorData);
          setForceDeleteDialogOpen(true);
        }
      } else {
        toast({
          title: "Delete Failed",
          description: errorData.message || error.message || "Failed to delete template",
          variant: "destructive",
        });
      }
    },
  });

  // Create template mutation with enhanced progress tracking
  const createTemplateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // Create XMLHttpRequest for progress tracking
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = (e.loaded / e.total) * 50; // Upload is first 50%
            setUploadProgress(progress);
          }
        });
        
        xhr.addEventListener('load', () => {
          setUploadProgress(50); // Upload complete, analysis starts
          setIsAnalyzing(true);
          
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (error) {
              reject(new Error('Failed to parse response'));
            }
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.error || 'Failed to create template'));
            } catch {
              reject(new Error('Failed to create template'));
            }
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });
        
        xhr.open('POST', '/api/templates');
        xhr.send(formData);
        
        // Simulate analysis progress
        const progressInterval = setInterval(() => {
          setUploadProgress(prev => {
            if (prev >= 95) {
              clearInterval(progressInterval);
              return prev;
            }
            return prev + 1;
          });
        }, 100);
      });
    },
    onSuccess: (data: any) => {
      setUploadProgress(100);
      setIsAnalyzing(false);
      
      // Store analysis results for display
      if (data.analysisResults) {
        setAnalysisResults({
          fieldsDetected: data.analysisResults.fieldsDetected || 0,
          analysisSuccessful: data.analysisResults.analysisSuccessful || false,
          processingTime: data.analysisResults.processingTime || 0,
          confidence: data.detectionMetadata?.confidence,
          detectionMethod: data.detectionMetadata?.detectionMethod,
          totalMarkersFound: data.detectionMetadata?.totalMarkersFound
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      
      // Show success with analysis results
      const fieldsFound = data.analysisResults?.fieldsDetected || 0;
      toast({
        title: "Template Created Successfully! 🎉",
        description: `Analysis complete: ${fieldsFound} fields detected automatically.`,
      });
      
      // Keep modal open briefly to show results, then close
      setTimeout(() => {
        setIsCreateModalOpen(false);
        setCreateForm({ name: '', description: '', fields: [] });
        setSelectedFile(null);
        setAnalysisResults(null);
        setUploadProgress(0);
      }, 3000);
    },
    onError: (error: any) => {
      setUploadProgress(0);
      setIsAnalyzing(false);
      setAnalysisResults(null);
      toast({
        title: "Creation Failed",
        description: error.message || "Failed to create template",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUploading(false);
    }
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { name?: string; description?: string } }) => {
      const res = await apiRequest('PATCH', `/api/templates/${id}`, updates);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setIsEditModalOpen(false);
      setEditingTemplate(null);
      setEditForm({ name: '', description: '' });
      toast({
        title: "Template Updated",
        description: "Template has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update template",
        variant: "destructive",
      });
    },
  });

  // Handle edit template
  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setEditForm({
      name: template.name,
      description: template.description || ''
    });
    setIsEditModalOpen(true);
  };

  // Handle update template
  const handleUpdateTemplate = () => {
    if (!editingTemplate) return;
    
    if (!editForm.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Template name is required.",
        variant: "destructive",
      });
      return;
    }

    const updates: { name?: string; description?: string } = {};
    
    if (editForm.name.trim() !== editingTemplate.name) {
      updates.name = editForm.name.trim();
    }
    
    if (editForm.description.trim() !== (editingTemplate.description || '')) {
      updates.description = editForm.description.trim();
    }
    
    if (Object.keys(updates).length === 0) {
      toast({
        title: "No Changes",
        description: "No changes were made to the template.",
      });
      return;
    }

    updateTemplateMutation.mutate({ id: editingTemplate.id, updates });
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileValidation(files[0]);
    }
  }, []);

  // File validation helper
  const handleFileValidation = (file: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please select a PDF, DOCX, PNG, or JPEG file.",
        variant: "destructive",
      });
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }
    
    setSelectedFile(file);
  };

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileValidation(file);
    }
  };

  // Handle template preview
  const handlePreviewTemplate = (template: Template) => {
    setPreviewingTemplate(template);
    setIsPreviewModalOpen(true);
  };

  // Handle form submission
  const handleCreateTemplate = () => {
    if (!createForm.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Template name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedFile) {
      toast({
        title: "Validation Error", 
        description: "Please select a template file.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    formData.append('name', createForm.name.trim());
    formData.append('description', createForm.description.trim());
    formData.append('fields', JSON.stringify(createForm.fields));
    formData.append('templateFile', selectedFile);
    formData.append('autoAnalyze', 'true'); // Enable automatic analysis

    createTemplateMutation.mutate(formData);
  };

  // Helper function to get detection confidence badge color
  const getConfidenceBadgeColor = (confidence?: number) => {
    if (!confidence) return 'secondary';
    if (confidence >= 0.8) return 'default'; // Green
    if (confidence >= 0.6) return 'secondary'; // Yellow  
    return 'destructive'; // Red
  };

  // Helper function to format confidence percentage
  const formatConfidence = (confidence?: number) => {
    return confidence ? `${Math.round(confidence * 100)}%` : 'N/A';
  };

  // Format date - handle both Date objects and strings
  const formatDate = (dateInput: string | Date) => {
    try {
      const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid date';
    }
  };

  return (
    <div className="bg-background text-foreground min-h-screen">
      {/* Header */}
      <header className="bg-card border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/process">
                <Button variant="ghost" size="sm" data-testid="button-back">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Processor
                </Button>
              </Link>
              <div className="flex items-center space-x-2">
                <Settings className="text-primary text-2xl" data-testid="admin-icon" />
                <h1 className="text-xl font-bold text-foreground" data-testid="admin-title">Template Administration</h1>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" data-testid="button-help">
                <HelpCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Template Management</h2>
            <p className="text-muted-foreground mt-1">
              Manage document templates for automated processing
            </p>
          </div>
          
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-template">
                <Plus className="h-4 w-4 mr-2" />
                Add Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl" data-testid="dialog-create-template">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <Zap className="h-5 w-5 text-primary" />
                  <span>Create New Template with AI Detection</span>
                </DialogTitle>
                <DialogDescription>
                  Upload a document template with XXX markers. Our AI will automatically detect and map fields for you.
                </DialogDescription>
              </DialogHeader>
              
              {/* Upload Progress and Analysis Results */}
              {(isUploading || analysisResults) && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  {isUploading && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center space-x-2">
                          <Upload className="h-4 w-4 animate-pulse" />
                          <span>{isAnalyzing ? 'Analyzing template...' : 'Uploading...'}</span>
                        </span>
                        <span>{Math.round(uploadProgress)}%</span>
                      </div>
                      <Progress value={uploadProgress} className="w-full" data-testid="upload-progress" />
                      {isAnalyzing && (
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <Target className="h-3 w-3 animate-spin" />
                          <span>Detecting XXX markers and analyzing field positions...</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {analysisResults && !isUploading && (
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2 text-green-600">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">Analysis Complete!</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center space-x-2">
                          <Target className="h-4 w-4 text-blue-500" />
                          <span>Fields Detected: <strong>{analysisResults.fieldsDetected}</strong></span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <BarChart3 className="h-4 w-4 text-green-500" />
                          <span>Processing: <strong>{analysisResults.processingTime}ms</strong></span>
                        </div>
                        {analysisResults.totalMarkersFound && (
                          <div className="flex items-center space-x-2">
                            <Zap className="h-4 w-4 text-yellow-500" />
                            <span>Markers Found: <strong>{analysisResults.totalMarkersFound}</strong></span>
                          </div>
                        )}
                        {analysisResults.confidence && (
                          <div className="flex items-center space-x-2">
                            <CheckCircle className="h-4 w-4 text-purple-500" />
                            <span>Confidence: <strong>{formatConfidence(analysisResults.confidence)}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="templateName">Template Name *</Label>
                  <Input
                    id="templateName"
                    placeholder="e.g., Birth Certificate Template"
                    value={createForm.name}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                    data-testid="input-template-name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="templateDescription">Description</Label>
                  <Textarea
                    id="templateDescription"
                    placeholder="Describe the template and its use case..."
                    value={createForm.description}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    data-testid="textarea-template-description"
                  />
                </div>
                
                <div>
                  <Label htmlFor="templateFile">Template File *</Label>
                  <div className="mt-2">
                    <input
                      ref={fileInputRef}
                      id="templateFile"
                      type="file"
                      accept=".pdf,.docx,.png,.jpg,.jpeg"
                      onChange={handleFileSelect}
                      className="hidden"
                      data-testid="input-template-file"
                    />
                    
                    {/* Drag and Drop Area */}
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                        isDragOver 
                          ? 'border-primary bg-primary/5' 
                          : 'border-muted-foreground/25 hover:border-primary/50'
                      }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      data-testid="file-drop-area"
                    >
                      {selectedFile ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-center space-x-2 text-green-600">
                            <CheckCircle className="h-5 w-5" />
                            <span className="font-medium">{selectedFile.name}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                          </p>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            data-testid="button-change-file"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Change File
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex justify-center">
                            <Upload className={`h-12 w-12 ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {isDragOver ? 'Drop your file here' : 'Drag & drop your template file'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              or click to browse files
                            </p>
                          </div>
                          <Button 
                            variant="outline" 
                            onClick={() => fileInputRef.current?.click()}
                            data-testid="button-select-file"
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Select File
                          </Button>
                          <p className="text-xs text-muted-foreground">
                            Supports PDF, DOCX, PNG, JPEG up to 10MB
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {selectedFile && (
                      <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md">
                        <div className="flex items-start space-x-2 text-sm">
                          <Target className="h-4 w-4 text-blue-500 mt-0.5" />
                          <div>
                            <p className="font-medium text-blue-700 dark:text-blue-300">
                              AI-Powered Field Detection
                            </p>
                            <p className="text-blue-600 dark:text-blue-400">
                              Our system will automatically detect XXX markers and map field positions during upload.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex space-x-3 mt-6">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => {
                    setIsCreateModalOpen(false);
                    setCreateForm({ name: '', description: '', fields: [] });
                    setSelectedFile(null);
                  }}
                  disabled={isUploading}
                  data-testid="button-cancel-template"
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleCreateTemplate}
                  disabled={isUploading || !createForm.name.trim() || !selectedFile}
                  data-testid="button-create-template"
                >
                  {isUploading ? (
                    <>
                      <Zap className="h-4 w-4 mr-2 animate-pulse" />
                      {isAnalyzing ? 'Analyzing Fields...' : 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Create & Analyze Template
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          {/* Edit Template Modal */}
          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogContent className="max-w-md" data-testid="dialog-edit-template">
              <DialogHeader>
                <DialogTitle>Edit Template</DialogTitle>
                <DialogDescription>
                  Update the template name and description.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div>
                  <Label htmlFor="editTemplateName">Template Name *</Label>
                  <Input
                    id="editTemplateName"
                    placeholder="e.g., Birth Certificate Template"
                    value={editForm.name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                    data-testid="input-edit-template-name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="editTemplateDescription">Description</Label>
                  <Textarea
                    id="editTemplateDescription"
                    placeholder="Describe the template and its use case..."
                    value={editForm.description}
                    onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    data-testid="textarea-edit-template-description"
                  />
                </div>
              </div>
              
              <div className="flex space-x-3 mt-6">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingTemplate(null);
                    setEditForm({ name: '', description: '' });
                  }}
                  disabled={updateTemplateMutation.isPending}
                  data-testid="button-cancel-edit-template"
                >
                  Cancel
                </Button>
                <Button 
                  className="flex-1" 
                  onClick={handleUpdateTemplate}
                  disabled={updateTemplateMutation.isPending || !editForm.name.trim()}
                  data-testid="button-update-template"
                >
                  {updateTemplateMutation.isPending ? "Updating..." : "Update Template"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          
          {/* Field Detection Preview Modal */}
          <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="dialog-field-preview">
              <DialogHeader>
                <DialogTitle className="flex items-center space-x-2">
                  <Target className="h-5 w-5 text-primary" />
                  <span>Field Detection Preview - {previewingTemplate?.name}</span>
                </DialogTitle>
                <DialogDescription>
                  Analysis results and detected field mappings from automated template processing.
                </DialogDescription>
              </DialogHeader>
              
              {previewingTemplate && (
                <div className="space-y-6">
                  {/* Template Overview */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div className="space-y-1">
                      <p className="text-sm font-medium flex items-center">
                        <FileText className="h-4 w-4 mr-1 text-blue-500" />
                        Template Details
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {previewingTemplate.description || 'No description'}
                      </p>
                      {previewingTemplate.isAutoCreated && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                          <Zap className="h-3 w-3 mr-1" />
                          AI Generated
                        </Badge>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm font-medium flex items-center">
                        <Target className="h-4 w-4 mr-1 text-green-500" />
                        Detection Results
                      </p>
                      {previewingTemplate.detectionMetadata?.confidence && (
                        <p className="text-xs">
                          Confidence: <span className="font-medium">{formatConfidence(previewingTemplate.detectionMetadata.confidence)}</span>
                        </p>
                      )}
                      {previewingTemplate.detectionMetadata?.totalMarkersFound && (
                        <p className="text-xs">
                          Markers Found: <span className="font-medium">{previewingTemplate.detectionMetadata.totalMarkersFound}</span>
                        </p>
                      )}
                      {previewingTemplate.detectionMetadata?.processingTime && (
                        <p className="text-xs">
                          Processing: <span className="font-medium">{previewingTemplate.detectionMetadata.processingTime}ms</span>
                        </p>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-sm font-medium flex items-center">
                        <BarChart3 className="h-4 w-4 mr-1 text-purple-500" />
                        Field Statistics
                      </p>
                      <p className="text-xs">
                        Total Fields: <span className="font-medium">{previewingTemplate.fieldMappings ? getFieldNamesFromMappings(previewingTemplate.fieldMappings).length : 0}</span>
                      </p>
                      <p className="text-xs">
                        Created: <span className="font-medium">{previewingTemplate.createdAt ? formatDate(previewingTemplate.createdAt) : 'N/A'}</span>
                      </p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Field Mappings */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium flex items-center">
                        <Target className="h-5 w-5 mr-2 text-primary" />
                        Detected Field Mappings
                      </h3>
                      {previewingTemplate.filePath && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/public-objects/${previewingTemplate.filePath}`, '_blank')}
                          data-testid="button-download-template"
                        >
                          <Download className="h-4 w-4 mr-1" />
                          View Template
                        </Button>
                      )}
                    </div>
                    
                    {previewingTemplate.fieldMappings && Object.keys(previewingTemplate.fieldMappings).length > 0 ? (
                      <div className="space-y-3">
                        {Object.entries(previewingTemplate.fieldMappings).map(([fieldName, fieldData]) => (
                          <Card key={fieldName} className="p-4" data-testid={`field-card-${fieldName}`}>
                            <div className="space-y-3">
                              {/* Field Header */}
                              <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                  <h4 className="font-medium text-sm flex items-center">
                                    <span className="bg-primary/10 text-primary px-2 py-1 rounded text-xs font-mono mr-2">
                                      {fieldName}
                                    </span>
                                    <span>{fieldData.fieldDefinition?.label || fieldName}</span>
                                  </h4>
                                  {fieldData.fieldDefinition?.description && (
                                    <p className="text-xs text-muted-foreground">
                                      {fieldData.fieldDefinition.description}
                                    </p>
                                  )}
                                </div>
                                <div className="flex space-x-2">
                                  <Badge variant="outline" className="text-xs">
                                    {fieldData.fieldDefinition?.type || 'text'}
                                  </Badge>
                                  {fieldData.detectionSummary?.averageConfidence && (
                                    <Badge 
                                      variant={getConfidenceBadgeColor(fieldData.detectionSummary.averageConfidence)}
                                      className="text-xs"
                                    >
                                      {formatConfidence(fieldData.detectionSummary.averageConfidence)}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              
                              {/* Field Instances */}
                              {fieldData.instances && fieldData.instances.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground">
                                    Field Instances ({fieldData.instances.length})
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {fieldData.instances.map((instance, index) => (
                                      <div key={index} className="bg-muted/30 p-2 rounded text-xs space-y-1">
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium">Instance {index + 1}</span>
                                          {instance.detectionConfidence && (
                                            <Badge variant="outline" className="text-xs px-1">
                                              {formatConfidence(instance.detectionConfidence)}
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="space-y-0.5">
                                          <p>Page: {instance.coordinates.page}</p>
                                          <p>Position: x={Math.round(instance.coordinates.rect.x)}, y={Math.round(instance.coordinates.rect.y)}</p>
                                          <p>Size: {Math.round(instance.coordinates.rect.width)} × {Math.round(instance.coordinates.rect.height)}</p>
                                          {instance.ocrText && (
                                            <p className="font-mono bg-background px-1 py-0.5 rounded truncate" title={instance.ocrText}>
                                              OCR: "{instance.ocrText}"
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* Detection Summary */}
                              {fieldData.detectionSummary && (
                                <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                                  <span>Method: {fieldData.detectionSummary.detectionMethod}</span>
                                  <span>Found: {fieldData.detectionSummary.totalInstancesFound} instance(s)</span>
                                  {fieldData.detectionSummary.conflictingInstances && (
                                    <Badge variant="destructive" className="text-xs">
                                      Conflicts Detected
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No field mappings found for this template.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setIsPreviewModalOpen(false)}
                  data-testid="button-close-preview"
                >
                  Close
                </Button>
                {previewingTemplate && previewingTemplate.fieldMappings && Object.keys(previewingTemplate.fieldMappings).length > 0 && (
                  <Button
                    onClick={() => {
                      // Future: Open field editor
                      toast({
                        title: "Field Editor",
                        description: "Field editing functionality coming soon!",
                      });
                    }}
                    data-testid="button-edit-fields"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Fields
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Templates Table */}
        <Card data-testid="card-templates-table">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileText className="h-5 w-5" />
              <span>Templates ({templates.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {templatesLoading ? (
              <div className="space-y-4" data-testid="loading-skeleton">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                ))}
              </div>
            ) : templatesError ? (
              <div className="text-center py-8" data-testid="error-message">
                <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Failed to Load Templates</h3>
                <p className="text-muted-foreground">
                  There was an error loading the templates. Please try refreshing the page.
                </p>
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12" data-testid="empty-state">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Templates Found</h3>
                <p className="text-muted-foreground mb-4">
                  Get started by creating your first document template.
                </p>
                <Button onClick={() => setIsCreateModalOpen(true)} data-testid="button-create-first-template">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Template
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Template</TableHead>
                      <TableHead>Fields & Analysis</TableHead>
                      <TableHead>Detection</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => {
                      const fieldCount = template.fieldMappings ? getFieldNamesFromMappings(template.fieldMappings).length : 0;
                      const isAutoCreated = template.isAutoCreated;
                      const confidence = template.detectionMetadata?.confidence;
                      const processingTime = template.detectionMetadata?.processingTime;
                      
                      return (
                        <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                          <TableCell className="font-medium">
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <FileText className="h-4 w-4 text-blue-500" />
                                <span data-testid={`text-template-name-${template.id}`}>
                                  {template.name}
                                </span>
                                {isAutoCreated && (
                                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">
                                    <Zap className="h-3 w-3 mr-1" />
                                    AI Detected
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {template.description || 'No description'}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <Badge 
                                  variant={fieldCount > 0 ? "default" : "secondary"} 
                                  data-testid={`badge-fields-count-${template.id}`}
                                >
                                  <Target className="h-3 w-3 mr-1" />
                                  {fieldCount} fields
                                </Badge>
                                {fieldCount > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handlePreviewTemplate(template)}
                                    className="text-xs h-6 px-2"
                                    data-testid={`button-preview-fields-${template.id}`}
                                  >
                                    <Eye className="h-3 w-3 mr-1" />
                                    Preview
                                  </Button>
                                )}
                              </div>
                              {processingTime && (
                                <p className="text-xs text-muted-foreground flex items-center">
                                  <BarChart3 className="h-3 w-3 mr-1" />
                                  Analyzed in {processingTime}ms
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {confidence !== undefined ? (
                                <Badge 
                                  variant={getConfidenceBadgeColor(confidence)}
                                  className="text-xs"
                                  data-testid={`badge-confidence-${template.id}`}
                                >
                                  {formatConfidence(confidence)} confidence
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  Manual
                                </Badge>
                              )}
                              {template.detectionMetadata?.totalMarkersFound && (
                                <p className="text-xs text-muted-foreground">
                                  {template.detectionMetadata.totalMarkersFound} markers found
                                </p>
                              )}
                            </div>
                          </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span data-testid={`text-template-date-${template.id}`}>
                              {template.createdAt ? formatDate(template.createdAt) : 'N/A'}
                            </span>
                          </div>
                        </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end space-x-1">
                              {fieldCount > 0 && (
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                                  onClick={() => handlePreviewTemplate(template)}
                                  data-testid={`button-preview-${template.id}`}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
                                onClick={() => handleEditTemplate(template)}
                                data-testid={`button-edit-${template.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                  data-testid={`button-delete-${template.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                            <AlertDialogContent data-testid={`dialog-delete-${template.id}`}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Template</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{template.name}"? This action cannot be undone.
                                  <br /><br />
                                  <strong>Note:</strong> You cannot delete templates that are currently being used by processing jobs.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid={`button-cancel-delete-${template.id}`}>
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteTemplateMutation.mutate({ templateId: template.id, force: false })}
                                  disabled={deleteTemplateMutation.isPending}
                                  className="bg-red-600 hover:bg-red-700"
                                  data-testid={`button-confirm-delete-${template.id}`}
                                >
                                  {deleteTemplateMutation.isPending ? "Deleting..." : "Delete Template"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Force Delete Confirmation Dialog */}
      <AlertDialog open={forceDeleteDialogOpen} onOpenChange={setForceDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-force-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Template Has Associated Processing Jobs</AlertDialogTitle>
            <AlertDialogDescription>
              Cannot delete template "{templateToForceDelete?.name}" because it has {deleteError?.jobsCount} associated processing jobs.
              <br /><br />
              <strong>Force Delete Options:</strong>
              <br />• <strong>Force Delete:</strong> Delete the template and permanently remove all {deleteError?.jobsCount} associated processing jobs
              <br />• <strong>Cancel:</strong> Keep the template and its processing jobs
              <br /><br />
              <strong className="text-red-600">Warning:</strong> Force delete will permanently remove all processing job data and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => {
                setForceDeleteDialogOpen(false);
                setTemplateToForceDelete(null);
                setDeleteError(null);
              }}
              data-testid="button-cancel-force-delete"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (templateToForceDelete) {
                  deleteTemplateMutation.mutate({ templateId: templateToForceDelete.id, force: true });
                  setForceDeleteDialogOpen(false);
                  setTemplateToForceDelete(null);
                  setDeleteError(null);
                }
              }}
              disabled={deleteTemplateMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-force-delete"
            >
              {deleteTemplateMutation.isPending ? "Force Deleting..." : `Force Delete Template & ${deleteError?.jobsCount} Jobs`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}