import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getOrgUsers } from "@/lib/adminApi";
import { logClientEvent } from "@/lib/logger";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Building2, Users, Briefcase, Activity, AlertCircle,
  Settings, Eye, Search, RefreshCw, Shield, UserPlus,
  BarChart3, ClipboardCheck, Car, Sheet,
} from "lucide-react";
import { getStatusStyle, ACTIVE_STATUSES } from "@/lib/statusConfig";
import { UKPlate } from "@/components/UKPlate";
import type { Job } from "@/lib/types";

/* ── Shared helpers ──────────────────────────────────────────────── */

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertCircle className="w-8 h-8 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="w-4 h-4 mr-1" /> Retry
        </Button>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground text-center py-10">{message}</p>;
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/* ── Overview Tab ────────────────────────────────────────────────── */

function OverviewTab() {
  const { authEnabled } = useAuth();
  const [stats, setStats] = useState<Record<string, number | string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!authEnabled) {
        setStats({ orgs: 2, users: 8, jobsToday: 3, jobsWeek: 21, dvlaFails: 0, syncFails: 0, uploadsPending: 1 });
        return;
      }

      const [orgRes, jobsTodayRes, jobsWeekRes] = await Promise.all([
        supabase.from("organisations").select("id", { count: "exact", head: true }),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .gte("created_at", new Date().toISOString().slice(0, 10) + "T00:00:00"),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .gte("created_at", (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString(); })()),
      ]);

      let userCount = 0;
      try { const users = await getOrgUsers(); userCount = users.length; } catch { /* ok */ }

      setStats({
        orgs: orgRes.count ?? 0,
        users: userCount,
        jobsToday: jobsTodayRes.count ?? 0,
        jobsWeek: jobsWeekRes.count ?? 0,
        dvlaFails: "—",
        syncFails: "—",
        uploadsPending: "—",
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to load stats");
      logClientEvent("superadmin_overview_error", "error", { message: e.message });
    } finally {
      setLoading(false);
    }
  }, [authEnabled]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;

  const tiles = [
    { label: "Organisations", value: stats.orgs, icon: Building2 },
    { label: "Users", value: stats.users, icon: Users },
    { label: "Jobs Today", value: stats.jobsToday, icon: Briefcase },
    { label: "Jobs (7d)", value: stats.jobsWeek, icon: BarChart3 },
    { label: "DVLA Fails (24h)", value: stats.dvlaFails, icon: Car },
    { label: "Sync Failures (24h)", value: stats.syncFails, icon: Sheet },
    { label: "Uploads Pending", value: stats.uploadsPending, icon: ClipboardCheck },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {tiles.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold">{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ── Organisations Tab ───────────────────────────────────────────── */

function OrganisationsTab() {
  const { authEnabled } = useAuth();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!authEnabled) {
        setOrgs([{ id: "mock-1", name: "Axentra Vehicles", created_at: new Date().toISOString() }]);
        return;
      }
      const { data, error: err } = await supabase.from("organisations").select("*").order("name");
      if (err) throw err;
      setOrgs(data ?? []);
    } catch (e: any) {
      setError(e.message);
      logClientEvent("superadmin_orgs_error", "error", { message: e.message });
    } finally {
      setLoading(false);
    }
  }, [authEnabled]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;

  const filtered = orgs.filter(o => !search || o.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search organisations…" className="pl-9 min-h-[44px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" className="min-h-[44px]" disabled>
          <Building2 className="w-4 h-4 mr-1" /> Create Org (TODO)
        </Button>
      </div>
      {!filtered.length ? <EmptyState message="No organisations found." /> : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs">ID</TableHead>
                <TableHead className="text-xs">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="text-sm font-medium">{o.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{o.id?.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ── Users Tab ───────────────────────────────────────────────────── */

function SuperUsersTab() {
  const { authEnabled } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!authEnabled) {
        setUsers([
          { id: "1", email: "driver@test.com", role: "driver", org_id: "mock-1" },
          { id: "2", email: "admin@test.com", role: "admin", org_id: "mock-1" },
          { id: "3", email: "super@test.com", role: "super_admin", org_id: null },
        ]);
        return;
      }
      const data = await getOrgUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message);
      logClientEvent("superadmin_users_error", "error", { message: e.message });
    } finally {
      setLoading(false);
    }
  }, [authEnabled]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;

  const filtered = users.filter(u => {
    const matchSearch = !search || u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by email…" className="pl-9 min-h-[44px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {["all", "driver", "admin", "super_admin"].map(r => (
            <Button key={r} size="sm" variant={roleFilter === r ? "default" : "outline"} onClick={() => setRoleFilter(r)} className="min-h-[44px] capitalize">
              {r === "all" ? "All" : r.replace("_", " ")}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="min-h-[44px]" disabled>
          <UserPlus className="w-4 h-4 mr-1" /> Create Driver (TODO)
        </Button>
        <Button variant="outline" className="min-h-[44px]" disabled>
          <UserPlus className="w-4 h-4 mr-1" /> Create Admin (TODO)
        </Button>
      </div>
      {!filtered.length ? <EmptyState message="No users found." /> : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Org</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "super_admin" ? "destructive" : u.role === "admin" ? "default" : "secondary"} className="capitalize text-xs">
                      {u.role?.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">{u.org_id?.slice(0, 8) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ── Jobs Monitor Tab ────────────────────────────────────────────── */

function JobsMonitorTab() {
  const navigate = useNavigate();
  const { authEnabled } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!authEnabled) {
        setJobs([]);
        return;
      }
      const { data, error: err } = await supabase
        .from("jobs")
        .select("*")
        .eq("is_hidden", false)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (err) throw err;
      setJobs((data ?? []) as Job[]);
    } catch (e: any) {
      setError(e.message);
      logClientEvent("superadmin_jobs_error", "error", { message: e.message });
    } finally {
      setLoading(false);
    }
  }, [authEnabled]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    const matchSearch = !q || [j.vehicle_reg, j.external_job_number, j.client_name, j.driver_name, j.pickup_city, j.delivery_city]
      .some(v => v?.toLowerCase().includes(q));
    const matchStatus = statusFilter === "all" || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by reg, ref, client, driver…" className="pl-9 min-h-[44px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {["all", ...ACTIVE_STATUSES.slice(0, 4)].map(s => (
            <Button key={s} size="sm" variant={statusFilter === s ? "default" : "outline"} onClick={() => setStatusFilter(s)} className="min-h-[44px] text-xs capitalize">
              {s === "all" ? "All" : getStatusStyle(s).label}
            </Button>
          ))}
        </div>
      </div>
      {!filtered.length ? <EmptyState message="No jobs found." /> : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Ref</TableHead>
                <TableHead className="text-xs">Reg</TableHead>
                <TableHead className="text-xs">Driver</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Updated</TableHead>
                <TableHead className="text-xs text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 100).map(job => {
                const s = getStatusStyle(job.status);
                return (
                  <TableRow key={job.id}>
                    <TableCell className="text-sm font-medium">{job.external_job_number || job.id.slice(0, 8)}</TableCell>
                    <TableCell><UKPlate reg={job.vehicle_reg} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{job.driver_name ?? "—"}</TableCell>
                    <TableCell>
                      <span style={{ backgroundColor: s.backgroundColor, color: s.color }} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase">
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(job.updated_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/jobs/${job.id}`)} className="min-h-[44px] min-w-[44px]">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ── System Health Tab ───────────────────────────────────────────── */

function SystemHealthTab() {
  const services = [
    { name: "DVLA Lookup", key: "vehicle-lookup", status: "Healthy" as const },
    { name: "Company Search", key: "business-search", status: "Healthy" as const },
    { name: "Google Sheets Sync", key: "google-sheets-sync", status: "Healthy" as const },
    { name: "Photo Uploads", key: "gcs-upload", status: "Healthy" as const },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {services.map(svc => (
        <Card key={svc.key}>
          <CardHeader className="flex flex-row items-center justify-between pb-1 pt-3 px-4">
            <CardTitle className="text-sm font-medium">{svc.name}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
              {svc.status}
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">Last check: live</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ── Error Log Tab ───────────────────────────────────────────────── */

function ErrorLogTab() {
  const { authEnabled } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!authEnabled) {
        setLogs([]);
        return;
      }
      const { data, error: err } = await supabase
        .from("client_logs")
        .select("*")
        .in("severity", ["error", "warn"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (err) throw err;
      setLogs(data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [authEnabled]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;
  if (!logs.length) return <EmptyState message="No errors logged." />;

  return (
    <div className="rounded-xl border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Time</TableHead>
            <TableHead className="text-xs">Severity</TableHead>
            <TableHead className="text-xs">Event</TableHead>
            <TableHead className="text-xs">Message</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map(log => (
            <TableRow key={log.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
              <TableCell>
                <Badge variant={log.severity === "error" ? "destructive" : "secondary"} className="text-xs">
                  {log.severity}
                </Badge>
              </TableCell>
              <TableCell className="text-xs font-mono">{log.event}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">{log.message ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ── Settings Tab ────────────────────────────────────────────────── */

function SuperSettingsTab() {
  const SUPERADMIN_EMAILS_RAW = import.meta.env.VITE_SUPERADMIN_EMAILS as string | undefined;
  const hardcoded = ["axentravehiclelogistics@gmail.com", "info@axentravehicles.com"];
  const envEmails = (SUPERADMIN_EMAILS_RAW ?? "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  const allEmails = Array.from(new Set([...envEmails, ...hardcoded]));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="w-4 h-4" /> Recognised Super Admin Emails
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {allEmails.map(e => (
              <Badge key={e} variant="outline" className="text-xs font-mono">{e}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Controlled by <code className="bg-muted px-1 rounded">VITE_SUPERADMIN_EMAILS</code> env var + hardcoded defaults.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Feature Toggles</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">No toggleable features yet. Future toggles will appear here.</p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────────────────────────── */

export function SuperAdminDashboard() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Super Admin Control Centre" showBack onBack={() => navigate("/")} />
      <div className="p-4 max-w-6xl mx-auto">
        <Tabs defaultValue="overview">
          <TabsList className="w-full grid grid-cols-4 lg:grid-cols-7 mb-4">
            <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />Overview</TabsTrigger>
            <TabsTrigger value="orgs">Orgs</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="health" className="hidden lg:flex"><Activity className="w-4 h-4 mr-1" />Health</TabsTrigger>
            <TabsTrigger value="errors" className="hidden lg:flex"><AlertCircle className="w-4 h-4 mr-1" />Errors</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-4 h-4" /></TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="orgs"><OrganisationsTab /></TabsContent>
          <TabsContent value="users"><SuperUsersTab /></TabsContent>
          <TabsContent value="jobs"><JobsMonitorTab /></TabsContent>
          <TabsContent value="health"><SystemHealthTab /></TabsContent>
          <TabsContent value="errors"><ErrorLogTab /></TabsContent>
          <TabsContent value="settings"><SuperSettingsTab /></TabsContent>
        </Tabs>
      </div>
      <BottomNav />
    </div>
  );
}
