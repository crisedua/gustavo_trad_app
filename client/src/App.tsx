import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import DocumentProcessor from "@/pages/document-processor";
import TemplateAdmin from "@/pages/template-admin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/process" component={DocumentProcessor} />
      <Route path="/admin/templates" component={TemplateAdmin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
