import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Truck, CheckCircle, AlertTriangle, Receipt, Clock, FileDown } from "lucide-react";
import { exportJobsCsv, exportInspectionsCsv } from "@/lib/export";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { getAllPendingUploads } from "@/lib/pendingUploads";

function useAdminStats() {
  return useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      const weekStart = monday.toISOString().slice(0, 10);

      const [activeRes, completedTodayRes, completedWeekRes, expWeekRes, pendingUploads] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .in("status", ["ready_for_pickup", "pickup_in_progress", "pickup_complete", "in_transit", "delivery_in_progress"]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .not("completed_at", "is", null).gte("completed_at", `${todayStr}T00:00:00`),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .not("completed_at", "is", null).gte("completed_at", `${weekStart}T00:00:00`),
        supabase.from("expenses").select("amount").gte("date", weekStart),
        getAllPendingUploads(),
      ]);

      const weekExpenses = (expWeekRes.data ?? []).reduce((s, e: any) => s + Number(e.amount), 0);
      const pending = pendingUploads.filter(u => u.status === "pending" || u.status === "failed").length;

      return {
        jobsInProgress: activeRes.count ?? 0,
        completedToday: completedTodayRes.count ?? 0,
        completedWeek: completedWeekRes.count ?? 0,
        pendingUploads: pending,
        weekExpenses,
      };
    },
    staleTime: 30_000,
  });
}

export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useAdminStats();
  const [exporting, setExporting] = useState(false);

  const handleExport = async (type: "jobs" | "inspections" | "expenses") => {
    setExporting(true);
    try {
      if (type === "jobs") await exportJobsCsv();
      else if (type === "inspections") await exportInspectionsCsv();
      else await exportExpensesCsv();
      toast({ title: "Exported", description: `${type} CSV downloaded.` });
    } catch (e: unknown) {
      toast({ title: "Export failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const Widget = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) => (
    <Card className="p-4 flex items-center gap-3">
      <div className={`p-2 rounded-lg ${color ?? "bg-primary/10 text-primary"}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-foreground">{isLoading ? "…" : value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Admin Dashboard" showBack onBack={() => navigate("/")} />
      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Widget icon={<Truck className="h-5 w-5" />} label="Jobs In Progress" value={stats?.jobsInProgress ?? 0} />
          <Widget icon={<CheckCircle className="h-5 w-5" />} label="Completed Today" value={stats?.completedToday ?? 0} color="bg-success/10 text-success" />
          <Widget icon={<Clock className="h-5 w-5" />} label="Completed This Week" value={stats?.completedWeek ?? 0} color="bg-info/10 text-info" />
          <Widget icon={<AlertTriangle className="h-5 w-5" />} label="Pending Uploads" value={stats?.pendingUploads ?? 0} color="bg-warning/10 text-warning" />
          <Widget icon={<Receipt className="h-5 w-5" />} label="Expenses This Week" value={`£${(stats?.weekExpenses ?? 0).toFixed(2)}`} />
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => navigate("/jobs")}>All Jobs</Button>
            <Button variant="outline" onClick={() => navigate("/expenses")}>All Expenses</Button>
            <Button variant="outline" onClick={() => navigate("/admin/timesheets")}>Timesheets</Button>
            <Button variant="outline" onClick={() => navigate("/pending-uploads")}>Pending Uploads</Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Exports</h3>
          <div className="grid grid-cols-3 gap-3">
            <Button variant="outline" onClick={() => handleExport("jobs")} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-1" /> Jobs
            </Button>
            <Button variant="outline" onClick={() => handleExport("inspections")} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-1" /> Inspections
            </Button>
            <Button variant="outline" onClick={() => handleExport("expenses")} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-1" /> Expenses
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
