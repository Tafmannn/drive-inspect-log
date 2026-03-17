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
import { AdminJobsQueue } from "./pages/AdminJobsQueue";
import { Timesheets } from "./pages/Timesheets";
import { AdminUsers } from "./pages/AdminUsers";
import { AdminDrivers } from "./pages/AdminDrivers";
import { AdminPodReview } from "./pages/AdminPodReview";
import { AdminFinance } from "./pages/AdminFinance";
import { SuperAdminDashboard } from "./pages/SuperAdminDashboard";
import {
  SuperAdminOrgs, SuperAdminUsers, SuperAdminJobs,
  SuperAdminAudit, SuperAdminErrors, SuperAdminAttention, SuperAdminSettings,
} from "./pages/SuperAdminPages";
import { InvoiceGenerator } from "./pages/InvoiceGenerator";
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

/* ── Command Center imports ── */
import { ControlLayout } from "@/features/control/layouts/ControlLayout";
import { ControlRoute } from "@/features/control/guards/ControlRoute";
import { ControlOverview } from "@/features/control/pages/ControlOverview";
import { ControlJobs } from "@/features/control/pages/ControlJobs";
import { ControlDrivers } from "@/features/control/pages/ControlDrivers";
import { ControlCompliance } from "@/features/control/pages/ControlCompliance";
import { ControlPodReview } from "@/features/control/pages/ControlPodReview";
import { ControlFinance } from "@/features/control/pages/ControlFinance";
import { ControlAdmin } from "@/features/control/pages/ControlAdmin";
import { ControlSuperAdmin } from "@/features/control/pages/ControlSuperAdmin";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

function BackgroundUploader() {
  const { authLoading, user } = useAuth();
  useEffect(() => {
    // Only retry uploads after auth is resolved and user is available
    // (getOrgId requires an active session)
    if (authLoading || !user) return;
    retryAllPending().catch(() => {});
  }, [authLoading, user]);
  return null;
}

/* ── Protected route wrapper ── */

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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

/* ── Admin-only route guard ── */

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/* ── Super-admin-only route guard ── */

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, isAdmin } = useAuth();
  if (!isSuperAdmin) {
    return <Navigate to={isAdmin ? "/admin" : "/"} replace />;
  }
  return <>{children}</>;
}

/* ── Dev override roles ──
 * These query-param backdoors (?admin=1, ?super=1) are ONLY honoured
 * in development mode (import.meta.env.DEV). In production builds,
 * Vite statically replaces DEV with false and the branch is dead-code
 * eliminated, so the backdoors cannot be exploited.
 */

function getDevOverrideRoles(): import("@/context/AuthContext").AppRole[] {
  // Guard: never honour URL overrides in production
  if (!import.meta.env.DEV) return ["DRIVER"];
  if (typeof window === "undefined") return ["DRIVER"];
  const params = new URLSearchParams(window.location.search);
  if (params.get("super") === "1") return ["SUPERADMIN", "ADMIN", "DRIVER"];
  if (params.get("admin") === "1") return ["ADMIN", "DRIVER"];
  return ["DRIVER"];
}

/* ── App ── */

const App = () => {
  const overrideRoles = getDevOverrideRoles();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppErrorBoundary>
          <AuthProvider overrideRoles={overrideRoles}>
            <BackgroundUploader />
            <DevRoleBanner />
            <BrowserRouter>
              <Routes>
                {/* ── Public routes ── */}
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/confirm" element={<QrConfirm />} />

                {/* ── Protected routes (flat) ── */}
                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/jobs" element={<ProtectedRoute><JobList /></ProtectedRoute>} />
                <Route path="/jobs/master" element={<ProtectedRoute><JobMasterList /></ProtectedRoute>} />
                <Route path="/jobs/new" element={<ProtectedRoute><JobForm /></ProtectedRoute>} />
                <Route path="/jobs/completed" element={<ProtectedRoute><CompletedJobs /></ProtectedRoute>} />
                <Route path="/jobs/pending" element={<ProtectedRoute><PendingJobs /></ProtectedRoute>} />
                <Route path="/jobs/:jobId" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
                <Route path="/jobs/:jobId/edit" element={<ProtectedRoute><JobForm /></ProtectedRoute>} />
                <Route path="/jobs/:jobId/pod" element={<ProtectedRoute><PodReport /></ProtectedRoute>} />
                <Route path="/inspection/:jobId/:inspectionType" element={<ProtectedRoute><InspectionFlow /></ProtectedRoute>} />
                <Route path="/pending-uploads" element={<ProtectedRoute><PendingUploads /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
                <Route path="/expenses/new" element={<ProtectedRoute><ExpenseForm /></ProtectedRoute>} />
                <Route path="/expenses/:expenseId/edit" element={<ProtectedRoute><ExpenseForm /></ProtectedRoute>} />

                {/* ── Admin-only routes ── */}
                <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminDashboard /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/jobs" element={<ProtectedRoute><AdminRoute><AdminJobsQueue /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/timesheets" element={<ProtectedRoute><AdminRoute><Timesheets /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/sync-errors" element={<ProtectedRoute><AdminRoute><SyncErrors /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute><AdminRoute><AdminUsers /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/drivers" element={<ProtectedRoute><AdminRoute><AdminDrivers /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/pod-review" element={<ProtectedRoute><AdminRoute><AdminPodReview /></AdminRoute></ProtectedRoute>} />


                {/* ── Super-admin-only routes ── */}
                <Route path="/super-admin" element={<ProtectedRoute><SuperAdminRoute><SuperAdminDashboard /></SuperAdminRoute></ProtectedRoute>} />
                <Route path="/super-admin/orgs" element={<ProtectedRoute><SuperAdminRoute><SuperAdminOrgs /></SuperAdminRoute></ProtectedRoute>} />
                <Route path="/super-admin/users" element={<ProtectedRoute><SuperAdminRoute><SuperAdminUsers /></SuperAdminRoute></ProtectedRoute>} />
                <Route path="/super-admin/jobs" element={<ProtectedRoute><SuperAdminRoute><SuperAdminJobs /></SuperAdminRoute></ProtectedRoute>} />
                <Route path="/super-admin/audit" element={<ProtectedRoute><SuperAdminRoute><SuperAdminAudit /></SuperAdminRoute></ProtectedRoute>} />
                <Route path="/super-admin/errors" element={<ProtectedRoute><SuperAdminRoute><SuperAdminErrors /></SuperAdminRoute></ProtectedRoute>} />
                <Route path="/super-admin/attention" element={<ProtectedRoute><SuperAdminRoute><SuperAdminAttention /></SuperAdminRoute></ProtectedRoute>} />
                <Route path="/super-admin/settings" element={<ProtectedRoute><SuperAdminRoute><SuperAdminSettings /></SuperAdminRoute></ProtectedRoute>} />
                <Route path="/invoice/new" element={<ProtectedRoute><AdminRoute><InvoiceGenerator /></AdminRoute></ProtectedRoute>} />
                <Route path="/invoice/new/:jobId" element={<ProtectedRoute><AdminRoute><InvoiceGenerator /></AdminRoute></ProtectedRoute>} />

                {/* ── Command Center (desktop-first) ── */}
                <Route
                  path="/control"
                  element={
                    <ControlRoute>
                      <ControlLayout />
                    </ControlRoute>
                  }
                >
                  <Route index element={<ControlOverview />} />
                  <Route path="jobs" element={<ControlJobs />} />
                  <Route path="pod-review" element={<ControlPodReview />} />
                  <Route path="drivers" element={<ControlDrivers />} />
                  <Route path="compliance" element={<ControlCompliance />} />
                  <Route path="finance" element={<ControlFinance />} />
                  <Route path="admin" element={<ControlAdmin />} />
                  <Route
                    path="super-admin"
                    element={
                      <ControlRoute requiredRole="SUPERADMIN">
                        <ControlSuperAdmin />
                      </ControlRoute>
                    }
                  />
                </Route>

                {/* ── Catch-all ── */}
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
