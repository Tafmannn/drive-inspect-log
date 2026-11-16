/**
 * Super Admin Sub-Pages — detail management surfaces
 * Each tab from the old monolithic page is now a standalone route.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { createOrganisation, type OrgRecord } from "@/lib/adminApi";
import { UserManagementPanel } from "@/features/users/components/UserManagementPanel";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { ListRowsSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Building2, Search, Eye,
  AlertCircle, RefreshCw, Shield, Settings,
  UserX, ChevronRight, Clock,
} from "lucide-react";
import { getStatusStyle } from "@/lib/statusConfig";
import { UKPlate } from "@/components/UKPlate";
import { toast } from "@/hooks/use-toast";
import { AttentionCenter } from "@/features/attention/components/AttentionCenter";
import { isJobStale, isUnassigned, humanAge } from "@/features/control/pages/jobs/jobsUtils";
import type { Job } from "@/lib/types";

/* ─── Shared ─────────────────────────────────────────────────── */

function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title={title} showBack onBack={() => navigate("/super-admin")} />
      <div className="p-4 max-w-3xl mx-auto space-y-4">{children}</div>
      <BottomNav />
    </div>
  );
}

function LoadingSpinner() {
  return <div className="py-2"><ListRowsSkeleton rows={4} /></div>;
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <AlertCircle className="w-8 h-8 text-destructive" />
      <p className="text-sm text-destructive">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw className="w-4 h-4 mr-1" /> Retry</Button>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground text-center py-10">{message}</p>;
}

/* ─── Organisations ────────────────────────────────────────────── */

export function SuperAdminOrgs() {
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.from("organisations").select("*").order("name");
      if (err) throw err;
      setOrgs(data ?? []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createOrganisation(newName.trim());
      toast({ title: "Organisation created" });
      setNewName(""); setShowCreate(false); load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setCreating(false); }
  };

  const filtered = orgs.filter(o => !search || o.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageShell title="Organisations">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search…" className="pl-9 min-h-[44px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button className="min-h-[44px]" onClick={() => setShowCreate(true)}>
          <Building2 className="w-4 h-4 mr-1" /> Create
        </Button>
      </div>

      {loading ? <LoadingSpinner /> : error ? <ErrorPanel message={error} onRetry={load} /> :
        !filtered.length ? <EmptyState message="No organisations found." /> : (
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
                  <TableRow key={o.id} className="cursor-pointer hover:bg-muted/40" onClick={() => window.location.assign(`/super-admin/orgs/${o.id}`)}>
                    <TableCell className="text-sm font-medium">{o.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{o.id?.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Organisation</DialogTitle></DialogHeader>
          <div><Label>Name</Label><Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Axentra Vehicles" className="mt-1 min-h-[44px]" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

/* ─── Users ────────────────────────────────────────────────────── */

export function SuperAdminUsers() {
  // Same user management as admins get (profile, role, status, driver
  // profile, permissions, archive/restore), with the super-admin extras
  // switched on inside the shared components. This page used to be a reduced
  // copy (role + active toggle only), which left the owner with fewer driver
  // controls than an admin.
  return (
    <PageShell title="Users">
      <UserManagementPanel />
    </PageShell>
  );
}

/* ─── Jobs Monitor (with inline actions) ───────────────────────── */

export function SuperAdminJobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase
        .from("jobs")
        .select("id, external_job_number, vehicle_reg, status, driver_name, driver_id, pickup_postcode, delivery_postcode, updated_at, has_pickup_inspection, has_delivery_inspection")
        .eq("is_hidden", false)
        .order("updated_at", { ascending: false })
        .limit(200);
      if (err) throw err;
      setJobs(data ?? []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    const matchSearch = !q || [j.vehicle_reg, j.external_job_number, j.driver_name].some(v => v?.toLowerCase().includes(q));
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "unassigned" && !j.driver_name && !j.driver_id) ||
      (statusFilter === "stale" && isJobStale({ status: j.status, updated_at: j.updated_at })) ||
      (statusFilter === "active" && ["ready_for_pickup", "assigned", "pickup_in_progress", "delivery_in_progress"].includes(j.status));
    return matchSearch && matchStatus;
  });

  return (
    <PageShell title="Jobs Monitor">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search reg, ref, driver…" className="pl-9 min-h-[44px]" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Status filter chips */}
      <div className="flex gap-1 flex-wrap">
        {[
          { label: "All", value: "all" },
          { label: "Active", value: "active" },
          { label: "Unassigned", value: "unassigned" },
          { label: "Stale", value: "stale" },
        ].map(opt => (
          <Button
            key={opt.value}
            size="sm"
            variant={statusFilter === opt.value ? "default" : "outline"}
            onClick={() => setStatusFilter(opt.value)}
            className="text-xs h-8"
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : error ? <ErrorPanel message={error} onRetry={load} /> :
        !filtered.length ? <EmptyState message="No jobs found." /> : (
          <div className="space-y-2">
            {/* Mobile card view */}
            {filtered.map(job => {
              const s = getStatusStyle(job.status);
              const stale = isJobStale({ status: job.status, updated_at: job.updated_at });
              const unassigned = !job.driver_name && !job.driver_id;

              return (
                <div
                  key={job.id}
                  className="rounded-xl border border-border bg-card p-3 space-y-2 cursor-pointer active:bg-muted/50"
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        style={{ backgroundColor: s.backgroundColor, color: s.color }}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                      >
                        {s.label}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        {job.external_job_number || job.id.slice(0, 8)}
                      </span>
                      {stale && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] text-warning font-medium">
                          <Clock className="h-2.5 w-2.5" /> Stale
                        </span>
                      )}
                    </div>
                    <UKPlate reg={job.vehicle_reg} />
                  </div>

                  {/* Driver + route */}
                  <div className="flex items-center justify-between text-xs">
                    {unassigned ? (
                      <span className="inline-flex items-center gap-1 text-warning font-medium">
                        <UserX className="h-3 w-3" /> Unassigned
                      </span>
                    ) : (
                      <span className="text-foreground">{job.driver_name}</span>
                    )}
                    <span className="text-muted-foreground">{job.pickup_postcode} → {job.delivery_postcode}</span>
                  </div>

                  {/* Inline actions */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      className="min-h-[36px] text-xs flex-1"
                      onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}`); }}
                    >
                      <Eye className="h-3 w-3 mr-1" /> View
                    </Button>
                    <span className="text-[10px] text-muted-foreground">{humanAge(job.updated_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </PageShell>
  );
}

/* ─── Audit Log ────────────────────────────────────────────────── */

export function SuperAdminAudit() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(100);
      if (err) throw err;
      setLogs(data ?? []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <PageShell title="Audit Log">
      {loading ? <LoadingSpinner /> : error ? <ErrorPanel message={error} onRetry={load} /> :
        !logs.length ? <EmptyState message="No audit entries yet." /> : (
          <div className="space-y-1.5">
            {logs.map(log => (
              <div key={log.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant="outline" className="text-[10px] font-mono uppercase">{log.action}</Badge>
                  <span className="text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {log.performed_by_email}
                  {log.after_state && (
                    <> — <span className="text-foreground/70">{JSON.stringify(log.after_state).slice(0, 60)}</span></>
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
    </PageShell>
  );
}

/* ─── Errors ───────────────────────────────────────────────────── */

export function SuperAdminErrors() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error: err } = await supabase.from("client_logs").select("*").in("severity", ["error", "warn"]).order("created_at", { ascending: false }).limit(100);
      if (err) throw err;
      setLogs(data ?? []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <PageShell title="Error Feed">
      {loading ? <LoadingSpinner /> : error ? <ErrorPanel message={error} onRetry={load} /> :
        !logs.length ? <EmptyState message="No errors logged." /> : (
          <div className="space-y-1.5">
            {logs.map(log => (
              <div key={log.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant={log.severity === "error" ? "destructive" : "secondary"} className="text-xs">{log.severity}</Badge>
                  <span className="text-xs font-mono text-muted-foreground">{log.event}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{new Date(log.created_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{log.message ?? "—"}</p>
              </div>
            ))}
          </div>
        )}
    </PageShell>
  );
}

/* ─── Attention ────────────────────────────────────────────────── */

export function SuperAdminAttention() {
  return (
    <PageShell title="Global Attention">
      <AttentionCenter scope="all" />
    </PageShell>
  );
}

/* ─── Settings (structured) ────────────────────────────────────── */

export function SuperAdminSettings() {
  const navigate = useNavigate();

  return (
    <PageShell title="Settings">
      <div className="space-y-3">
        {/* Identity & Role Model */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4" /> Identity & Role Model
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Auth source</span>
              <Badge variant="secondary" className="text-[10px]">user_profiles.role</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Roles</span>
              <span className="text-xs text-foreground">driver · admin · super_admin</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Tenant isolation</span>
              <Badge variant="secondary" className="text-[10px]">RLS via org_id</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 mt-1 gap-1"
              onClick={() => navigate("/super-admin/users")}
            >
              Manage users <ChevronRight className="h-3 w-3" />
            </Button>
          </CardContent>
        </Card>

        {/* Feature Flags */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings className="w-4 h-4" /> Feature Flags
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Storage</span>
              <Badge variant="secondary" className="text-[10px]">app_settings table</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Management UI</span>
              <Badge variant="outline" className="text-[10px]">Planned</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Platform Controls */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> Platform Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Bulk operations</span>
              <Badge variant="outline" className="text-[10px]">Not yet available</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Maintenance mode</span>
              <Badge variant="outline" className="text-[10px]">Not yet available</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
