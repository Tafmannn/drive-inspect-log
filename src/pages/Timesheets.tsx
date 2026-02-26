import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileDown } from "lucide-react";
import { useState } from "react";

interface TimesheetDay {
  date: string;
  firstActivity: string;
  lastActivity: string;
  totalJobs: number;
  totalMileage: number;
  totalExpenses: number;
}

function useTimesheetData(days: number) {
  return useQuery({
    queryKey: ["timesheets", days],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString();

      // Get activity logs for time range
      const { data: logs } = await supabase
        .from("job_activity_log")
        .select("job_id, created_at")
        .gte("created_at", sinceStr)
        .order("created_at", { ascending: true });

      // Get inspections for mileage
      const { data: inspections } = await supabase
        .from("inspections")
        .select("job_id, type, odometer, inspected_at")
        .gte("created_at", sinceStr);

      // Get expenses
      const { data: expenses } = await supabase
        .from("expenses")
        .select("date, amount")
        .gte("date", since.toISOString().slice(0, 10));

      // Group by date
      const dayMap: Record<string, TimesheetDay> = {};

      for (const log of logs ?? []) {
        const date = new Date(log.created_at).toISOString().slice(0, 10);
        if (!dayMap[date]) {
          dayMap[date] = { date, firstActivity: log.created_at, lastActivity: log.created_at, totalJobs: 0, totalMileage: 0, totalExpenses: 0 };
        }
        if (log.created_at < dayMap[date].firstActivity) dayMap[date].firstActivity = log.created_at;
        if (log.created_at > dayMap[date].lastActivity) dayMap[date].lastActivity = log.created_at;
      }

      // Count unique jobs per day
      const jobsByDay: Record<string, Set<string>> = {};
      for (const log of logs ?? []) {
        const date = new Date(log.created_at).toISOString().slice(0, 10);
        if (!jobsByDay[date]) jobsByDay[date] = new Set();
        jobsByDay[date].add(log.job_id);
      }
      for (const [date, jobs] of Object.entries(jobsByDay)) {
        if (dayMap[date]) dayMap[date].totalJobs = jobs.size;
      }

      // Calculate mileage per job per day
      const inspByJob: Record<string, { pickup?: number; delivery?: number; date?: string }> = {};
      for (const insp of inspections ?? []) {
        if (!inspByJob[insp.job_id]) inspByJob[insp.job_id] = {};
        if (insp.type === "pickup" && insp.odometer != null) {
          inspByJob[insp.job_id].pickup = insp.odometer;
          inspByJob[insp.job_id].date = insp.inspected_at?.slice(0, 10) ?? undefined;
        }
        if (insp.type === "delivery" && insp.odometer != null) {
          inspByJob[insp.job_id].delivery = insp.odometer;
        }
      }
      for (const info of Object.values(inspByJob)) {
        if (info.pickup != null && info.delivery != null && info.date && dayMap[info.date]) {
          dayMap[info.date].totalMileage += Math.max(0, info.delivery - info.pickup);
        }
      }

      // Expenses per day
      for (const exp of expenses ?? []) {
        const date = exp.date;
        if (dayMap[date]) {
          dayMap[date].totalExpenses += Number(exp.amount);
        } else {
          dayMap[date] = { date, firstActivity: "", lastActivity: "", totalJobs: 0, totalMileage: 0, totalExpenses: Number(exp.amount) };
        }
      }

      return Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date));
    },
    staleTime: 60_000,
  });
}

function formatTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" });
}

export const Timesheets = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState(7);
  const { data: rows, isLoading } = useTimesheetData(range);

  const totalMileage = rows?.reduce((s, r) => s + r.totalMileage, 0) ?? 0;
  const totalJobs = rows?.reduce((s, r) => s + r.totalJobs, 0) ?? 0;
  const totalExpenses = rows?.reduce((s, r) => s + r.totalExpenses, 0) ?? 0;

  const exportCsv = () => {
    if (!rows) return;
    const headers = ["Date", "Start", "End", "Jobs", "Mileage", "Expenses (£)"];
    const csvRows = rows.map(r => [
      r.date, formatTime(r.firstActivity), formatTime(r.lastActivity),
      String(r.totalJobs), String(r.totalMileage), r.totalExpenses.toFixed(2),
    ].join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `axentra-timesheet-${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Timesheets" showBack onBack={() => navigate("/admin")}>
        <Button size="sm" variant="ghost" onClick={exportCsv}>
          <FileDown className="h-4 w-4 mr-1" /> CSV
        </Button>
      </AppHeader>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="flex gap-2">
          {[7, 14, 30].map(d => (
            <Button key={d} size="sm" variant={range === d ? "default" : "outline"} onClick={() => setRange(d)}>
              {d} days
            </Button>
          ))}
        </div>

        {/* Summary */}
        <Card className="p-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xl font-bold text-foreground">{totalJobs}</p>
              <p className="text-xs text-muted-foreground">Total Jobs</p>
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">{totalMileage.toLocaleString("en-GB")}</p>
              <p className="text-xs text-muted-foreground">Miles</p>
            </div>
            <div>
              <p className="text-xl font-bold text-foreground">£{totalExpenses.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Expenses</p>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : rows && rows.length > 0 ? (
          <div className="space-y-2">
            {rows.map(row => (
              <Card key={row.date} className="p-3">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{formatDate(row.date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(row.firstActivity)} – {formatTime(row.lastActivity)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">{row.totalJobs} jobs • {row.totalMileage} mi</p>
                    <p className="text-xs text-muted-foreground">£{row.totalExpenses.toFixed(2)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">No activity in this period</p>
        )}
      </div>
    </div>
  );
};
