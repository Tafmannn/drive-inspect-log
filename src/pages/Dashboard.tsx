import { AppHeader } from "@/components/AppHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { Truck, Clock, AlertTriangle, Download, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardCounts } from "@/hooks/useJobs";
import { toast } from "@/hooks/use-toast";

export const Dashboard = () => {
  const navigate = useNavigate();
  const { data: counts, isLoading } = useDashboardCounts();

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
      </div>
    </div>
  );
};
