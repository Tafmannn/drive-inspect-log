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
import { KpiRowSkeleton, ListRowsSkeleton } from "@/components/skeletons";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UpNextCard } from "@/features/driver/UpNextCard";
import { Truck, Clock, AlertTriangle, ReceiptPoundSterling as Receipt } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardCounts } from "@/hooks/useJobs";
import { useDriverGate } from "@/hooks/useDriverGate";
import { useAuth } from "@/context/AuthContext";
import { HomeHeader } from "@/features/admin-home/HomeHeader";
import { adminGreeting } from "@/features/admin-home/greeting";
import "@/features/admin-home/admin-home.css";

// Admins/super-admins get the operational dashboard body — lazy so its heavy
// admin hooks/components never load for a driver, preserving the eager driver
// home's small bundle.
const AdminDashboardBody = lazy(() =>
  import("@/pages/AdminDashboard").then((m) => ({ default: m.AdminDashboardBody })),
);

/** "Fri 20 Nov 2026" — UK short date for the admin home. */
function todayLabel(): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date());
}

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

  // Driver gate: show a home-shaped placeholder while the role resolves.
  if (gate.isDriverOnly && gate.status === "loading") {
    return (
      <div className="min-h-screen bg-background pb-20">
        <AppHeader title={greetingFor(user?.name)} />
        <div className="p-4 space-y-4">
          <KpiRowSkeleton items={3} />
          <ListRowsSkeleton rows={3} />
        </div>
      </div>
    );
  }
  if (gate.isDriverOnly && gate.status !== "active") {
    return <DriverGateScreen gateStatus={gate.status as any} />;
  }

  const isOps = isAdmin || isSuperAdmin;
  const opsGreeting = adminGreeting(user?.name);
  const greeting = greetingFor(user?.name);

  if (isOps) {
    // Admins / super-admins → the operational dashboard, in the Admin Home
    // presentation (own header + greeting, floating dock).
    return (
      <div className="ah-root min-h-screen pb-28">
        <HomeHeader />
        <div className="mx-auto max-w-5xl px-4 pb-3 pt-2 sm:px-6 sm:pb-4 lg:px-8">
          <div className="px-0.5">
            <p className="text-[13px] font-medium leading-[18px] text-muted-foreground">{todayLabel()}</p>
            <h1 className="truncate text-[26px] font-semibold leading-[32px] tracking-[-0.024em] text-foreground min-[380px]:text-[28px] min-[380px]:leading-[34px] sm:text-[32px] sm:leading-[38px]">
              {opsGreeting}
            </h1>
          </div>
        </div>
        <Suspense
          fallback={
            <div className="mx-auto max-w-5xl space-y-4 px-4 sm:px-6 lg:px-8">
              <KpiRowSkeleton items={4} />
              <ListRowsSkeleton rows={3} />
            </div>
          }
        >
          <AdminDashboardBody />
        </Suspense>
        <BottomNav variant="floating" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title={greeting} />

      {(
        // Drivers → compact launcher.
        <div className="p-4 space-y-5 max-w-lg lg:max-w-3xl mx-auto page-enter">
          {/* The driver's next job and its action come first. */}
          <UpNextCard />

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

          {/* Browser-tab users: nudge once to install the app (needed for
              push on iPhone; instant offline launch everywhere). */}
          <InstallPrompt />

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
