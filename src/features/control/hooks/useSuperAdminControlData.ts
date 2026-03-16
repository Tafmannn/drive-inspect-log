/**
 * Super Admin Control Centre – data hooks.
 * Uses existing queries from SuperAdminDashboard, migrated to react-query.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listAllUsers, type OrgUser, type OrgRecord } from "@/lib/adminApi";

export interface SuperAdminKpis {
  totalOrgs: number;
  totalUsers: number;
  activeJobs: number;
  auditEventsToday: number;
}

export function useSuperAdminKpis() {
  return useQuery({
    queryKey: ["control-super-kpis"],
    queryFn: async () => {
      const todayStr = new Date().toISOString().slice(0, 10);

      const [orgRes, jobRes, auditRes] = await Promise.all([
        supabase.from("organisations").select("id", { count: "exact", head: true }),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ["ready_for_pickup", "assigned", "pickup_in_progress", "delivery_in_progress", "in_transit"]),
        supabase.from("admin_audit_log").select("id", { count: "exact", head: true })
          .gte("created_at", `${todayStr}T00:00:00`),
      ]);

      let userCount = 0;
      try { const users = await listAllUsers(); userCount = users.length; } catch { /* ok */ }

      return {
        totalOrgs: orgRes.count ?? 0,
        totalUsers: userCount,
        activeJobs: jobRes.count ?? 0,
        auditEventsToday: auditRes.count ?? 0,
      } satisfies SuperAdminKpis;
    },
    staleTime: 30_000,
  });
}

export function useOrganisations() {
  return useQuery({
    queryKey: ["control-organisations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organisations").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as OrgRecord[];
    },
    staleTime: 60_000,
  });
}

export function useAllUsersQuery() {
  return useQuery({
    queryKey: ["control-all-users"],
    queryFn: async () => {
      return await listAllUsers();
    },
    staleTime: 60_000,
  });
}

export function useRecentAuditLogs() {
  return useQuery({
    queryKey: ["control-recent-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}

export function useRecentErrors() {
  return useQuery({
    queryKey: ["control-recent-errors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_logs")
        .select("*")
        .in("severity", ["error", "warn"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}
