/**
 * Data hooks for the Compliance Control Page.
 * Queries inspections, damage_items, and jobs for compliance KPIs.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";

const THIRTY_DAYS_AGO = () => subDays(new Date(), 30).toISOString();

/** KPIs: inspection count (30d), damage report count, compliance rate */
export function useComplianceKpis() {
  return useQuery({
    queryKey: ["control", "compliance", "kpis"],
    queryFn: async () => {
      const since = THIRTY_DAYS_AGO();

      // Active inspections in last 30 days (exclude archived runs)
      const { count: inspectionCount } = await (supabase
        .from("inspections")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since) as any)
        .is("archived_at", null);

      // Active damage items only — soft-archived items belong to a prior run
      const { count: damageCount } = await (supabase
        .from("damage_items")
        .select("id", { count: "exact", head: true }) as any)
        .is("archived_at", null);

      // Compliance rate: only true completed jobs (status = 'completed') with
      // BOTH inspections / total completed (30d). pod_ready / delivery_complete
      // are review states and must not pollute completion metrics.
      const { data: completedJobs } = await supabase
        .from("jobs")
        .select("id, has_pickup_inspection, has_delivery_inspection")
        .eq("status", "completed")
        .gte("completed_at", since)
        .not("completed_at", "is", null);

      const total = completedJobs?.length ?? 0;
      const compliant = completedJobs?.filter(
        (j) => j.has_pickup_inspection && j.has_delivery_inspection
      ).length ?? 0;
      const complianceRate = total > 0 ? Math.round((compliant / total) * 100) : null;

      return {
        inspectionCount: inspectionCount ?? 0,
        damageCount: damageCount ?? 0,
        complianceRate,
      };
    },
    staleTime: 30_000,
  });
}

export interface RecentInspectionRow {
  id: string;
  type: string;
  has_damage: boolean;
  created_at: string;
  vehicle_reg: string;
  vehicle_make: string;
  vehicle_model: string;
  job_id: string;
}

/** Recent 20 inspections joined with job vehicle_reg */
export function useRecentInspections() {
  return useQuery({
    queryKey: ["control", "compliance", "recentInspections"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("inspections")
        .select("id, type, has_damage, created_at, job_id, jobs!inner(vehicle_reg, vehicle_make, vehicle_model)")
        .order("created_at", { ascending: false })
        .limit(20) as any)
        .is("archived_at", null);

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        type: row.type,
        has_damage: row.has_damage,
        created_at: row.created_at,
        job_id: row.job_id,
        vehicle_reg: row.jobs?.vehicle_reg ?? "—",
        vehicle_make: row.jobs?.vehicle_make ?? "",
        vehicle_model: row.jobs?.vehicle_model ?? "",
      })) as RecentInspectionRow[];
    },
    staleTime: 30_000,
  });
}

export interface OutstandingDamageRow {
  id: string;
  area: string | null;
  damage_types: string[] | null;
  notes: string | null;
  created_at: string;
  inspection_id: string;
}

/** Outstanding damage items ordered by recency */
export function useOutstandingDamage() {
  return useQuery({
    queryKey: ["control", "compliance", "outstandingDamage"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("damage_items")
        .select("id, area, damage_types, notes, created_at, inspection_id")
        .order("created_at", { ascending: false })
        .limit(20) as any)
        .is("archived_at", null);

      if (error) throw error;
      return (data ?? []) as OutstandingDamageRow[];
    },
    staleTime: 30_000,
  });
}
