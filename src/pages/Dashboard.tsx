/**
 * Home screen (`/`) — role-aware.
 *
 *  - Admins & super-admins land on the operational surface (the same
 *    intervention-first body as `/admin`): live Needs Action queue, KPI
 *    pills, compliance alerts. They don't drive, so the driver launcher
 *    was the wrong screen for them.
 *  - Drivers get a compact launcher: a 3-stat row (their jobs are the
 *    point) plus a couple of genuine shortcuts — no cards that merely
 *    duplicate the bottom nav.
 *
 * Driver-gated: non-active drivers still see the holding screen.
 */

import { lazy, Suspense } from "react";
import { AppHeader } from "@/components/AppHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { BottomNav } from "@/components/BottomNav";
import { DriverGateScreen } from "@/components/DriverGateScreen";
import { KpiPill } from "@/components/KpiPill";
import { Truck, Clock, AlertTriangle, Receipt, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardCounts } from "@/hooks/useJobs";
import { useDriverGate } from "@/hooks/useDriverGate";
import { useAuth } from "@/context/AuthContext";

// Admins/super-admins get the operational dashboard body — lazy so its heavy
// admin hooks/components never load for a driver, preserving the eager driver
// home's small bundle.
const AdminDashboardBody = lazy(() =>
  import("@/pages/AdminDashboard").then((m) => ({ default: m.AdminDashboardBody })),
);

/** Time-of-day greeting used in the header instead of a redundant "Dashboard" title. */
function greetingFor(name: string | undefined): string {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim().split(/\s+/)[0] || "there";
  return `${part}, ${first}`;
}

export const Dashboard = () => {
  const navigate = useNavigate();
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const gate = useDriverGate();
  const { data: counts, isLoading } = useDashboardCounts(
    gate.isDriverOnly ? gate.driverProfileId : undefined,
  );

  // Driver gate: show holding screen for non-active drivers.
  if (gate.isDriverOnly && gate.status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  if (gate.isDriverOnly && gate.status !== "active") {
    return <DriverGateScreen gateStatus={gate.status as any} />;
  }

  const isOps = isAdmin || isSuperAdmin;
  const greeting = greetingFor(user?.name);

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title={greeting} />

      {isOps ? (
        // Admins / super-admins → the operational dashboard.
        <Suspense
          fallback={
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          }
        >
          <AdminDashboardBody />
        </Suspense>
      ) : (
        // Drivers → compact launcher.
        <div className="p-4 space-y-5 max-w-lg mx-auto">
          {/* At-a-glance stat row (replaces three stacked full-width cards) */}
          <section>
            <div className="grid grid-cols-3 gap-2">
              <KpiPill
                label="Active"
                value={counts?.myJobs ?? 0}
                icon={Truck}
                loading={isLoading}
                onClick={() => navigate("/jobs")}
              />
              <KpiPill
                label="Uploads"
                value={counts?.pendingUploads ?? 0}
                icon={AlertTriangle}
                variant={(counts?.pendingUploads ?? 0) > 0 ? "warning" : "default"}
                loading={isLoading}
                onClick={() => navigate("/pending-uploads")}
              />
              <KpiPill
                label="Completed"
                value={counts?.completedLast14Days ?? 0}
                icon={Clock}
                loading={isLoading}
                onClick={() => navigate("/jobs/completed")}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 text-center">
              Completed shows the last 14 days
            </p>
          </section>

          {/* Shortcuts that aren't already in the bottom nav */}
          <section className="space-y-3">
            <DashboardCard
              icon={<Receipt className="w-6 h-6 stroke-[2]" />}
              title="Expenses"
              subtitle="Log receipts and view your expenses"
              onClick={() => navigate("/expenses")}
            />
          </section>
        </div>
      )}

      <BottomNav />
    </div>
  );
};
