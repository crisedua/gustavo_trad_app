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
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Folder, Trash2, Edit, ArrowLeft, FileText, Settings } from "lucide-react";
import { Link } from "wouter";
import { DocumentType, Template } from "@shared/schema";

export default function CategoryAdmin() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    code: ''
  });
  const [editingCategory, setEditingCategory] = useState<DocumentType | null>(null);
  const [assigningCategory, setAssigningCategory] = useState<DocumentType | null>(null);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch document types/categories
  const { data: documentTypes = [], isLoading: categoriesLoading } = useQuery<DocumentType[]>({
    queryKey: ['/api/document-types'],
  });

  // Fetch all templates
  const { data: allTemplates = [], isLoading: templatesLoading } = useQuery<Template[]>({
    queryKey: ['/api/templates'],
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; code: string }) => {
      const response = await fetch(`/api/document-types`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to create category');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Category created successfully",
        description: "The new document category has been added.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/document-types'] });
      setIsCreateModalOpen(false);
      setCreateForm({ name: '', description: '', code: '' });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create category",
        description: error?.message || "An error occurred while creating the category",
        variant: "destructive",
      });
    }
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/document-types/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete category');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Category deleted successfully",
        description: "The category has been removed.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/document-types'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete category",
        description: error?.message || "An error occurred while deleting the category",
        variant: "destructive",
      });
    }
  });

  // Assign templates mutation
  const assignTemplatesMutation = useMutation({
    mutationFn: async ({ categoryId, templateIds }: { categoryId: string; templateIds: string[] }) => {
      const response = await fetch(`/api/document-types/${categoryId}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateIds })
      });
      if (!response.ok) throw new Error('Failed to assign templates');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Templates assigned successfully",
        description: "Templates have been assigned to the category.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/document-types'] });
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setIsAssignModalOpen(false);
      setSelectedTemplates([]);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to assign templates",
        description: error?.message || "An error occurred while assigning templates",
        variant: "destructive",
      });
    }
  });

  const handleCreateCategory = () => {
    if (!createForm.name.trim()) {
      toast({
        title: "Category name required",
        description: "Please provide a name for the category",
        variant: "destructive",
      });
      return;
    }
    if (!createForm.code.trim()) {
      toast({
        title: "Category code required",
        description: "Please provide a code for the category",
        variant: "destructive",
      });
      return;
    }
    createCategoryMutation.mutate(createForm);
  };

  const handleDeleteCategory = (id: string) => {
    deleteCategoryMutation.mutate(id);
  };

  const openAssignModal = (category: DocumentType) => {
    setAssigningCategory(category);
    setIsAssignModalOpen(true);
    setSelectedTemplates([]);
  };

  const handleAssignTemplates = () => {
    if (!assigningCategory) return;
    assignTemplatesMutation.mutate({
      categoryId: assigningCategory.id,
      templateIds: selectedTemplates
    });
  };

  // Get templates assigned to a category
  const getCategoryTemplates = (categoryId: string) => {
    return allTemplates.filter((template: Template) => template.documentTypeId === categoryId);
  };

  // Get unassigned templates
  const getUnassignedTemplates = () => {
    return allTemplates.filter((template: Template) => !template.documentTypeId);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/">
              <Button variant="ghost" size="sm" data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Category Management</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Manage document categories and assign templates to them
              </p>
            </div>
            
            <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-category">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Category</DialogTitle>
                  <DialogDescription>
                    Add a new document category that will appear in the dropdown
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="category-name">Category Name</Label>
                    <Input
                      id="category-name"
                      data-testid="input-category-name"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder="e.g., Birth Certificate, Tax Forms"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category-code">Category Code</Label>
                    <Input
                      id="category-code"
                      data-testid="input-category-code"
                      value={createForm.code}
                      onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                      placeholder="e.g., birth_cert, tax_forms"
                    />
                  </div>
                  <div>
                    <Label htmlFor="category-description">Description (Optional)</Label>
                    <Textarea
                      id="category-description"
                      data-testid="input-category-description"
                      value={createForm.description}
                      onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                      placeholder="Brief description of this document category"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleCreateCategory}
                      disabled={createCategoryMutation.isPending}
                      data-testid="button-submit-category"
                    >
                      {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
                    </Button>
                    <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Categories Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Folder className="w-5 h-5" />
              Document Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            {categoriesLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : documentTypes.length === 0 ? (
              <div className="text-center py-8">
                <Folder className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">No categories found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Create your first document category to get started
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Templates</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documentTypes.map((category) => {
                    const categoryTemplates = getCategoryTemplates(category.id);
                    return (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium" data-testid={`text-category-name-${category.id}`}>
                          {category.name}
                        </TableCell>
                        <TableCell data-testid={`text-category-description-${category.id}`}>
                          {category.description || <span className="text-gray-400">No description</span>}
                        </TableCell>
                        <TableCell data-testid={`text-category-templates-${category.id}`}>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {categoryTemplates.length} template{categoryTemplates.length !== 1 ? 's' : ''}
                            </Badge>
                            {categoryTemplates.length > 0 && (
                              <div className="text-xs text-gray-500">
                                {categoryTemplates.slice(0, 2).map((t) => t.name).join(", ")}
                                {categoryTemplates.length > 2 && ` +${categoryTemplates.length - 2} more`}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openAssignModal(category)}
                              data-testid={`button-assign-templates-${category.id}`}
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              Assign Templates
                            </Button>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  data-testid={`button-delete-category-${category.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Category</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{category.name}"? This action cannot be undone.
                                    Templates assigned to this category will become unassigned.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteCategory(category.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete
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
            )}
          </CardContent>
        </Card>

        {/* Assign Templates Modal */}
        <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Assign Templates to Category</DialogTitle>
              <DialogDescription>
                Select templates to assign to "{assigningCategory?.name}"
              </DialogDescription>
            </DialogHeader>
            
            {templatesLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Currently Assigned Templates</h4>
                  {assigningCategory && getCategoryTemplates(assigningCategory.id).length > 0 ? (
                    <div className="space-y-2">
                      {getCategoryTemplates(assigningCategory.id).map((template) => (
                        <div key={template.id} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded border">
                          <span className="text-sm">{template.name}</span>
                          <Badge variant="secondary">Assigned</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No templates currently assigned</p>
                  )}
                </div>
                
                <Separator />
                
                <div>
                  <h4 className="font-medium mb-2">Available Templates</h4>
                  {getUnassignedTemplates().length > 0 ? (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {getUnassignedTemplates().map((template) => (
                        <div key={template.id} className="flex items-center space-x-2 p-2 border rounded">
                          <input
                            type="checkbox"
                            id={`template-${template.id}`}
                            checked={selectedTemplates.includes(template.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTemplates([...selectedTemplates, template.id]);
                              } else {
                                setSelectedTemplates(selectedTemplates.filter(id => id !== template.id));
                              }
                            }}
                            className="rounded"
                            data-testid={`checkbox-template-${template.id}`}
                          />
                          <label htmlFor={`template-${template.id}`} className="text-sm flex-1 cursor-pointer">
                            {template.name}
                          </label>
                          <span className="text-xs text-gray-500">{template.description}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No unassigned templates available</p>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleAssignTemplates}
                    disabled={selectedTemplates.length === 0 || assignTemplatesMutation.isPending}
                    data-testid="button-submit-assign-templates"
                  >
                    {assignTemplatesMutation.isPending ? "Assigning..." : `Assign ${selectedTemplates.length} Template${selectedTemplates.length !== 1 ? 's' : ''}`}
                  </Button>
                  <Button variant="outline" onClick={() => setIsAssignModalOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}