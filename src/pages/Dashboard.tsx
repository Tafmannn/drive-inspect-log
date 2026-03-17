/**
 * Phase 5 — Driver Dashboard
 * Execution launcher: Workflow → Utilities → Management → Exports
 */

import { AppHeader } from "@/components/AppHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import {
  Truck, Clock, AlertTriangle, Download, FileDown,
  Receipt, ShieldCheck, Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardCounts } from "@/hooks/useJobs";
import { toast } from "@/hooks/use-toast";
import { exportJobsCsv, exportInspectionsCsv } from "@/lib/export";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { pushToSheet, pullFromSheet } from "@/lib/sheetSyncApi";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { data: counts, isLoading } = useDashboardCounts();
  const { isAdmin, isSuperAdmin } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const qc = useQueryClient();

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

  const handleDownloadJobs = async () => {
    setSyncing(true);
    try {
      try { await pushToSheet(); } catch (e) { console.warn("Push phase warning:", e); }
      await pullFromSheet();
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
      toast({ title: "Jobs updated." });
    } catch {
      toast({ title: "Sync failed.", variant: "destructive" });
    } finally {
      setSyncing(false);
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

        {/* ── Utilities ───────────────────────────────────── */}
        <section>
          <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Utilities</h2>
          <div className="space-y-3">
            <DashboardCard
              icon={syncing ? <Loader2 className="w-6 h-6 stroke-[2] animate-spin" /> : <Download className="w-6 h-6 stroke-[2]" />}
              title="Download Jobs"
              subtitle={syncing ? "Syncing jobs…" : "Refresh and sync your jobs"}
              onClick={syncing ? undefined : handleDownloadJobs}
            />
            <DashboardCard
              icon={<Receipt className="w-6 h-6 stroke-[2]" />}
              title="Expenses"
              subtitle="Log and view your expenses"
              onClick={() => navigate("/expenses")}
            />
          </div>
        </section>

        {/* ── Management (role-gated) ─────────────────────── */}
        {(isAdmin || isSuperAdmin) && (
          <section>
            <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Management</h2>
            <div className="space-y-3">
              {isAdmin && (
                <DashboardCard
                  icon={<ShieldCheck className="w-6 h-6 stroke-[2]" />}
                  title="Admin Dashboard"
                  subtitle="Dispatch, queues & interventions"
                  onClick={() => navigate("/admin")}
                  iconClassName="bg-accent/10 text-accent"
                />
              )}
              {isSuperAdmin && (
                <DashboardCard
                  icon={<ShieldCheck className="w-6 h-6 stroke-[2]" />}
                  title="Super Admin"
                  subtitle="Global control centre"
                  onClick={() => navigate("/super-admin")}
                  iconClassName="bg-destructive/10 text-destructive"
                />
              )}
            </div>
          </section>
        )}

        {/* ── Exports ─────────────────────────────────────── */}
        <section>
          <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Exports</h2>
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
      </div>

      <BottomNav />
    </div>
  );
};
