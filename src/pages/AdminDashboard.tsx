import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Truck, CheckCircle, AlertTriangle, Receipt, Clock, FileDown,
  Eye, Edit, Archive, RotateCcw, Settings, Users, BarChart3, Sheet
} from "lucide-react";
import { GoogleSheetsPanel } from "@/components/GoogleSheetsPanel";
import { exportJobsCsv, exportInspectionsCsv } from "@/lib/export";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { toast } from "@/hooks/use-toast";
import { useState } from "react";
import { getAllPendingUploads } from "@/lib/pendingUploads";
import { useAuth } from "@/context/AuthContext";
import type { Job } from "@/lib/types";

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
          .eq("is_hidden", false)
          .in("status", ["ready_for_pickup", "pickup_in_progress", "pickup_complete", "in_transit", "delivery_in_progress"]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .not("completed_at", "is", null).gte("completed_at", `${todayStr}T00:00:00`),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .not("completed_at", "is", null).gte("completed_at", `${weekStart}T00:00:00`),
        supabase.from("expenses").select("amount").eq("is_hidden", false).gte("date", weekStart),
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

function useAllJobs(showArchived: boolean) {
  return useQuery({
    queryKey: ["admin-jobs", showArchived],
    queryFn: async () => {
      const query = supabase.from("jobs").select("*").order("created_at", { ascending: false });
      if (showArchived) {
        query.eq("is_hidden", true);
      } else {
        query.eq("is_hidden", false);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Job[];
    },
  });
}

function useAllExpenses(showArchived: boolean) {
  return useQuery({
    queryKey: ["admin-expenses", showArchived],
    queryFn: async () => {
      const query = supabase.from("expenses").select("*, jobs(vehicle_reg, external_job_number)").order("date", { ascending: false });
      if (showArchived) {
        query.eq("is_hidden", true);
      } else {
        query.eq("is_hidden", false);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ─── Overview Tab ─────────────────────────────────────────────────────
function OverviewTab() {
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Widget icon={<Truck className="h-5 w-5" />} label="Jobs In Progress" value={stats?.jobsInProgress ?? 0} />
        <Widget icon={<CheckCircle className="h-5 w-5" />} label="Completed Today" value={stats?.completedToday ?? 0} color="bg-success/10 text-success" />
        <Widget icon={<Clock className="h-5 w-5" />} label="Completed This Week" value={stats?.completedWeek ?? 0} color="bg-info/10 text-info" />
        <Widget icon={<AlertTriangle className="h-5 w-5" />} label="Pending Uploads" value={stats?.pendingUploads ?? 0} color="bg-warning/10 text-warning" />
        <Widget icon={<Receipt className="h-5 w-5" />} label="Expenses This Week" value={`£${(stats?.weekExpenses ?? 0).toFixed(2)}`} />
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
  );
}

// ─── Jobs Tab ──────────────────────────────────────────────────────
function JobsTab({ archived = false }: { archived?: boolean }) {
  const navigate = useNavigate();
  const { data: jobs, isLoading } = useAllJobs(archived);
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();

  const toggleHide = useMutation({
    mutationFn: async ({ jobId, hide }: { jobId: string; hide: boolean }) => {
      const { error } = await supabase.from("jobs").update({ is_hidden: hide } as any).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: archived ? "Job restored" : "Job archived" });
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (!jobs?.length) return <p className="text-muted-foreground text-center py-8">No {archived ? "archived" : ""} jobs found.</p>;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ref</TableHead>
            <TableHead>Reg</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="font-medium">{job.external_job_number || job.id.slice(0, 8)}</TableCell>
              <TableCell>{job.vehicle_reg}</TableCell>
              <TableCell><Badge variant="outline" className="text-xs">{job.status.replace(/_/g, " ")}</Badge></TableCell>
              <TableCell className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right space-x-1">
                <Button size="icon" variant="ghost" onClick={() => navigate(`/jobs/${job.id}`)} title="View">
                  <Eye className="h-4 w-4" />
                </Button>
                {!archived && (
                  <>
                    <Button size="icon" variant="ghost" onClick={() => navigate(`/jobs/${job.id}/edit`)} title="Edit">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => toggleHide.mutate({ jobId: job.id, hide: true })} title="Archive">
                      <Archive className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {archived && (
                  <Button size="icon" variant="ghost" onClick={() => toggleHide.mutate({ jobId: job.id, hide: false })} title="Restore">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Expenses Tab ──────────────────────────────────────────────────
function ExpensesTab({ archived = false }: { archived?: boolean }) {
  const { data: expenses, isLoading } = useAllExpenses(archived);
  const qc = useQueryClient();

  const toggleHide = useMutation({
    mutationFn: async ({ id, hide }: { id: string; hide: boolean }) => {
      const { error } = await supabase.from("expenses").update({ is_hidden: hide } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-expenses"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: archived ? "Expense restored" : "Expense archived" });
    },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!expenses?.length) return <p className="text-muted-foreground text-center py-8">No {archived ? "archived" : ""} expenses.</p>;

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Job</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((exp: any) => (
            <TableRow key={exp.id}>
              <TableCell className="text-xs">{exp.date}</TableCell>
              <TableCell>{exp.category}</TableCell>
              <TableCell>£{Number(exp.amount).toFixed(2)}</TableCell>
              <TableCell className="text-xs">{exp.jobs?.vehicle_reg ?? "—"}</TableCell>
              <TableCell className="text-right">
                {!archived ? (
                  <Button size="icon" variant="ghost" onClick={() => toggleHide.mutate({ id: exp.id, hide: true })} title="Archive">
                    <Archive className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" onClick={() => toggleHide.mutate({ id: exp.id, hide: false })} title="Restore">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Users Tab (stub – ready for auth) ────────────────────────────
function UsersTab() {
  return (
    <div className="text-center py-8 space-y-2">
      <Users className="h-10 w-10 mx-auto text-muted-foreground" />
      <p className="text-muted-foreground">User management will be available when authentication is enabled.</p>
      <p className="text-xs text-muted-foreground">Roles: DRIVER, ADMIN, SUPERADMIN</p>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────
function SettingsTab() {
  const { isSuperAdmin } = useAuth();
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <h4 className="font-semibold text-sm">ETA Notifications</h4>
        <p className="text-xs text-muted-foreground">Configure per-job notification flags on the job edit screen.</p>
      </Card>
      <Card className="p-4 space-y-2">
        <h4 className="font-semibold text-sm">CSV Export</h4>
        <p className="text-xs text-muted-foreground">Exports use UTF-8 BOM encoding, Google Sheets compatible.</p>
      </Card>
      {isSuperAdmin && (
        <Card className="p-4 space-y-2 border-destructive/50">
          <h4 className="font-semibold text-sm text-destructive">SuperAdmin Settings</h4>
          <p className="text-xs text-muted-foreground">Global feature flags and auth configuration will be available here.</p>
        </Card>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────
export const AdminDashboard = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Access Denied" showBack onBack={() => navigate("/")} />
        <p className="text-center py-12 text-muted-foreground">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Admin Dashboard" showBack onBack={() => navigate("/")} />
      <div className="p-4 max-w-4xl mx-auto">
        <Tabs defaultValue="overview">
          <TabsList className="w-full grid grid-cols-4 lg:grid-cols-8 mb-4">
            <TabsTrigger value="overview"><BarChart3 className="h-4 w-4 mr-1 hidden sm:inline" />Overview</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="archived-jobs">Archived</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="archived-expenses" className="hidden lg:flex">Exp. Archive</TabsTrigger>
            <TabsTrigger value="sheets"><Sheet className="h-4 w-4 mr-1 hidden sm:inline" />Sheets</TabsTrigger>
            <TabsTrigger value="timesheets" onClick={() => navigate("/admin/timesheets")}>Timesheets</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="h-4 w-4" /></TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="jobs"><JobsTab /></TabsContent>
          <TabsContent value="archived-jobs"><JobsTab archived /></TabsContent>
          <TabsContent value="expenses"><ExpensesTab /></TabsContent>
          <TabsContent value="archived-expenses"><ExpensesTab archived /></TabsContent>
          <TabsContent value="sheets"><GoogleSheetsPanel /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
