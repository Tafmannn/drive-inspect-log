/**
 * Super Admin Sub-Pages — detail management surfaces
 * Each tab from the old monolithic page is now a standalone route.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllUsers, createOrganisation, createUser, setUserRole,
  deactivateUser, reactivateUser,
  type OrgUser, type OrgRecord,
} from "@/lib/adminApi";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Building2, UserPlus, Search, Eye, Power, PowerOff,
  AlertCircle, RefreshCw, Shield, ScrollText, Settings,
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
  return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
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
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("driver");
  const [newOrgId, setNewOrgId] = useState("");
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pendingRoleChange, setPendingRoleChange] = useState<{ userId: string; email: string; fromRole: string; toRole: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [userData, orgData] = await Promise.all([listAllUsers(), supabase.from("organisations").select("*").order("name")]);
      setUsers(userData); setOrgs(orgData.data ?? []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newEmail.trim() || !newOrgId) return;
    setCreating(true);
    try {
      await createUser(newEmail.trim(), newRole, newOrgId);
      toast({ title: `User invited as ${newRole}` });
      setNewEmail(""); setNewRole("driver"); setNewOrgId(""); setShowCreate(false); load();
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); } finally { setCreating(false); }
  };

  const requestRoleChange = (userId: string, newRole: string) => {
    const user = users.find(u => u.id === userId);
    if (!user || newRole === user.role) return;
    setPendingRoleChange({ userId, email: user.email, fromRole: user.role, toRole: newRole });
    setConfirmText("");
  };

  const executeRoleChange = async () => {
    if (!pendingRoleChange) return;
    if (pendingRoleChange.toRole === "super_admin" && confirmText !== "CONFIRM") return;
    setActionLoading(pendingRoleChange.userId); setPendingRoleChange(null);
    try {
      await setUserRole(pendingRoleChange.userId, pendingRoleChange.toRole);
      toast({ title: `Role updated to ${pendingRoleChange.toRole}` }); load();
    } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); } finally { setActionLoading(null); }
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    setActionLoading(userId);
    try {
      if (currentlyActive) { await deactivateUser(userId); toast({ title: "User deactivated" }); }
      else { await reactivateUser(userId); toast({ title: "User reactivated" }); }
      load();
    } catch (e: any) {
      const msg = e.message?.includes("CANNOT_MODIFY_SELF") ? "You cannot deactivate your own account." : e.message;
      toast({ title: "Failed", description: msg, variant: "destructive" });
    } finally { setActionLoading(null); }
  };

  const filtered = users.filter(u => {
    const matchSearch = !search || u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <PageShell title="Users">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by email…" className="pl-9 min-h-[44px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button className="min-h-[44px]" onClick={() => setShowCreate(true)}>
          <UserPlus className="w-4 h-4 mr-1" /> Create
        </Button>
      </div>
      <div className="flex gap-1 flex-wrap">
        {["all", "driver", "admin", "super_admin"].map(r => (
          <Button key={r} size="sm" variant={roleFilter === r ? "default" : "outline"} onClick={() => setRoleFilter(r)} className="min-h-[36px] capitalize text-xs">
            {r === "all" ? "All" : r === "super_admin" ? "S.Admin" : r}
          </Button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : error ? <ErrorPanel message={error} onRetry={load} /> :
        !filtered.length ? <EmptyState message="No users found." /> : (
          <div className="rounded-xl border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Org</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => {
                  const isActive = u.is_active !== false;
                  const orgName = orgs.find(o => o.id === u.org_id)?.name;
                  return (
                    <TableRow key={u.id} className={!isActive ? "opacity-50" : ""}>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell>
                        <Select defaultValue={u.role} onValueChange={v => requestRoleChange(u.id, v)} disabled={actionLoading === u.id}>
                          <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="driver">Driver</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{orgName ?? u.org_id?.slice(0, 8) ?? "—"}</TableCell>
                      <TableCell><Badge variant={isActive ? "secondary" : "destructive"} className="text-xs">{isActive ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell>
                        {u.id === currentUser?.id ? (
                          <span className="text-[10px] text-muted-foreground px-2">You</span>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => handleToggleActive(u.id, isActive)} disabled={actionLoading === u.id} className="min-h-[36px]">
                            {actionLoading === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : isActive ? <PowerOff className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

      {/* Role change confirmation */}
      <Dialog open={!!pendingRoleChange} onOpenChange={(open) => { if (!open) setPendingRoleChange(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Role Change</DialogTitle>
            <DialogDescription>
              Changing <strong>{pendingRoleChange?.email}</strong> from <strong>{pendingRoleChange?.fromRole}</strong> to <strong>{pendingRoleChange?.toRole}</strong>.
              {pendingRoleChange?.toRole === "super_admin" && (
                <span className="block mt-2 text-destructive font-medium">⚠️ This grants God-mode access. Type CONFIRM to proceed.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          {pendingRoleChange?.toRole === "super_admin" && (
            <Input placeholder="Type CONFIRM" value={confirmText} onChange={e => setConfirmText(e.target.value)} className="min-h-[44px]" />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRoleChange(null)}>Cancel</Button>
            <Button onClick={executeRoleChange} disabled={pendingRoleChange?.toRole === "super_admin" && confirmText !== "CONFIRM"} variant={pendingRoleChange?.toRole === "super_admin" ? "destructive" : "default"}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create / Invite User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Email</Label><Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" className="mt-1 min-h-[44px]" /></div>
            <div><Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="driver">Driver</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Organisation</Label>
              <Select value={newOrgId} onValueChange={setNewOrgId}>
                <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue placeholder="Select org" /></SelectTrigger>
                <SelectContent>{orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newEmail.trim() || !newOrgId}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              <Badge variant="secondary" className="text-[10px]">app_metadata.role</Badge>
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
