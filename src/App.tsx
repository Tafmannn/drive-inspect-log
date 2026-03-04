import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { DevRoleBanner } from "@/components/DevRoleBanner";
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
import { OrgAdminDashboard } from "./pages/OrgAdminDashboard";
import { SuperAdminDashboard } from "./pages/SuperAdminDashboard";
import { Profile } from "./pages/Profile";
import { QrConfirm } from "./pages/QrConfirm";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
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

/* ── Super-admin-only route guard ─────────────────────────────────── */

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, isAdmin } = useAuth();
  if (!isSuperAdmin) {
    // Redirect admins to /admin, others to /
    return <Navigate to={isAdmin ? "/admin" : "/"} replace />;
  }
  return <>{children}</>;
}

/* ── Auth gate (only active when authEnabled) ─────────────────────── */

function AuthGate({ children }: { children: React.ReactNode }) {
  const { authEnabled, authLoading, user } = useAuth();

  if (!authEnabled) return <>{children}</>;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

/* ── Dev override roles ───────────────────────────────────────────── */

function getDevOverrideRoles(): import("@/context/AuthContext").AppRole[] {
  if (typeof window === "undefined") return ["DRIVER"];
  const params = new URLSearchParams(window.location.search);
  if (params.get("super") === "1") return ["SUPERADMIN", "ADMIN", "DRIVER"];
  if (params.get("admin") === "1") return ["ADMIN", "DRIVER"];
  return ["DRIVER"];
}

/* ── App ──────────────────────────────────────────────────────────── */

const App = () => {
  const overrideRoles = getDevOverrideRoles();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppErrorBoundary>
          <BackgroundUploader />
          <AuthProvider overrideRoles={overrideRoles}>
            <DevRoleBanner />
            <BrowserRouter>
              <Routes>
                {/* ── Public routes (outside AuthGate) ── */}
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/confirm" element={<QrConfirm />} />

                {/* ── Protected routes ── */}
                <Route
                  path="*"
                  element={
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
                        <Route
                          path="/admin/dashboard"
                          element={
                            <AdminRoute>
                              <OrgAdminDashboard />
                            </AdminRoute>
                          }
                        />
                        {/* Super-admin-only route */}
                        <Route
                          path="/super-admin"
                          element={
                            <SuperAdminRoute>
                              <SuperAdminDashboard />
                            </SuperAdminRoute>
                          }
                        />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </AuthGate>
                  }
                />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </AppErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
