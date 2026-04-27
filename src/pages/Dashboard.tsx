/**
 * Phase 5 — Driver Dashboard
 * Execution launcher: Workflow → Utilities → Management → Exports
 * Driver-gated: shows holding screen if onboarding not approved.
 */

import { AppHeader } from "@/components/AppHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { BottomNav } from "@/components/BottomNav";
import { DriverGateScreen } from "@/components/DriverGateScreen";
import { Button } from "@/components/ui/button";
import {
  Truck, Clock, AlertTriangle, FileDown,
  Receipt, ShieldCheck, Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardCounts } from "@/hooks/useJobs";
import { useDriverGate } from "@/hooks/useDriverGate";
import { toast } from "@/hooks/use-toast";
import { exportJobsCsv, exportInspectionsCsv } from "@/lib/export";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { RoleScope } from "@/components/ui-kit";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { isAdmin, isSuperAdmin } = useAuth();
  const gate = useDriverGate();
  const { data: counts, isLoading } = useDashboardCounts(gate.isDriverOnly ? gate.driverProfileId : undefined);
  const [exporting, setExporting] = useState(false);

  // Driver gate: show holding screen for non-active drivers
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

  const handleExport = async (type: "jobs" | "inspections" | "expenses") => {
    setExporting(true);
    try {
      if (type === "jobs") await exportJobsCsv();
      else if (type === "inspections") await exportInspectionsCsv();
      else await exportExpensesCsv();
      toast({ title: "Exported." });
    } catch {
      toast({ title: "Export failed.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Dashboard" />

      <div className="p-4 space-y-5 max-w-lg mx-auto">
        {/* ── Workflow ─────────────────────────────────────── */}
        <section>
          <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Workflow</h2>
          {isLoading ? (
            <DashboardSkeleton />
          ) : (
            <div className="space-y-3">
              <DashboardCard
                icon={<Truck className="w-6 h-6 stroke-[2]" />}
                title="My Jobs"
                subtitle="View your current jobs"
                count={counts?.myJobs ?? 0}
                onClick={() => navigate("/jobs")}
              />
              <DashboardCard
                icon={<AlertTriangle className="w-6 h-6 stroke-[2]" />}
                title="Pending Uploads"
                subtitle="Photos awaiting upload"
                count={counts?.pendingUploads ?? 0}
                onClick={() => navigate("/pending-uploads")}
                iconClassName="bg-warning/10 text-warning"
              />
              <DashboardCard
                icon={<Clock className="w-6 h-6 stroke-[2]" />}
                title="Completed (14d)"
                subtitle="Jobs completed in the last 2 weeks"
                count={counts?.completedLast14Days ?? 0}
                onClick={() => navigate("/jobs/completed")}
              />
            </div>
          )}
        </section>

        {/* ── Utilities (admin only) ───────────────────────── */}
        <RoleScope admin>
          <section>
            <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Utilities</h2>
            <div className="space-y-3">
              <DashboardCard
                icon={<Receipt className="w-6 h-6 stroke-[2]" />}
                title="Expenses"
                subtitle="Log and view your expenses"
                onClick={() => navigate("/expenses")}
              />
            </div>
          </section>
        </RoleScope>

        {/* ── Management (role-gated) ─────────────────────── */}
        <RoleScope admin>
          <section>
            <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Management</h2>
            <div className="space-y-3">
              {isAdmin && (
                <DashboardCard
                  icon={<ShieldCheck className="w-6 h-6 stroke-[2]" />}
                  title="Control Center"
                  subtitle="Operations, jobs, drivers & exports"
                  onClick={() => navigate("/control")}
                  iconClassName="bg-accent/10 text-accent"
                />
              )}
              <RoleScope superAdminOnly>
                <DashboardCard
                  icon={<ShieldCheck className="w-6 h-6 stroke-[2]" />}
                  title="Super Admin"
                  subtitle="Global control centre"
                  onClick={() => navigate("/super-admin")}
                  iconClassName="bg-destructive/10 text-destructive"
                />
              </RoleScope>
            </div>
          </section>
        </RoleScope>

        {/* ── Quick Exports (admin only) ───────────────────── */}
        <RoleScope admin>
          <section>
            <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Quick Exports</h2>
            <div className="grid grid-cols-3 gap-3">
              <Button variant="outline" onClick={() => handleExport("jobs")} disabled={exporting} className="min-h-[44px] rounded-lg">
                <FileDown className="w-4 h-4 mr-1" /> Jobs
              </Button>
              <Button variant="outline" onClick={() => handleExport("inspections")} disabled={exporting} className="min-h-[44px] rounded-lg">
                <FileDown className="w-4 h-4 mr-1" /> Inspections
              </Button>
              <Button variant="outline" onClick={() => handleExport("expenses")} disabled={exporting} className="min-h-[44px] rounded-lg">
                <FileDown className="w-4 h-4 mr-1" /> Expenses
              </Button>
            </div>
          </section>
        </RoleScope>
      </div>

      <BottomNav />
    </div>
  );
};
