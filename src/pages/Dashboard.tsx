import { AppHeader } from "@/components/AppHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { BottomNav } from "@/components/BottomNav";
import { Truck, Clock, AlertTriangle, Download, FileDown, Receipt, ShieldCheck, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardCounts } from "@/hooks/useJobs";
import { toast } from "@/hooks/use-toast";
import { exportJobsCsv, exportInspectionsCsv } from "@/lib/export";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { pushToSheet, pullFromSheet } from "@/lib/sheetSyncApi";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { data: counts, isLoading } = useDashboardCounts();
  const { isAdmin } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const qc = useQueryClient();

  const handleExport = async (type: 'jobs' | 'inspections' | 'expenses') => {
    setExporting(true);
    try {
      if (type === 'jobs') await exportJobsCsv();
      else if (type === 'inspections') await exportInspectionsCsv();
      else await exportExpensesCsv();
      toast({ title: "Exported." });
    } catch {
      toast({ title: "Export failed. Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadJobs = async () => {
    setSyncing(true);
    try {
      try {
        await pushToSheet();
      } catch (pushErr: unknown) {
        console.warn("Push phase warning:", pushErr);
      }
      await pullFromSheet();
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
      toast({ title: "Jobs updated." });
    } catch {
      toast({ title: "Sync failed. Please try again.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Dashboard" />

      <div className="p-4 space-y-6 max-w-lg mx-auto">
        {/* Workflows */}
        <section>
          <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Workflows</h2>
          {isLoading ? (
            <DashboardSkeleton />
          ) : (
            <div className="space-y-3">
              <DashboardCard
                icon={<Truck className="w-6 h-6 stroke-[2]" />}
                title="My Jobs"
                subtitle="View your current jobs"
                count={counts?.myJobs ?? 0}
                onClick={() => navigate('/jobs')}
              />
              <DashboardCard
                icon={<Clock className="w-6 h-6 stroke-[2]" />}
                title="Last 14 Days"
                subtitle="Completed jobs within the last 2 weeks"
                count={counts?.completedLast14Days ?? 0}
                onClick={() => navigate('/jobs/completed')}
              />
              <DashboardCard
                icon={<AlertTriangle className="w-6 h-6 stroke-[2]" />}
                title="Pending Uploads"
                subtitle="Photos awaiting upload"
                count={counts?.pendingUploads ?? 0}
                onClick={() => navigate('/pending-uploads')}
                iconClassName="bg-warning/10 text-warning"
              />
            </div>
          )}
        </section>

        {/* Utilities */}
        <section>
          <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Utilities</h2>
          <div className="space-y-3">
            <DashboardCard
              icon={syncing ? <Loader2 className="w-6 h-6 stroke-[2] animate-spin" /> : <Download className="w-6 h-6 stroke-[2]" />}
              title="Download Jobs"
              subtitle={syncing ? "Syncing jobs…" : "Refresh and sync your jobs"}
              onClick={syncing ? undefined : handleDownloadJobs}
            />
            {isAdmin && (
              <DashboardCard
                icon={<ShieldCheck className="w-6 h-6 stroke-[2]" />}
                title="Admin Dashboard"
                subtitle="Stats, timesheets & management"
                onClick={() => navigate('/admin')}
                iconClassName="bg-accent/10 text-accent"
              />
            )}
          </div>
        </section>

        {/* Account */}
        <section>
          <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Account</h2>
          <div className="space-y-3">
            <DashboardCard
              icon={<Receipt className="w-6 h-6 stroke-[2]" />}
              title="Expenses"
              subtitle="Log and view your expenses"
              onClick={() => navigate('/expenses')}
            />
          </div>
        </section>

        {/* Exports */}
        <section>
          <h2 className="text-[14px] font-semibold text-muted-foreground mb-3">Exports</h2>
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={() => handleExport('jobs')}
              disabled={exporting}
              className="min-h-[44px] rounded-lg"
            >
              <FileDown className="w-4 h-4 mr-1" /> Jobs
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('inspections')}
              disabled={exporting}
              className="min-h-[44px] rounded-lg"
            >
              <FileDown className="w-4 h-4 mr-1" /> Inspections
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('expenses')}
              disabled={exporting}
              className="min-h-[44px] rounded-lg"
            >
              <FileDown className="w-4 h-4 mr-1" /> Expenses
            </Button>
          </div>
        </section>
      </div>

      <BottomNav />
    </div>
  );
};
