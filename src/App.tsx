import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
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
import { AdminUsers } from "./pages/AdminUsers";
import { Profile } from "./pages/Profile";
import { QrConfirm } from "./pages/QrConfirm";
import { Auth } from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { useEffect } from "react";
import { retryAllPending } from "@/lib/pendingUploads";
import { Loader2 } from "lucide-react";

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
    retryAllPending().catch(() => {});
  }, []);
  return null;
}

/* ── Admin-only route guard ───────────────────────────────────────── */

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/* ── Auth gate (only active when authEnabled) ─────────────────────── */

function AuthGate({ children }: { children: React.ReactNode }) {
  const { authEnabled, authLoading, user } = useAuth();

  // Dev mode — no gate
  if (!authEnabled) return <>{children}</>;

  // Loading session
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in
  if (!user) return <Auth />;

  return <>{children}</>;
}

/* ── App ──────────────────────────────────────────────────────────── */

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
          <AuthProvider
            overrideRoles={isAdminOverride ? ["ADMIN", "DRIVER"] : ["DRIVER"]}
          >
            <BrowserRouter>
              <AuthGate>
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
                  <Route
                    path="/inspection/:jobId/:inspectionType"
                    element={<InspectionFlow />}
                  />
                  <Route path="/pending-uploads" element={<PendingUploads />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/expenses" element={<Expenses />} />
                  <Route path="/expenses/new" element={<ExpenseForm />} />
                  <Route
                    path="/expenses/:expenseId/edit"
                    element={<ExpenseForm />}
                  />
                  {/* Admin-only routes */}
                  <Route
                    path="/admin"
                    element={
                      <AdminRoute>
                        <AdminDashboard />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/admin/timesheets"
                    element={
                      <AdminRoute>
                        <Timesheets />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/admin/sync-errors"
                    element={
                      <AdminRoute>
                        <SyncErrors />
                      </AdminRoute>
                    }
                  />
                  <Route
                    path="/admin/users"
                    element={
                      <AdminRoute>
                        <AdminUsers />
                      </AdminRoute>
                    }
                  />
                  <Route path="/confirm" element={<QrConfirm />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AuthGate>
            </BrowserRouter>
          </AuthProvider>
        </AppErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
