import { AppHeader } from "@/components/AppHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { Truck, Clock, AlertTriangle, Download, FileDown, Receipt, ShieldCheck, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardCounts } from "@/hooks/useJobs";
import { toast } from "@/hooks/use-toast";
import { exportJobsCsv, exportInspectionsCsv } from "@/lib/export";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { pullFromSheet } from "@/lib/sheetSyncApi";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { data: counts, isLoading } = useDashboardCounts();
  const { isAdmin } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const qc = useQueryClient();

  const handleExport = async (type: 'jobs' | 'inspections' | 'expenses') => {
    setExporting(true);
    try {
      if (type === 'jobs') await exportJobsCsv();
      else if (type === 'inspections') await exportInspectionsCsv();
      else await exportExpensesCsv();
      toast({ title: 'Exported', description: `${type} CSV downloaded.` });
    } catch (e: unknown) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadJobs = async () => {
    setPulling(true);
    try {
      const result = await pullFromSheet();
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
      toast({
        title: 'Jobs Downloaded',
        description: `${result.rows_created} new, ${result.rows_skipped} skipped, ${result.errors?.length ?? 0} errors.`,
      });
    } catch (e: unknown) {
      toast({ title: 'Download failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="AXENTRA" />
      
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <DashboardCard
          icon={<Truck className="h-6 w-6" />}
          title="My Jobs"
          subtitle="View your current jobs"
          count={isLoading ? undefined : counts?.myJobs ?? 0}
          onClick={() => navigate('/jobs')}
        />
        
        <DashboardCard
          icon={<Clock className="h-6 w-6" />}
          title="Last 14 days"
          subtitle="Completed jobs within the last 2 weeks"
          count={isLoading ? undefined : counts?.completedLast14Days ?? 0}
          onClick={() => navigate('/jobs/completed')}
        />
        
        <DashboardCard
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Pending Uploads"
          subtitle="Photos awaiting upload"
          count={isLoading ? undefined : counts?.pendingUploads ?? 0}
          onClick={() => navigate('/pending-uploads')}
        />

        <DashboardCard
          icon={<Receipt className="h-6 w-6" />}
          title="Expenses"
          subtitle="Log and view your expenses"
          onClick={() => navigate('/expenses')}
        />
        
        <DashboardCard
          icon={pulling ? <Loader2 className="h-6 w-6 animate-spin" /> : <Download className="h-6 w-6" />}
          title="Download Jobs"
          subtitle={pulling ? "Pulling from Job Entry…" : "Import new jobs from Google Sheet"}
          onClick={pulling ? undefined : handleDownloadJobs}
        />

        {isAdmin && (
          <DashboardCard
            icon={<ShieldCheck className="h-6 w-6" />}
            title="Admin Dashboard"
            subtitle="Stats, timesheets & management"
            onClick={() => navigate('/admin')}
          />
        )}

        <div className="pt-2 space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Exports</h3>
          <div className="grid grid-cols-3 gap-3">
            <Button variant="outline" onClick={() => handleExport('jobs')} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-1" /> Jobs
            </Button>
            <Button variant="outline" onClick={() => handleExport('inspections')} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-1" /> Inspections
            </Button>
            <Button variant="outline" onClick={() => handleExport('expenses')} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-1" /> Expenses
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
