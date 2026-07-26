import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigationType } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { DevRoleBanner } from "@/components/DevRoleBanner";
import { OfflineBanner } from "@/components/OfflineBanner";
import { UpdatePrompt } from "@/components/UpdatePrompt";

// ── Driver hot path: kept eager so the screens a driver opens on every job
// (dashboard, jobs, a job, the inspection walk-around, uploads, profile,
// expenses) render instantly with no chunk-load flash. Auth screens are here
// too so first paint after a cold open is immediate.
import { Dashboard } from "./pages/Dashboard";
import { JobList } from "./pages/JobList";
import { JobDetail } from "./pages/JobDetail";
import { CompletedJobs } from "./pages/CompletedJobs";
import { PendingJobs } from "./pages/PendingJobs";
import { InspectionFlow } from "./pages/InspectionFlow";
import { PendingUploads } from "./pages/PendingUploads";
import { Expenses } from "./pages/Expenses";
import { ExpenseForm } from "./pages/ExpenseForm";
import { Profile } from "./pages/Profile";
import { QrConfirm } from "./pages/QrConfirm";
import { Login } from "./pages/Login";
import OAuthConsent from "./pages/OAuthConsent";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Welcome } from "./pages/Welcome";
import NotFound from "./pages/NotFound";
import DriverDigitalId from "./features/onboarding/pages/DriverDigitalId";

import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { AccountStatusGate } from "./components/AccountStatusGate";
import { DriverGateScreen } from "./components/DriverGateScreen";
import { useDriverGate } from "@/hooks/useDriverGate";
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { installRetryTriggers, triggerRetry } from "@/lib/retryOrchestrator";
import { installSubmitQueueDrainer, drainSubmitQueue } from "@/lib/submitQueue";
import { installEvidenceDrainTriggers, drainEvidenceQueue } from "@/lib/evidence/queueRuntime";
import { Loader2 } from "lucide-react";
import { ControlRoute } from "@/features/control/guards/ControlRoute";

// ── Management surface: admin, super-admin, the Control Center, invoicing,
// onboarding wizards and the PDF-heavy report/generator screens are lazy-
// loaded. A driver never opens these, so their code stays out of the initial
// download; each becomes its own chunk fetched on first visit and cached for
// the session behind the <Suspense> fallback below.
function lazyNamed<T extends Record<string, unknown>>(
  loader: () => Promise<T>,
  name: keyof T,
) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
}

const JobMasterList = lazyNamed(() => import("./pages/JobMasterList"), "JobMasterList");
const JobForm = lazyNamed(() => import("./pages/JobForm"), "JobForm");
const PodReport = lazyNamed(() => import("./pages/PodReport"), "PodReport");
const AdminDashboard = lazyNamed(() => import("./pages/AdminDashboard"), "AdminDashboard");
const AdminJobsQueue = lazyNamed(() => import("./pages/AdminJobsQueue"), "AdminJobsQueue");
const Timesheets = lazyNamed(() => import("./pages/Timesheets"), "Timesheets");
const AdminUsers = lazyNamed(() => import("./pages/AdminUsers"), "AdminUsers");
const AdminDrivers = lazyNamed(() => import("./pages/AdminDrivers"), "AdminDrivers");
const AdminPodReview = lazyNamed(() => import("./pages/AdminPodReview"), "AdminPodReview");
const AdminFinance = lazyNamed(() => import("./pages/AdminFinance"), "AdminFinance");
const AdminOnboarding = lazyNamed(() => import("./pages/AdminOnboarding"), "AdminOnboarding");
const SuperAdminDashboard = lazyNamed(() => import("./pages/SuperAdminDashboard"), "SuperAdminDashboard");
const SuperAdminOrgs = lazyNamed(() => import("./pages/SuperAdminPages"), "SuperAdminOrgs");
const SuperAdminUsers = lazyNamed(() => import("./pages/SuperAdminPages"), "SuperAdminUsers");
const SuperAdminJobs = lazyNamed(() => import("./pages/SuperAdminPages"), "SuperAdminJobs");
const SuperAdminAudit = lazyNamed(() => import("./pages/SuperAdminPages"), "SuperAdminAudit");
const SuperAdminErrors = lazyNamed(() => import("./pages/SuperAdminPages"), "SuperAdminErrors");
const SuperAdminAttention = lazyNamed(() => import("./pages/SuperAdminPages"), "SuperAdminAttention");
const SuperAdminSettings = lazyNamed(() => import("./pages/SuperAdminPages"), "SuperAdminSettings");
const InvoiceGenerator = lazyNamed(() => import("./pages/InvoiceGenerator"), "InvoiceGenerator");
const DriverOnboardingWizard = lazy(() => import("./features/onboarding/pages/DriverOnboardingWizard"));
const ClientOnboardingWizard = lazy(() => import("./features/onboarding/pages/ClientOnboardingWizard"));
const OrganisationOnboardingWizard = lazy(() => import("./features/onboarding/pages/OrganisationOnboardingWizard"));
const DriverProfileDetail = lazy(() => import("./features/onboarding/pages/DriverProfileDetail"));
const ClientProfileDetail = lazy(() => import("./features/onboarding/pages/ClientProfileDetail"));
const OrganisationProfileDetail = lazy(() => import("./features/onboarding/pages/OrganisationProfileDetail"));
const ControlLayout = lazyNamed(() => import("@/features/control/layouts/ControlLayout"), "ControlLayout");
const ControlOverview = lazyNamed(() => import("@/features/control/pages/ControlOverview"), "ControlOverview");
const ControlJobs = lazyNamed(() => import("@/features/control/pages/ControlJobs"), "ControlJobs");
const ControlDrivers = lazyNamed(() => import("@/features/control/pages/ControlDrivers"), "ControlDrivers");
const ControlCompliance = lazyNamed(() => import("@/features/control/pages/ControlCompliance"), "ControlCompliance");
const ControlPodReview = lazyNamed(() => import("@/features/control/pages/ControlPodReview"), "ControlPodReview");
const ControlFinance = lazyNamed(() => import("@/features/control/pages/ControlFinance"), "ControlFinance");
const ControlClients = lazyNamed(() => import("@/features/control/pages/ControlClients"), "ControlClients");
const InvoicePrepScreen = lazyNamed(() => import("@/features/invoicing/pages/InvoicePrepScreen"), "InvoicePrepScreen");
const ControlAdmin = lazyNamed(() => import("@/features/control/pages/ControlAdmin"), "ControlAdmin");
const ControlSuperAdmin = lazyNamed(() => import("@/features/control/pages/ControlSuperAdmin"), "ControlSuperAdmin");
const ExportsPage = lazyNamed(() => import("@/features/exports/pages/ExportsPage"), "ExportsPage");

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

  // Retry on auth-ready (initial app boot + later sign-ins).
  // Drain queued offline submissions FIRST so their photos get
  // promoted before the photo-upload worker picks anything up.
  useEffect(() => {
    if (authLoading || !user) return;
    void drainSubmitQueue().finally(() => {
      void triggerRetry("auth_ready");
      // Evidence v2 uploads (capture-time queue) — independent of the legacy
      // photo worker; drains regardless of the capture feature flag so a flag
      // flip never strands queued evidence.
      void drainEvidenceQueue();
    });
  }, [authLoading, user]);

  // Install global online/visibility/focus triggers exactly once per
  // app lifetime so a returning driver auto-flushes their queue.
  useEffect(() => {
    const cleanupRetry = installRetryTriggers();
    const cleanupSubmit = installSubmitQueueDrainer();
    const cleanupEvidence = installEvidenceDrainTriggers();
    return () => {
      cleanupRetry();
      cleanupSubmit();
      cleanupEvidence();
    };
  }, []);

  return null;
}

/* ── Protected route wrapper ── */

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
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

  // Block suspended or pending_activation users
  if (user.accountStatus === "suspended" || user.accountStatus === "pending_activation") {
    return <AccountStatusGate user={user} />;
  }

  return <DriverOnboardingGate>{children}</DriverOnboardingGate>;
}

/**
 * WORKFLOW-002: useDriverGate() (blocks drivers whose onboarding is
 * no_profile/onboarding/rejected) was previously enforced only by Dashboard
 * rendering <DriverGateScreen> at "/" — every other protected route
 * (JobDetail, InspectionFlow, PodReport, PendingUploads, ExpenseForm, ...)
 * never checked it, so a not-yet-approved or rejected driver could still
 * reach a job directly (e.g. via browser history) and complete a real
 * inspection. Centralising the check in ProtectedRoute closes every route at
 * once. This is a no-op for admins/superadmins: useDriverGate()'s query is
 * gated on `isDriverOnly`, so it never even fires for non-driver roles.
 */
function DriverOnboardingGate({ children }: { children: React.ReactNode }) {
  const gate = useDriverGate();

  if (gate.isDriverOnly && gate.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (gate.isDriverOnly && gate.status !== "active") {
    return <DriverGateScreen gateStatus={gate.status as Exclude<typeof gate.status, "loading" | "active" | "ungated">} />;
  }

  return <>{children}</>;
}

/* ── Admin-only route guard ── */

/* ── Suspense fallback for lazily-loaded route chunks ── */

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

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

/**
 * BrowserRouter doesn't reset scroll position on navigation the way a
 * full page load does, so pushing a new route (e.g. opening a job from
 * partway down a scrolled list) rendered the new page at the old scroll
 * offset instead of the top. Only resets on PUSH/REPLACE — browser
 * back/forward (POP) is left alone so returning to a list keeps its
 * scroll position, matching native app behavior.
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== "POP") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [pathname, navigationType]);

  return null;
}

/* ── App ── */

const App = () => {
  const overrideRoles = getDevOverrideRoles();

  // defaultTheme="light" (not "system"): the app has always rendered light,
  // so existing users keep what they have until they opt in via the
  // Appearance switch — which includes a follow-system option.
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppErrorBoundary>
          <ConfirmProvider>
          <AuthProvider overrideRoles={overrideRoles}>
            <BackgroundUploader />
            <DevRoleBanner />
            <BrowserRouter>
              <ScrollToTop />
              <OfflineBanner />
              <UpdatePrompt />
              <Suspense fallback={<PageLoader />}>
              <Routes>
                {/* ── Public routes ── */}
                <Route path="/login" element={<Login />} />
                <Route path="/index" element={<Navigate to="/" replace />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/welcome" element={<Welcome />} />
                <Route path="/confirm" element={<QrConfirm />} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />

                {/* ── Protected routes (flat) ── */}
                <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/jobs" element={<ProtectedRoute><JobList /></ProtectedRoute>} />
                <Route path="/jobs/master" element={<ProtectedRoute><AdminRoute><JobMasterList /></AdminRoute></ProtectedRoute>} />
                <Route path="/jobs/new" element={<ProtectedRoute><AdminRoute><JobForm /></AdminRoute></ProtectedRoute>} />
                <Route path="/jobs/completed" element={<ProtectedRoute><CompletedJobs /></ProtectedRoute>} />
                <Route path="/jobs/pending" element={<ProtectedRoute><PendingJobs /></ProtectedRoute>} />
                <Route path="/jobs/:jobId" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
                <Route path="/jobs/:jobId/edit" element={<ProtectedRoute><AdminRoute><JobForm /></AdminRoute></ProtectedRoute>} />
                <Route path="/jobs/:jobId/pod" element={<ProtectedRoute><PodReport /></ProtectedRoute>} />
                <Route path="/inspection/:jobId/:inspectionType" element={<ProtectedRoute><InspectionFlow /></ProtectedRoute>} />
                <Route path="/pending-uploads" element={<ProtectedRoute><PendingUploads /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                <Route path="/profile/id" element={<ProtectedRoute><DriverDigitalId /></ProtectedRoute>} />
                <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
                <Route path="/expenses/new" element={<ProtectedRoute><ExpenseForm /></ProtectedRoute>} />
                <Route path="/expenses/:expenseId/edit" element={<ProtectedRoute><ExpenseForm /></ProtectedRoute>} />

                {/* ── Admin-only routes ── */}
                <Route path="/admin" element={<ProtectedRoute><AdminRoute><AdminDashboard /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/jobs" element={<ProtectedRoute><AdminRoute><AdminJobsQueue /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/timesheets" element={<ProtectedRoute><AdminRoute><Timesheets /></AdminRoute></ProtectedRoute>} />
                {/* /admin/sync-errors removed — Google Sheets sync retired */}
                <Route path="/admin/users" element={<ProtectedRoute><AdminRoute><AdminUsers /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/drivers" element={<ProtectedRoute><AdminRoute><AdminDrivers /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/pod-review" element={<ProtectedRoute><AdminRoute><AdminPodReview /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/finance" element={<ProtectedRoute><AdminRoute><AdminFinance /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/onboarding" element={<ProtectedRoute><AdminRoute><AdminOnboarding /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/drivers/:userId" element={<ProtectedRoute><AdminRoute><DriverProfileDetail /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/drivers/:userId/complete" element={<ProtectedRoute><AdminRoute><DriverOnboardingWizard /></AdminRoute></ProtectedRoute>} />
                <Route path="/admin/drivers/:userId/id" element={<ProtectedRoute><AdminRoute><DriverDigitalId /></AdminRoute></ProtectedRoute>} />
                {/* Lives under /control (not /admin) — clients are only ever listed at
                    /control/clients, and ClientProfileDetail's back button points there. */}
                <Route path="/control/clients/:clientId" element={<ProtectedRoute><AdminRoute><ClientProfileDetail /></AdminRoute></ProtectedRoute>} />
                <Route path="/control/clients/:clientId/complete" element={<ProtectedRoute><AdminRoute><ClientOnboardingWizard /></AdminRoute></ProtectedRoute>} />
                <Route path="/super-admin/orgs/:orgId" element={<ProtectedRoute><SuperAdminRoute><OrganisationProfileDetail /></SuperAdminRoute></ProtectedRoute>} />
                <Route path="/super-admin/orgs/:orgId/complete" element={<ProtectedRoute><SuperAdminRoute><OrganisationOnboardingWizard /></SuperAdminRoute></ProtectedRoute>} />

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
                  <Route path="clients" element={<ControlClients />} />
                  <Route path="invoice-prep" element={<InvoicePrepScreen />} />
                  <Route path="admin" element={<ControlAdmin />} />
                  <Route path="exports" element={<ExportsPage />} />
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
              </Suspense>
            </BrowserRouter>
          </AuthProvider>
          </ConfirmProvider>
        </AppErrorBoundary>
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
