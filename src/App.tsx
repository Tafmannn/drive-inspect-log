import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { JobList } from "./pages/JobList";
import { JobForm } from "./pages/JobForm";
import { JobDetail } from "./pages/JobDetail";
import { CompletedJobs } from "./pages/CompletedJobs";
import { PendingJobs } from "./pages/PendingJobs";
import { InspectionFlow } from "./pages/InspectionFlow";
import { PodReport } from "./pages/PodReport";
import { PendingUploads } from "./pages/PendingUploads";
import NotFound from "./pages/NotFound";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jobs" element={<JobList />} />
            <Route path="/jobs/new" element={<JobForm />} />
            <Route path="/jobs/completed" element={<CompletedJobs />} />
            <Route path="/jobs/pending" element={<PendingJobs />} />
            <Route path="/jobs/:jobId" element={<JobDetail />} />
            <Route path="/jobs/:jobId/edit" element={<JobForm />} />
            <Route path="/jobs/:jobId/pod" element={<PodReport />} />
            <Route
              path="/inspection/:jobId/:inspectionType"
              element={<InspectionFlow />}
            />
            <Route path="/pending-uploads" element={<PendingUploads />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;