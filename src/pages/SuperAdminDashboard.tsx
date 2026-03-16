import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  listAllUsers, createOrganisation, createUser, setUserRole,
  deactivateUser, reactivateUser,
  type OrgUser, type OrgRecord,
} from "@/lib/adminApi";
import { logClientEvent } from "@/lib/logger";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Building2, Users, Briefcase, Activity, AlertCircle,
  Settings, Eye, Search, RefreshCw, Shield, UserPlus,
  BarChart3, ClipboardCheck, Car, Sheet, Power, PowerOff, Bell, ScrollText,
} from "lucide-react";
import { getStatusStyle, ACTIVE_STATUSES } from "@/lib/statusConfig";
import { UKPlate } from "@/components/UKPlate";
import { toast } from "@/hooks/use-toast";
import type { Job } from "@/lib/types";
import { AttentionCenter } from "@/features/attention/components/AttentionCenter";

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
  const [stats, setStats] = useState<Record<string, number | string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgRes, jobsTodayRes, jobsWeekRes] = await Promise.all([
        supabase.from("organisations").select("id", { count: "exact", head: true }),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .gte("created_at", new Date().toISOString().slice(0, 10) + "T00:00:00"),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .gte("created_at", (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString(); })()),
      ]);
      let userCount = 0;
      try { const users = await listAllUsers(); userCount = users.length; } catch { /* ok */ }
      setStats({
        orgs: orgRes.count ?? 0, users: userCount,
        jobsToday: jobsTodayRes.count ?? 0, jobsWeek: jobsWeekRes.count ?? 0,
      });
    } catch (e: any) {
      setError(e.message ?? "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;

  const tiles = [
    { label: "Organisations", value: stats.orgs, icon: Building2 },
    { label: "Users", value: stats.users, icon: Users },
    { label: "Jobs Today", value: stats.jobsToday, icon: Briefcase },
    { label: "Jobs (7d)", value: stats.jobsWeek, icon: BarChart3 },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.from("organisations").select("*").order("name");
      if (err) throw err;
      setOrgs(data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createOrganisation(newName.trim());
      toast({ title: "Organisation created" });
      setNewName("");
      setShowCreate(false);
      load();
    } catch (e: any) {
      toast({ title: "Failed to create org", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

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
        <Button variant="outline" className="min-h-[44px]" onClick={() => setShowCreate(true)}>
          <Building2 className="w-4 h-4 mr-1" /> Create Org
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

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Organisation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Organisation Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Axentra Vehicles" className="mt-1 min-h-[44px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Users Tab (with role change confirmation) ───────────────────── */

function SuperUsersTab() {
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

  // Role change confirmation
  const [pendingRoleChange, setPendingRoleChange] = useState<{ userId: string; email: string; fromRole: string; toRole: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userData, orgData] = await Promise.all([
        listAllUsers(),
        supabase.from("organisations").select("*").order("name"),
      ]);
      setUsers(userData);
      setOrgs(orgData.data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newEmail.trim() || !newOrgId) return;
    setCreating(true);
    try {
      await createUser(newEmail.trim(), newRole, newOrgId);
      toast({ title: `User invited as ${newRole}` });
      setNewEmail(""); setNewRole("driver"); setNewOrgId("");
      setShowCreate(false);
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const requestRoleChange = (userId: string, newRole: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    // If downgrading or same, skip confirm for non-super-admin targets
    if (newRole === user.role) return;
    setPendingRoleChange({ userId, email: user.email, fromRole: user.role, toRole: newRole });
    setConfirmText("");
  };

  const executeRoleChange = async () => {
    if (!pendingRoleChange) return;
    const isSuperPromotion = pendingRoleChange.toRole === "super_admin";
    if (isSuperPromotion && confirmText !== "CONFIRM") return;

    setActionLoading(pendingRoleChange.userId);
    setPendingRoleChange(null);
    try {
      await setUserRole(pendingRoleChange.userId, pendingRoleChange.toRole);
      toast({ title: `Role updated to ${pendingRoleChange.toRole}` });
      load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    setActionLoading(userId);
    try {
      if (currentlyActive) {
        await deactivateUser(userId);
        toast({ title: "User deactivated" });
      } else {
        await reactivateUser(userId);
        toast({ title: "User reactivated" });
      }
      load();
    } catch (e: any) {
      const msg = e.message?.includes("CANNOT_MODIFY_SELF")
        ? "You cannot deactivate your own account."
        : e.message;
      toast({ title: "Failed", description: msg, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;

  const filtered = users.filter(u => {
    const matchSearch = !search || u.email?.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by email…" className="pl-9 min-h-[44px]" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button variant="outline" className="min-h-[44px]" onClick={() => setShowCreate(true)}>
          <UserPlus className="w-4 h-4 mr-1" /> Create User
        </Button>
      </div>
      <div className="flex gap-1 flex-wrap">
        {["all", "driver", "admin", "super_admin"].map(r => (
          <Button key={r} size="sm" variant={roleFilter === r ? "default" : "outline"} onClick={() => setRoleFilter(r)} className="min-h-[44px] capitalize text-xs">
            {r === "all" ? "All" : r === "super_admin" ? "S.Admin" : r.replace("_", " ")}
          </Button>
        ))}
      </div>

      {!filtered.length ? <EmptyState message="No users found." /> : (
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
                        <SelectTrigger className="w-[110px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="driver">Driver</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{orgName ?? u.org_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={isActive ? "secondary" : "destructive"} className="text-xs">
                        {isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm" variant="ghost"
                        onClick={() => handleToggleActive(u.id, isActive)}
                        disabled={actionLoading === u.id}
                        className="min-h-[36px]"
                      >
                        {actionLoading === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : isActive ? <PowerOff className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                      </Button>
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
              You are about to change <strong>{pendingRoleChange?.email}</strong>'s role from{" "}
              <strong>{pendingRoleChange?.fromRole}</strong> to <strong>{pendingRoleChange?.toRole}</strong>.
              {pendingRoleChange?.toRole === "super_admin" && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠️ This grants God-mode access to all organisations. Type CONFIRM to proceed.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {pendingRoleChange?.toRole === "super_admin" && (
            <Input
              placeholder="Type CONFIRM"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="min-h-[44px]"
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRoleChange(null)}>Cancel</Button>
            <Button
              onClick={executeRoleChange}
              disabled={pendingRoleChange?.toRole === "super_admin" && confirmText !== "CONFIRM"}
              variant={pendingRoleChange?.toRole === "super_admin" ? "destructive" : "default"}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create user dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create / Invite User</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Email</Label>
              <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@example.com" className="mt-1 min-h-[44px]" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Organisation</Label>
              <Select value={newOrgId} onValueChange={setNewOrgId}>
                <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue placeholder="Select org" /></SelectTrigger>
                <SelectContent>
                  {orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
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
    </div>
  );
}

/* ── Jobs Monitor Tab (fixed: limit 100) ─────────────────────────── */

function JobsMonitorTab() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.from("jobs").select("*").eq("is_hidden", false).order("updated_at", { ascending: false }).limit(100);
      if (err) throw err;
      setJobs((data ?? []) as Job[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase();
    return !q || [j.vehicle_reg, j.external_job_number, j.client_name, j.driver_name].some(v => v?.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search…" className="pl-9 min-h-[44px]" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {!filtered.length ? <EmptyState message="No jobs found." /> : (
        <div className="rounded-xl border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Ref</TableHead>
                <TableHead className="text-xs">Reg</TableHead>
                <TableHead className="text-xs">Driver</TableHead>
                <TableHead className="text-xs min-w-[100px]">Status</TableHead>
                <TableHead className="text-xs text-right">View</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(job => {
                const s = getStatusStyle(job.status);
                return (
                  <TableRow key={job.id}>
                    <TableCell className="text-sm font-medium">{job.external_job_number || job.id.slice(0, 8)}</TableCell>
                    <TableCell><UKPlate reg={job.vehicle_reg} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {job.driver_name ? job.driver_name : <span className="text-amber-500">Unassigned</span>}
                    </TableCell>
                    <TableCell>
                      <span style={{ backgroundColor: s.backgroundColor, color: s.color }} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase whitespace-nowrap">{s.label}</span>
                    </TableCell>
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

/* ── Audit Log Tab (NEW) ──────────────────────────────────────────── */

function AuditLogTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (err) throw err;
      setLogs(data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorPanel message={error} onRetry={load} />;
  if (!logs.length) return <EmptyState message="No audit entries yet. Actions will appear here as they happen." />;

  return (
    <div className="rounded-xl border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Time</TableHead>
            <TableHead className="text-xs">Admin</TableHead>
            <TableHead className="text-xs">Action</TableHead>
            <TableHead className="text-xs">Before</TableHead>
            <TableHead className="text-xs">After</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map(log => (
            <TableRow key={log.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</TableCell>
              <TableCell className="text-xs">{log.performed_by_email}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs font-mono uppercase">{log.action}</Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                {log.before_state ? JSON.stringify(log.before_state) : "—"}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                {log.after_state ? JSON.stringify(log.after_state) : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/* ── Error Log Tab ───────────────────────────────────────────────── */

function ErrorLogTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.from("client_logs").select("*").in("severity", ["error", "warn"]).order("created_at", { ascending: false }).limit(100);
      if (err) throw err;
      setLogs(data ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

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
                <Badge variant={log.severity === "error" ? "destructive" : "secondary"} className="text-xs">{log.severity}</Badge>
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

/* ── Settings Tab (replaced: no more hardcoded emails) ───────────── */

function SuperSettingsTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2"><Shield className="w-4 h-4" /> Super Admin Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Super Admin access is governed by <code className="bg-muted px-1 rounded">app_metadata.role</code> in Supabase Auth.
            To grant or revoke Super Admin, use the Users tab role selector.
          </p>
          <p className="text-xs text-muted-foreground">
            Hardcoded email allow-lists have been removed. All identity checks now use database-driven roles.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Feature Flags</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Feature flags are managed in <code className="bg-muted px-1 rounded">app_settings</code>.
            A dedicated flags management UI is planned for a future release.
          </p>
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
          <TabsList className="w-full grid grid-cols-4 lg:grid-cols-8 mb-4">
            <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />Overview</TabsTrigger>
            <TabsTrigger value="attention"><Bell className="w-4 h-4 mr-1 hidden sm:inline" />Attention</TabsTrigger>
            <TabsTrigger value="orgs">Orgs</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="audit" className="hidden lg:flex"><ScrollText className="w-4 h-4 mr-1" />Audit</TabsTrigger>
            <TabsTrigger value="errors" className="hidden lg:flex"><AlertCircle className="w-4 h-4 mr-1" />Errors</TabsTrigger>
            <TabsTrigger value="settings"><Settings className="w-4 h-4" /></TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="attention"><AttentionCenter scope="all" /></TabsContent>
          <TabsContent value="orgs"><OrganisationsTab /></TabsContent>
          <TabsContent value="users"><SuperUsersTab /></TabsContent>
          <TabsContent value="jobs"><JobsMonitorTab /></TabsContent>
          <TabsContent value="audit"><AuditLogTab /></TabsContent>
          <TabsContent value="errors"><ErrorLogTab /></TabsContent>
          <TabsContent value="settings"><SuperSettingsTab /></TabsContent>
        </Tabs>
      </div>
      <BottomNav />
    </div>
  );
}
