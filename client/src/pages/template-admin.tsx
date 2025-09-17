import { useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, FileText, Trash2, Edit, Calendar, Upload, Settings, ArrowLeft, HelpCircle, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

interface Template {
  id: string;
  name: string;
  description: string;
  filePath: string;
  fields: string[];
  createdAt: string;
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
  
  // Edit state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading, error: templatesError } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest('DELETE', `/api/templates/${templateId}`);
      return res.json();
    },
    onSuccess: (data, templateId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      toast({
        title: "Template Deleted",
        description: "Template has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete template",
        variant: "destructive",
      });
    },
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/templates', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create template');
      }
      
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setIsCreateModalOpen(false);
      setCreateForm({ name: '', description: '', fields: [] });
      setSelectedFile(null);
      toast({
        title: "Template Created",
        description: "Template has been successfully created.",
      });
    },
    onError: (error: any) => {
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

  // Handle file selection
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please select a PDF or DOCX file.",
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
    }
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
    
    const formData = new FormData();
    formData.append('name', createForm.name.trim());
    formData.append('description', createForm.description.trim());
    formData.append('fields', JSON.stringify(createForm.fields));
    formData.append('templateFile', selectedFile);

    createTemplateMutation.mutate(formData);
  };

  // Format date
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
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
            <DialogContent className="max-w-md" data-testid="dialog-create-template">
              <DialogHeader>
                <DialogTitle>Create New Template</DialogTitle>
                <DialogDescription>
                  Upload a document template with placeholders for automated processing.
                </DialogDescription>
              </DialogHeader>
              
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
                      id="templateFile"
                      type="file"
                      accept=".pdf,.docx"
                      onChange={handleFileSelect}
                      className="hidden"
                      data-testid="input-template-file"
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('templateFile')?.click()}
                      className="w-full justify-center"
                      data-testid="button-select-file"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {selectedFile ? selectedFile.name : 'Select PDF or DOCX file'}
                    </Button>
                  </div>
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground mt-1">
                      File size: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  )}
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
                  {isUploading ? "Creating..." : "Create Template"}
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
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Fields</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => (
                      <TableRow key={template.id} data-testid={`row-template-${template.id}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-blue-500" />
                            <span data-testid={`text-template-name-${template.id}`}>
                              {template.name}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span 
                            className="text-muted-foreground line-clamp-2" 
                            data-testid={`text-template-description-${template.id}`}
                          >
                            {template.description || 'No description'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" data-testid={`badge-fields-count-${template.id}`}>
                            {template.fields.length} fields
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span data-testid={`text-template-date-${template.id}`}>
                              {formatDate(template.createdAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end space-x-2">
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
                                  onClick={() => deleteTemplateMutation.mutate(template.id)}
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}