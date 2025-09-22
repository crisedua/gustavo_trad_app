import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Settings, Upload, Zap, Lock, Shield, UserCheck } from "lucide-react";
import { useState } from "react";

export default function Home() {
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  
  const ADMIN_PASSWORD = 'admin123'; // In production, this should be environment variable
  
  const handleAdminLogin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      setShowAdminLogin(false);
      setAdminPassword('');
    } else {
      alert('Incorrect password');
    }
  };
  
  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    setAdminPassword('');
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Document Processing System
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
            AI-powered document processing with automatic field extraction and template generation. 
            Upload your documents and let our intelligent system extract data and fill templates for you.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card className="text-center" data-testid="card-feature-upload">
            <CardHeader>
              <Upload className="w-8 h-8 mx-auto text-blue-600 dark:text-blue-400" />
              <CardTitle className="text-lg">Smart Upload</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Drag and drop documents for instant processing with advanced OCR technology
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center" data-testid="card-feature-extraction">
            <CardHeader>
              <Zap className="w-8 h-8 mx-auto text-green-600 dark:text-green-400" />
              <CardTitle className="text-lg">AI Extraction</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Automatically extract 25+ fields using advanced AI and machine learning
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center" data-testid="card-feature-templates">
            <CardHeader>
              <FileText className="w-8 h-8 mx-auto text-purple-600 dark:text-purple-400" />
              <CardTitle className="text-lg">Template System</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Generate filled documents using customizable PDF templates automatically
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center" data-testid="card-feature-management">
            <CardHeader>
              <Settings className="w-8 h-8 mx-auto text-orange-600 dark:text-orange-400" />
              <CardTitle className="text-lg">Easy Management</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Full CRUD operations for templates with intuitive admin interface
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link href="/process">
            <Button size="lg" className="w-full sm:w-auto" data-testid="button-start-processing">
              <Upload className="w-5 h-5 mr-2" />
              Start Processing Documents
            </Button>
          </Link>
          
          {/* Hidden: Manage Templates button
          <Link href="/admin/templates">
            <Button variant="outline" size="lg" className="w-full sm:w-auto" data-testid="button-manage-templates">
              <Settings className="w-5 h-5 mr-2" />
              Manage Templates
            </Button>
          </Link>
          */}
        </div>

        {/* Admin Section */}
        <div className="mt-12">
          {!isAdminAuthenticated ? (
            <div className="text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdminLogin(!showAdminLogin)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <Lock className="w-4 h-4 mr-2" />
                Admin Access
              </Button>
              
              {showAdminLogin && (
                <div className="mt-4 max-w-sm mx-auto">
                  <Card>
                    <CardContent className="p-6">
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="admin-password" className="text-sm font-medium">Admin Password</Label>
                          <Input
                            id="admin-password"
                            type="password"
                            value={adminPassword}
                            onChange={(e) => setAdminPassword(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                            placeholder="Enter admin password"
                            className="mt-2"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={handleAdminLogin} size="sm" className="flex-1">
                            <UserCheck className="w-4 h-4 mr-2" />
                            Login
                          </Button>
                          <Button 
                            variant="outline" 
                            onClick={() => setShowAdminLogin(false)} 
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Admin Panel</h3>
                </div>
                <Button variant="outline" size="sm" onClick={handleAdminLogout}>
                  Logout
                </Button>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/admin/requests">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto" data-testid="button-admin-requests">
                    <Settings className="w-5 h-5 mr-2" />
                    Admin Requests
                  </Button>
                </Link>
                <Link href="/admin/templates">
                  <Button variant="outline" size="lg" className="w-full sm:w-auto" data-testid="button-template-admin">
                    <FileText className="w-5 h-5 mr-2" />
                    Template Admin
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Process Overview */}
        <div className="mt-16 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6 text-center">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center" data-testid="step-upload">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">1</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Upload Document</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Upload your document and our OCR technology extracts the text
              </p>
            </div>
            
            <div className="text-center" data-testid="step-extract">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-green-600 dark:text-green-400 font-bold text-lg">2</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI Field Extraction</h3>
              <p className="text-gray-600 dark:text-gray-300">
                AI analyzes the content and extracts relevant fields automatically
              </p>
            </div>
            
            <div className="text-center" data-testid="step-generate">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-purple-600 dark:text-purple-400 font-bold text-lg">3</span>
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Generate Template</h3>
              <p className="text-gray-600 dark:text-gray-300">
                System fills your chosen template and generates the final document
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}