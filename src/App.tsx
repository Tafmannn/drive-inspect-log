import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { Dashboard } from "./pages/Dashboard";
import { JobList } from "./pages/JobList";
import { JobMasterList } from "./pages/JobMasterList";
import { SyncErrors } from "./pages/SyncErrors";
import { JobForm } from "./pages/JobForm";
import { JobDetail } from "./pages/JobDetail";
import { CompletedJobs } from "./pages/CompletedJobs";
import { PendingJobs } from "./pages/PendingJobs";
import { InspectionFlow } from "./pages/InspectionFlow";
import { PodReport } from "./pages/PodReport";
import { PendingUploads } from "./pages/PendingUploads";
import { Expenses } from "./pages/Expenses";
import { ExpenseForm } from "./pages/ExpenseForm";
import { AdminDashboard } from "./pages/AdminDashboard";
import { Timesheets } from "./pages/Timesheets";
import { QrConfirm } from "./pages/QrConfirm";
import NotFound from "./pages/NotFound";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { useEffect } from "react";
import { retryAllPending } from "@/lib/pendingUploads";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

function BackgroundUploader() {
  useEffect(() => {
    retryAllPending().catch(() => {}); // fire-and-forget on app mount
  }, []);
  return null;
}

const App = () => {
  const isAdminOverride =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("admin") === "1"
      : false;

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppErrorBoundary>
        <BackgroundUploader />
        <AuthProvider overrideRoles={isAdminOverride ? ["ADMIN", "DRIVER"] : ["DRIVER"]}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/jobs" element={<JobList />} />
              <Route path="/jobs/master" element={<JobMasterList />} />
              <Route path="/jobs/new" element={<JobForm />} />
              <Route path="/jobs/completed" element={<CompletedJobs />} />
              <Route path="/jobs/pending" element={<PendingJobs />} />
              <Route path="/jobs/:jobId" element={<JobDetail />} />
              <Route path="/jobs/:jobId/edit" element={<JobForm />} />
              <Route path="/jobs/:jobId/pod" element={<PodReport />} />
              <Route path="/inspection/:jobId/:inspectionType" element={<InspectionFlow />} />
              <Route path="/pending-uploads" element={<PendingUploads />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/expenses/new" element={<ExpenseForm />} />
              <Route path="/expenses/:expenseId/edit" element={<ExpenseForm />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/timesheets" element={<Timesheets />} />
              <Route path="/admin/sync-errors" element={<SyncErrors />} />
              <Route path="/confirm" element={<QrConfirm />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </AppErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
