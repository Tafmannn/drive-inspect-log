import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { getStatusStyle, ACTIVE_STATUSES } from "@/lib/statusConfig";
import { UKPlate } from "@/components/UKPlate";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Truck, CheckCircle, AlertTriangle, Receipt, Clock, FileDown,
  Eye, Edit, Archive, RotateCcw, Settings, Users, BarChart3, Sheet, Search, HardDrive, Bell
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { GoogleSheetsPanel } from "@/components/GoogleSheetsPanel";
import { AdminPendingUploads } from "@/components/AdminPendingUploads";
import { AttentionCenter } from "@/features/attention/components/AttentionCenter";
import { exportJobsCsv, exportInspectionsCsv } from "@/lib/export";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
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
          .in("status", ACTIVE_STATUSES as string[]),
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
      toast({ title: "Exported." });
    } catch {
      toast({ title: "Export failed. Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const Widget = ({ icon, label, value, iconClass }: { icon: React.ReactNode; label: string; value: string | number; iconClass?: string }) => (
    <div className="p-4 rounded-xl bg-card border border-border shadow-sm flex items-center gap-3">
      <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${iconClass ?? "bg-primary/10 text-primary"}`}>{icon}</div>
      <div>
        <p className="text-[20px] font-semibold text-foreground">{isLoading ? "…" : value}</p>
        <p className="text-[13px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Widget icon={<Truck className="w-5 h-5 stroke-[2]" />} label="Jobs In Progress" value={stats?.jobsInProgress ?? 0} />
        <Widget icon={<CheckCircle className="w-5 h-5 stroke-[2]" />} label="Completed Today" value={stats?.completedToday ?? 0} iconClass="bg-success/10 text-success" />
        <Widget icon={<Clock className="w-5 h-5 stroke-[2]" />} label="Completed This Week" value={stats?.completedWeek ?? 0} iconClass="bg-info/10 text-info" />
        <Widget icon={<AlertTriangle className="w-5 h-5 stroke-[2]" />} label="Pending Uploads" value={stats?.pendingUploads ?? 0} iconClass="bg-warning/10 text-warning" />
        <Widget icon={<Receipt className="w-5 h-5 stroke-[2]" />} label="Expenses This Week" value={`£${(stats?.weekExpenses ?? 0).toFixed(2)}`} />
      </div>

      <Separator />
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
  );
}

// ─── Jobs Tab ──────────────────────────────────────────────────────
function JobsTab({ archived = false }: { archived?: boolean }) {
  const navigate = useNavigate();
  const { data: jobs, isLoading } = useAllJobs(archived);
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      setSearchQuery(custom.detail ?? "");
    };
    document.addEventListener("admin-search", handler as EventListener);
    return () => document.removeEventListener("admin-search", handler as EventListener);
  }, []);

  const toggleHide = useMutation({
    mutationFn: async ({ jobId, hide }: { jobId: string; hide: boolean }) => {
      const { error } = await supabase.from("jobs").update({ is_hidden: hide } as any).eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-jobs"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
      toast({ title: archived ? "Job restored." : "Job archived." });
    },
  });

  if (isLoading) return <DashboardSkeleton />;

  const filteredJobs = (jobs ?? []).filter((job) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (job.client_name ?? "").toLowerCase().includes(q) ||
      (job.vehicle_reg ?? "").toLowerCase().includes(q) ||
      (job.external_job_number ?? "").toLowerCase().includes(q) ||
      (job.sheet_job_id ?? "").toLowerCase().includes(q) ||
      (job.pickup_city ?? "").toLowerCase().includes(q) ||
      (job.pickup_postcode ?? "").toLowerCase().includes(q) ||
      (job.delivery_city ?? "").toLowerCase().includes(q) ||
      (job.delivery_postcode ?? "").toLowerCase().includes(q)
    );
  });

  if (!filteredJobs.length) return <p className="text-[14px] text-muted-foreground text-center py-8">No {archived ? "archived" : ""} jobs found.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[13px]">Job ID</TableHead>
            <TableHead className="text-[13px]">Reg</TableHead>
            <TableHead className="text-[13px]">Status</TableHead>
            <TableHead className="text-[13px]">Created</TableHead>
            <TableHead className="text-[13px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredJobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="text-[14px] font-medium">Job {job.external_job_number || job.id.slice(0, 8)}</TableCell>
              <TableCell><UKPlate reg={job.vehicle_reg} /></TableCell>
              <TableCell>
                {(() => {
                  const s = getStatusStyle(job.status);
                  return (
                    <span
                      style={{ backgroundColor: s.backgroundColor, color: s.color }}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold uppercase leading-none"
                    >
                      {s.label}
                    </span>
                  );
                })()}
              </TableCell>
              <TableCell className="text-[13px] text-muted-foreground">{new Date(job.created_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right space-x-1">
                <Button size="icon" variant="ghost" onClick={() => navigate(`/jobs/${job.id}`)} title="View" className="min-h-[44px] min-w-[44px]">
                  <Eye className="w-5 h-5 stroke-[2]" />
                </Button>
                {!archived && (
                  <>
                    <Button size="icon" variant="ghost" onClick={() => navigate(`/jobs/${job.id}/edit`)} title="Edit" className="min-h-[44px] min-w-[44px]">
                      <Edit className="w-5 h-5 stroke-[2]" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => toggleHide.mutate({ jobId: job.id, hide: true })} title="Archive" className="min-h-[44px] min-w-[44px]">
                      <Archive className="w-5 h-5 stroke-[2]" />
                    </Button>
                  </>
                )}
                {archived && (
                  <Button size="icon" variant="ghost" onClick={() => toggleHide.mutate({ jobId: job.id, hide: false })} title="Restore" className="min-h-[44px] min-w-[44px]">
                    <RotateCcw className="w-5 h-5 stroke-[2]" />
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
      toast({ title: archived ? "Expense restored." : "Expense archived." });
    },
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!expenses?.length) return <p className="text-[14px] text-muted-foreground text-center py-8">No {archived ? "archived" : ""} expenses.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-[13px]">Date</TableHead>
            <TableHead className="text-[13px]">Category</TableHead>
            <TableHead className="text-[13px]">Amount</TableHead>
            <TableHead className="text-[13px]">Job</TableHead>
            <TableHead className="text-[13px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {expenses.map((exp: any) => (
            <TableRow key={exp.id}>
              <TableCell className="text-[13px]">{exp.date}</TableCell>
              <TableCell className="text-[14px]">{exp.category}</TableCell>
              <TableCell className="text-[14px]">£{Number(exp.amount).toFixed(2)}</TableCell>
              <TableCell className="text-[13px]">{exp.jobs?.vehicle_reg ?? "—"}</TableCell>
              <TableCell className="text-right">
                {!archived ? (
                  <Button size="icon" variant="ghost" onClick={() => toggleHide.mutate({ id: exp.id, hide: true })} title="Archive" className="min-h-[44px] min-w-[44px]">
                    <Archive className="w-5 h-5 stroke-[2]" />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" onClick={() => toggleHide.mutate({ id: exp.id, hide: false })} title="Restore" className="min-h-[44px] min-w-[44px]">
                    <RotateCcw className="w-5 h-5 stroke-[2]" />
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

// ─── Users Tab ────────────────────────────────────────────────────
function UsersTab() {
  const navigate = useNavigate();
  const { authEnabled } = useAuth();

  if (authEnabled) {
    return (
      <div className="text-center py-8 space-y-3">
        <Users className="w-10 h-10 mx-auto text-muted-foreground stroke-[2]" />
        <p className="text-[14px] text-muted-foreground">Manage your organisation's users.</p>
        <Button variant="outline" onClick={() => navigate("/admin/users")} className="min-h-[44px]">
          <Users className="w-4 h-4 mr-1" /> Open User Management
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center py-8 space-y-2">
      <Users className="w-10 h-10 mx-auto text-muted-foreground stroke-[2]" />
      <p className="text-[14px] text-muted-foreground">User management requires authentication to be enabled.</p>
      <p className="text-[13px] text-muted-foreground">Set <code className="bg-muted px-1 rounded text-xs">VITE_ENABLE_AUTH=true</code> to enable.</p>
      <p className="text-[13px] text-muted-foreground">Roles: DRIVER, ADMIN, SUPERADMIN</p>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────
function SettingsTab() {
  const { isSuperAdmin } = useAuth();
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-2">
        <h4 className="text-[16px] font-medium text-foreground">ETA Notifications</h4>
        <p className="text-[13px] text-muted-foreground">Configure per-job notification flags on the job edit screen.</p>
      </div>
      <div className="p-4 rounded-xl bg-card border border-border shadow-sm space-y-2">
        <h4 className="text-[16px] font-medium text-foreground">CSV Export</h4>
        <p className="text-[13px] text-muted-foreground">Exports use UTF-8 BOM encoding, Google Sheets compatible.</p>
      </div>
      {isSuperAdmin && (
        <div className="p-4 rounded-xl bg-card border border-destructive/50 shadow-sm space-y-2">
          <h4 className="text-[16px] font-medium text-destructive">SuperAdmin Settings</h4>
          <p className="text-[13px] text-muted-foreground">Global feature flags and auth configuration will be available here.</p>
        </div>
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
      <div className="min-h-screen bg-background pb-20">
        <AppHeader title="Access Denied" showBack onBack={() => navigate("/")} />
        <p className="text-center py-12 text-[14px] text-muted-foreground">You do not have permission to access this page.</p>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Admin Dashboard" showBack onBack={() => navigate("/")} />
      <div className="p-4 max-w-4xl mx-auto">
        {/* Global search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground stroke-[2]" />
          <Input
            placeholder="Search jobs by reg, ref, client, postcode…"
            className="pl-10 min-h-[44px] rounded-lg"
            onChange={(e) => {
              const q = e.target.value.toLowerCase().trim();
              const url = new URL(window.location.href);
              if (q) url.searchParams.set("q", q);
              else url.searchParams.delete("q");
              window.history.replaceState({}, "", url.toString());
              document.dispatchEvent(new CustomEvent("admin-search", { detail: q }));
            }}
          />
        </div>
        <Tabs defaultValue="overview">
          <TabsList className="w-full grid grid-cols-4 lg:grid-cols-9 mb-4">
            <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />Overview</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="archived-jobs">Archived</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
            <TabsTrigger value="archived-expenses" className="hidden lg:flex">Exp. Archive</TabsTrigger>
            <TabsTrigger value="pending-uploads"><HardDrive className="w-4 h-4 mr-1 hidden sm:inline" />Uploads</TabsTrigger>
            <TabsTrigger value="sheets"><Sheet className="w-4 h-4 mr-1 hidden sm:inline" />Sheets</TabsTrigger>
            <TabsTrigger value="timesheets" onClick={() => navigate("/admin/timesheets")}>Timesheets</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-4 h-4" /></TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="jobs"><JobsTab /></TabsContent>
          <TabsContent value="archived-jobs"><JobsTab archived /></TabsContent>
          <TabsContent value="expenses"><ExpensesTab /></TabsContent>
          <TabsContent value="archived-expenses"><ExpensesTab archived /></TabsContent>
          <TabsContent value="pending-uploads"><AdminPendingUploads /></TabsContent>
          <TabsContent value="sheets"><GoogleSheetsPanel /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="settings"><SettingsTab /></TabsContent>
        </Tabs>
      </div>
      <BottomNav />
    </div>
  );
};
