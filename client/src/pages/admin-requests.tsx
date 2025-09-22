import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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
  Target
} from "lucide-react";
import { Link } from "wouter";
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

export default function AdminRequests() {
  const [selectedJob, setSelectedJob] = useState<ProcessingJob | null>(null);
  const [showJobDetails, setShowJobDetails] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch processing jobs
  const { data: allJobs = [], isLoading: jobsLoading, error: jobsError } = useQuery<ProcessingJob[]>({
    queryKey: ['/api/processing-jobs'],
    refetchInterval: 5000, // Refresh every 5 seconds to get real-time updates
  });

  // Fetch templates for job details
  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
  });

  // Filter jobs with pending_review status
  const pendingJobs = allJobs.filter(job => job.status === 'pending_review');

  // Update job status mutation (for approve/reject actions)
  const updateJobMutation = useMutation({
    mutationFn: async (data: { jobId: string; updates: Partial<ProcessingJob> }) => {
      const res = await apiRequest('PATCH', `/api/processing-jobs/${data.jobId}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs'] });
      setShowJobDetails(false);
      setSelectedJob(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete job mutation
  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest('DELETE', `/api/processing-jobs/${jobId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/processing-jobs'] });
      setShowJobDetails(false);
      setSelectedJob(null);
      toast({
        title: "Success",
        description: "Processing job has been deleted.",
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

  // Handle approve job (move to next processing step)
  const handleApproveJob = (job: ProcessingJob) => {
    updateJobMutation.mutate({
      jobId: job.id,
      updates: { status: 'uploading' }
    });
    toast({
      title: "Job Approved",
      description: "The processing job has been approved and will proceed to the next step.",
    });
  };

  // Handle reject job
  const handleRejectJob = (job: ProcessingJob) => {
    updateJobMutation.mutate({
      jobId: job.id,
      updates: { 
        status: 'error',
        errorMessage: 'Rejected by admin during review'
      }
    });
    toast({
      title: "Job Rejected",
      description: "The processing job has been rejected.",
      variant: "destructive",
    });
  };

  // Handle delete job
  const handleDeleteJob = (job: ProcessingJob) => {
    deleteJobMutation.mutate(job.id);
  };

  // Get template name for a job
  const getTemplateName = (templateId?: string) => {
    if (!templateId) return 'No Template';
    const template = templates.find(t => t.id === templateId);
    return template ? template.name : 'Unknown Template';
  };

  // Get file name from path
  const getFileName = (filePath: string) => {
    return filePath.split('/').pop() || filePath;
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

  // Loading skeleton
  if (jobsLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <User className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Admin - Pending Requests
                </h1>
              </div>
              <Link href="/process">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Processor
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 py-8">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-96" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-64" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (jobsError) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-4">
                <User className="h-6 w-6 text-gray-700 dark:text-gray-300" />
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Admin - Pending Requests
                </h1>
              </div>
              <Link href="/process">
                <Button variant="outline" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Processor
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load processing jobs. Please try refreshing the page.
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
              <User className="h-6 w-6 text-gray-700 dark:text-gray-300" data-testid="logo-admin" />
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white" data-testid="page-title">
                Admin - Pending Requests
              </h1>
              <Badge variant="secondary" className="ml-2" data-testid="pending-count">
                {pendingJobs.length} Pending
              </Badge>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/process">
                <Button variant="outline" size="sm" data-testid="button-back-processor">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Processor
                </Button>
              </Link>
              <Link href="/admin/templates">
                <Button variant="outline" size="sm" data-testid="button-templates">
                  Template Admin
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <Card className="bg-white dark:bg-gray-800" data-testid="card-pending-requests">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Pending Review Requests
            </CardTitle>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Documents uploaded by users that require admin approval before processing
            </p>
          </CardHeader>
          <CardContent>
            {pendingJobs.length === 0 ? (
              <div className="text-center py-12" data-testid="empty-state">
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No Pending Requests
                </h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                  All processing requests have been reviewed. New uploads will appear here for admin approval.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table data-testid="table-pending-jobs">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Upload Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingJobs.map((job) => (
                      <TableRow key={job.id} data-testid={`job-row-${job.id}`}>
                        <TableCell>
                          <div className="flex items-center space-x-3">
                            <FileText className="h-5 w-5 text-gray-500 flex-shrink-0" />
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white" data-testid={`job-filename-${job.id}`}>
                                {getFileName(job.originalFilePath)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400" data-testid={`job-id-${job.id}`}>
                                ID: {job.id.slice(0, 8)}...
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-900 dark:text-white" data-testid={`job-template-${job.id}`}>
                              {getTemplateName(job.templateId)}
                            </span>
                            {job.templateId && templates.find(t => t.id === job.templateId)?.isAutoCreated && (
                              <Badge variant="outline" className="text-xs">
                                <Zap className="h-3 w-3 mr-1" />
                                AI
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                            <Calendar className="h-4 w-4" />
                            <span data-testid={`job-date-${job.id}`}>
                              {format(new Date(job.createdAt), 'MMM dd, yyyy HH:mm')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={job.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <Dialog open={showJobDetails && selectedJob?.id === job.id} onOpenChange={(open) => {
                              if (!open) {
                                setShowJobDetails(false);
                                setSelectedJob(null);
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedJob(job);
                                    setShowJobDetails(true);
                                  }}
                                  data-testid={`button-view-${job.id}`}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  View
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Processing Job Details</DialogTitle>
                                  <DialogDescription>
                                    Review and manage this processing request
                                  </DialogDescription>
                                </DialogHeader>
                                
                                {selectedJob && (
                                  <div className="space-y-6">
                                    {/* Job Info */}
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Document</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="detail-filename">
                                          {getFileName(selectedJob.originalFilePath)}
                                        </p>
                                      </div>
                                      <div>
                                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Template</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="detail-template">
                                          {getTemplateName(selectedJob.templateId)}
                                        </p>
                                      </div>
                                      <div>
                                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Upload Date</h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="detail-date">
                                          {format(new Date(selectedJob.createdAt), 'MMMM dd, yyyy HH:mm:ss')}
                                        </p>
                                      </div>
                                      <div>
                                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Status</h4>
                                        <StatusBadge status={selectedJob.status} />
                                      </div>
                                    </div>

                                    {/* Error Message */}
                                    {selectedJob.errorMessage && (
                                      <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription>
                                          {selectedJob.errorMessage}
                                        </AlertDescription>
                                      </Alert>
                                    )}

                                    {/* Actions */}
                                    <div className="flex justify-between pt-4 border-t">
                                      <Button 
                                        variant="destructive" 
                                        onClick={() => handleDeleteJob(selectedJob)}
                                        disabled={deleteJobMutation.isPending}
                                        data-testid="button-delete-job"
                                      >
                                        <XCircle className="h-4 w-4 mr-2" />
                                        {deleteJobMutation.isPending ? 'Deleting...' : 'Delete Job'}
                                      </Button>
                                      
                                      <div className="flex space-x-2">
                                        <Button 
                                          variant="outline" 
                                          onClick={() => handleRejectJob(selectedJob)}
                                          disabled={updateJobMutation.isPending}
                                          data-testid="button-reject-job"
                                        >
                                          <XCircle className="h-4 w-4 mr-2" />
                                          {updateJobMutation.isPending ? 'Rejecting...' : 'Reject'}
                                        </Button>
                                        <Button 
                                          onClick={() => handleApproveJob(selectedJob)}
                                          disabled={updateJobMutation.isPending}
                                          data-testid="button-approve-job"
                                        >
                                          <CheckCircle className="h-4 w-4 mr-2" />
                                          {updateJobMutation.isPending ? 'Approving...' : 'Approve & Process'}
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Stats */}
        {allJobs.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Jobs</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white" data-testid="stat-total">
                      {allJobs.length}
                    </p>
                  </div>
                  <FileText className="h-8 w-8 text-gray-400" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Pending Review</p>
                    <p className="text-2xl font-bold text-yellow-600" data-testid="stat-pending">
                      {pendingJobs.length}
                    </p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Completed</p>
                    <p className="text-2xl font-bold text-green-600" data-testid="stat-completed">
                      {allJobs.filter(job => job.status === 'completed').length}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Errors</p>
                    <p className="text-2xl font-bold text-red-600" data-testid="stat-errors">
                      {allJobs.filter(job => job.status === 'error').length}
                    </p>
                  </div>
                  <XCircle className="h-8 w-8 text-red-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}