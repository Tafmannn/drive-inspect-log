import { AppHeader } from "@/components/AppHeader";
import { DashboardCard } from "@/components/DashboardCard";
import { Truck, Clock, AlertTriangle, Download } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const Dashboard = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="v1.45.25" />
      
      <div className="p-4 space-y-4">
        <DashboardCard
          icon={<Truck className="h-6 w-6" />}
          title="My Jobs"
          subtitle="View your current jobs"
          count={5}
          onClick={() => navigate('/jobs')}
        />
        
        <DashboardCard
          icon={<Clock className="h-6 w-6" />}
          title="Last 14 days"
          subtitle="Completed jobs within the last 2 weeks"
          count={16}
          onClick={() => navigate('/completed')}
        />
        
        <DashboardCard
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Pending"
          subtitle="View all pending items"
          count={0}
          onClick={() => navigate('/pending')}
        />
        
        <DashboardCard
          icon={<Download className="h-6 w-6" />}
          title="Download Jobs"
          subtitle="Get your latest jobs"
          onClick={() => {
            // Handle job download/sync
            console.log("Downloading jobs...");
          }}
        />
      </div>
    </div>
  );
};