import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  FileText, 
  Clock, 
  Eye, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Calendar,
  User,
  Settings,
  ArrowLeft,
  Zap,
  Target,
  Download,
  Play,
  Edit,
  Save,
  RefreshCw,
  FileCheck,
  Upload
} from "lucide-react";
import { format } from "date-fns";

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

const statusColors = {
  'pending_review': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'uploading': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'ocr': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'extraction': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'mapping': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'generation': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'completed': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'error': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
};

const statusIcons = {
  'pending_review': Clock,
  'uploading': FileText,
  'ocr': Eye,
  'extraction': Zap,
  'mapping': Target,
  'generation': Settings,
  'completed': CheckCircle,
  'error': XCircle
};

export default function AdminJobReview() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [editableFields, setEditableFields] = useState<Record<string, string>>({});
  const [isEditingFields, setIsEditingFields] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch specific job details
  const { data: job, isLoading: jobLoading, error: jobError } = useQuery<ProcessingJob>({
    queryKey: ['/api/processing-jobs', id],
    enabled: !!id,
  });

  // Fetch templates for template selection
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
  });

  // Initialize editable fields when job data is loaded
  useEffect(() => {
    if (job?.extractedFieldValues) {
      setEditableFields(job.extractedFieldValues);
    }
    if (job?.templateId) {
      setSelectedTemplateId(job.templateId);
    }
  }, [job]);

  // Manual OCR processing mutation
  const processOCRMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/processing-jobs/${id}/process`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs', id] });
      toast({
        title: "OCR Processing Started",
        description: "OCR extraction and field processing has been initiated.",
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

  // Update job mutation (for status changes, template selection, field values)
  const updateJobMutation = useMutation({
    mutationFn: async (updates: Partial<ProcessingJob>) => {
      const res = await apiRequest('PATCH', `/api/processing-jobs/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs', id] });
      toast({
        title: "Job Updated",
        description: "Processing job has been updated successfully.",
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
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/processing-jobs/${id}/generate`, {
        extractedFieldValues: editableFields,
        templateId: selectedTemplateId
      });
      
      // Handle PDF response - create download link
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `generated_document_${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs', id] });
      toast({
        title: "Document Generated",
        description: "The document has been generated and downloaded successfully.",
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

  // Handle template selection change
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    updateJobMutation.mutate({ templateId });
  };

  // Handle field value changes
  const handleFieldChange = (fieldName: string, value: string) => {
    setEditableFields(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  // Save field changes
  const handleSaveFields = () => {
    updateJobMutation.mutate({ extractedFieldValues: editableFields });
    setIsEditingFields(false);
  };

  // Get template name
  const getTemplateName = (templateId?: string) => {
    if (!templateId) return 'No Template';
    const template = templates.find(t => t.id === templateId);
    return template ? template.name : 'Unknown Template';
  };

  // Get file name from path
  const getFileName = (filePath?: string) => {
    if (!filePath) return 'No file name';
    return filePath.split('/').pop() || filePath;
  };

  // Get field mappings from selected template
  const getTemplateFieldMappings = () => {
    if (!selectedTemplateId) return {};
    const template = templates.find(t => t.id === selectedTemplateId);
    return template?.fieldMappings || {};
  };

  // Render status badge
  const StatusBadge = ({ status }: { status: string }) => {
    const Icon = statusIcons[status as keyof typeof statusIcons] || AlertCircle;
    const colorClass = statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800';
    
    return (
      <Badge className={`${colorClass} flex items-center gap-1`} data-testid={`status-${status}`}>
        <Icon className="h-3 w-3" />
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  // Loading state
  if (jobLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <Skeleton className="h-6 w-6" />
                <Skeleton className="h-6 w-48" />
              </div>
              <Skeleton className="h-8 w-32" />
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (jobError || !job) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <User className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Job Review
                </h1>
              </div>
              <Link href="/admin/requests">
                <Button variant="outline" size="sm" data-testid="button-back-requests">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Requests
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {jobError ? "Failed to load job details." : "Job not found."} Please try going back and selecting a different job.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <User className="h-6 w-6 text-gray-700 dark:text-gray-300" data-testid="logo-job-review" />
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white" data-testid="page-title">
                Job Review: {getFileName(job.originalFilePath)}
              </h1>
              <StatusBadge status={job.status} />
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/admin/requests">
                <Button variant="outline" size="sm" data-testid="button-back-requests">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Requests
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Document Details */}
          <Card className="bg-white dark:bg-gray-800" data-testid="card-document-details">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Document Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">File Name</Label>
                <p className="text-sm text-gray-900 dark:text-gray-100" data-testid="text-filename">
                  {getFileName(job.originalFilePath)}
                </p>
              </div>
              
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">File Path</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate" data-testid="text-filepath">
                  {job.originalFilePath}
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">User Email</Label>
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <p className="text-sm text-gray-900 dark:text-gray-100" data-testid="text-user-email">
                    {job.userEmail}
                  </p>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Created</Label>
                <p className="text-sm text-gray-900 dark:text-gray-100" data-testid="text-created">
                  {job.createdAt ? format(new Date(job.createdAt), 'PPp') : 'No date'}
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Updated</Label>
                <p className="text-sm text-gray-900 dark:text-gray-100" data-testid="text-updated">
                  {job.updatedAt ? format(new Date(job.updatedAt), 'PPp') : 'No date'}
                </p>
              </div>

              {job.errorMessage && (
                <div>
                  <Label className="text-sm font-medium text-red-700 dark:text-red-300">Error Message</Label>
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription data-testid="text-error">
                      {job.errorMessage}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Document Preview Link */}
              <Separator />
              <div className="flex justify-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  asChild 
                  data-testid="button-view-document"
                >
                  <a href={job.originalFilePath} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-4 w-4 mr-2" />
                    View Original Document
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Processing Controls */}
          <Card className="bg-white dark:bg-gray-800" data-testid="card-processing-controls">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Processing Controls
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Template Selection */}
              <div>
                <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Template Selection</Label>
                <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                  <SelectTrigger data-testid="select-template">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id} data-testid={`option-template-${template.id}`}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplateId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Selected: {getTemplateName(selectedTemplateId)}
                  </p>
                )}
              </div>

              <Separator />

              {/* Manual Processing Controls */}
              <div className="space-y-3">
                <Button
                  onClick={() => processOCRMutation.mutate()}
                  disabled={processOCRMutation.isPending}
                  className="w-full"
                  data-testid="button-process-ocr"
                >
                  {processOCRMutation.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  {job.status === 'pending_review' ? 'Start OCR & Field Extraction' : 'Re-process OCR & Fields'}
                </Button>

                {job.extractedFieldValues && selectedTemplateId && (
                  <Button
                    onClick={() => generateDocumentMutation.mutate()}
                    disabled={generateDocumentMutation.isPending}
                    className="w-full"
                    variant="default"
                    data-testid="button-generate-document"
                  >
                    {generateDocumentMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileCheck className="h-4 w-4 mr-2" />
                    )}
                    Generate Document
                  </Button>
                )}
              </div>

              {/* Download Generated Document */}
              {job.generatedDocumentPath && (
                <>
                  <Separator />
                  <Button
                    variant="outline"
                    className="w-full"
                    asChild
                    data-testid="button-download-generated"
                  >
                    <a href={job.generatedDocumentPath} target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-2" />
                      Download Generated Document
                    </a>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* OCR Extracted Text */}
        {job.extractedData && Object.keys(job.extractedData).length > 0 && (
          <Card className="mt-6 bg-white dark:bg-gray-800" data-testid="card-extracted-text">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                OCR Extracted Text
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-60 w-full rounded-md border p-4">
                <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap" data-testid="text-ocr-content">
                  {Object.entries(job.extractedData).map(([key, value]) => (
                    `${key}: ${value}\n`
                  )).join('')}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Extracted Field Values */}
        <Card className="mt-6 bg-white dark:bg-gray-800" data-testid="card-field-values">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Extracted Field Values
              </div>
              <div className="flex items-center gap-2">
                {isEditingFields ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditingFields(false)}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveFields}
                      disabled={updateJobMutation.isPending}
                      data-testid="button-save-fields"
                    >
                      {updateJobMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Changes
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditingFields(true)}
                    data-testid="button-edit-fields"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Fields
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {editableFields && Object.keys(editableFields).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(editableFields).map(([fieldName, value]) => (
                  <div key={fieldName} className="space-y-2">
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {fieldName}
                    </Label>
                    {isEditingFields ? (
                      <Input
                        value={value || ''}
                        onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                        placeholder={`Enter ${fieldName}`}
                        data-testid={`input-field-${fieldName}`}
                      />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-100 p-2 bg-gray-50 dark:bg-gray-700 rounded" data-testid={`text-field-${fieldName}`}>
                        {value || <span className="text-gray-500 italic">No value extracted</span>}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : selectedTemplateId && templates.find(t => t.id === selectedTemplateId) ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No field values extracted yet. Click "Start OCR & Field Extraction" to process this document.
                </p>
                {/* Show expected fields from template */}
                <div>
                  <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Expected Fields from Template:</Label>
                  <div className="mt-2 space-y-1">
                    {Object.entries(getTemplateFieldMappings()).map(([fieldName, fieldMapping]: [string, any]) => (
                      <div key={fieldName} className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 p-2 rounded">
                        <span className="font-medium">{fieldMapping.fieldDefinition?.label || fieldName}</span>
                        {fieldMapping.fieldDefinition?.description && (
                          <span className="ml-2 text-gray-500">- {fieldMapping.fieldDefinition.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Please select a template first to see extractable fields.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}