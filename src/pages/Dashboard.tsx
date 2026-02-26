import { AppHeader } from "@/components/AppHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { Truck, Clock, AlertTriangle, Download, FileDown, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardCounts } from "@/hooks/useJobs";
import { toast } from "@/hooks/use-toast";
import { exportJobsCsv, exportInspectionsCsv } from "@/lib/export";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { data: counts, isLoading } = useDashboardCounts();
  const [exporting, setExporting] = useState(false);

  const handleExport = async (type: 'jobs' | 'inspections') => {
    setExporting(true);
    try {
      if (type === 'jobs') await exportJobsCsv();
      else await exportInspectionsCsv();
      toast({ title: 'Exported', description: `${type} CSV downloaded.` });
    } catch (e: unknown) {
      toast({ title: 'Export failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="v1.0.0" />
      
      <div className="p-4 space-y-4">
        <DashboardCard
          icon={<Truck className="h-6 w-6" />}
          title="My Jobs"
          subtitle="View your current jobs"
          count={isLoading ? undefined : counts?.activeJobs ?? 0}
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
          title="Pending"
          subtitle="View all pending items"
          count={isLoading ? undefined : counts?.pending ?? 0}
          onClick={() => navigate('/jobs/pending')}
        />
        
        <DashboardCard
          icon={<Download className="h-6 w-6" />}
          title="Download Jobs"
          subtitle="Get your latest jobs"
          onClick={() => {
            toast({ title: "Sync", description: "Job sync is a stub — connect external source to enable." });
          }}
        />

        <div className="pt-2 space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Exports</h3>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => handleExport('jobs')} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-2" /> Jobs CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport('inspections')} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-2" /> Inspections CSV
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
