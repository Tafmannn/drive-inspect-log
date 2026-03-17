/**
 * UserIndex — searchable, filterable user list for admin & super admin.
 */
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useUserList, useSyncProfiles } from "@/hooks/useUserManagement";
import type { UserProfile } from "@/lib/userLifecycleApi";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountStatusBadge, ArchivedBadge, RoleBadge } from "./UserStatusBadge";
import { Search, Plus, RefreshCw, Loader2, User } from "lucide-react";

interface UserIndexProps {
  onSelectUser: (userId: string) => void;
  onCreateUser: () => void;
}

export function UserIndex({ onSelectUser, onCreateUser }: UserIndexProps) {
  const { isSuperAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [archiveFilter, setArchiveFilter] = useState<string>("active");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);

  // Load orgs for super admin filter
  useEffect(() => {
    if (!isSuperAdmin) return;
    supabase.from("organisations").select("id, name").order("name").then(({ data }) => {
      setOrgs(data ?? []);
    });
  }, [isSuperAdmin]);

  const filters = useMemo(() => {
    const f: Record<string, string> = {};
    if (roleFilter !== "all") f.role = roleFilter;
    if (statusFilter !== "all") f.account_status = statusFilter;
    if (orgFilter !== "all") f.org_id = orgFilter;
    return f;
  }, [roleFilter, statusFilter, orgFilter]);

  const { data: users, isLoading, refetch } = useUserList(filters);
  const syncMutation = useSyncProfiles();

  const filtered = useMemo(() => {
    if (!users) return [];
    let result = users;

    // Search
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.email.toLowerCase().includes(s) ||
          u.display_name?.toLowerCase().includes(s) ||
          u.first_name?.toLowerCase().includes(s) ||
          u.last_name?.toLowerCase().includes(s)
      );
    }

    // Archive filter for drivers
    if (archiveFilter === "active") {
      result = result.filter((u) => {
        if (u.role !== "driver") return true;
        const dp = u.driver_profiles?.[0];
        return !dp?.archived_at;
      });
    } else if (archiveFilter === "archived") {
      result = result.filter((u) => {
        const dp = u.driver_profiles?.[0];
        return !!dp?.archived_at;
      });
    }

    return result;
  }, [users, search, archiveFilter]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search name or email…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="driver">Driver</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending_activation">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>

        <Select value={archiveFilter} onValueChange={setArchiveFilter}>
          <SelectTrigger className="h-8 w-[100px] text-xs">
            <SelectValue placeholder="Archive" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active Only</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        {isSuperAdmin && orgs.length > 0 && (
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Organisation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orgs</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>

        {isSuperAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Sync Auth
          </Button>
        )}

        <Button size="sm" className="h-8 text-xs" onClick={onCreateUser}>
          <Plus className="h-3 w-3 mr-1" /> New User
        </Button>
      </div>

      {/* Results count */}
      <p className="text-[11px] text-muted-foreground">
        {isLoading ? "Loading…" : `${filtered.length} user${filtered.length !== 1 ? "s" : ""}`}
      </p>

      {/* User list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">No users found.</div>
      ) : (
        <div className="space-y-1">
          {filtered.map((u) => (
            <UserRow key={u.id} user={u} onClick={() => onSelectUser(u.auth_user_id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, onClick }: { user: UserProfile; onClick: () => void }) {
  const dp = user.driver_profiles?.[0];
  const isArchived = !!dp?.archived_at;
  const displayName = user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email.split("@")[0];

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/40 transition-colors text-left"
    >
      {/* Avatar */}
      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground truncate">{displayName}</span>
          <RoleBadge role={user.role} />
          <AccountStatusBadge status={user.account_status} />
          {isArchived && <ArchivedBadge />}
          {user.is_protected && (
            <span className="text-[9px] text-amber-600 font-semibold">🔒</span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground truncate block">{user.email}</span>
      </div>
    </button>
  );
}
