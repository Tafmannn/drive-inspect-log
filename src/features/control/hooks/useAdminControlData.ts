/**
 * Admin Control Centre – hooks for real operational data.
 * Uses existing Supabase queries from AdminDashboard, migrated to react-query.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES, PENDING_STATUSES } from "@/lib/statusConfig";
import { getAllPendingUploads } from "@/lib/pendingUploads";
import type { Job } from "@/lib/types";

export interface AdminKpis {
  readyToDispatch: number;
  inTransit: number;
  exceptions: number;
  podReview: number;
  completedToday: number;
  unassigned: number;
}

export function useAdminKpis() {
  return useQuery({
    queryKey: ["control-admin-kpis"],
    queryFn: async () => {
      const todayStr = new Date().toISOString().slice(0, 10);

      const [readyRes, transitRes, podRes, completedRes, unassignedRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ["ready_for_pickup", "assigned"]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ["pickup_in_progress", "in_transit", "delivery_in_progress"]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ["pod_ready", "delivery_complete"]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .not("completed_at", "is", null)
          .gte("completed_at", `${todayStr}T00:00:00`),
        // Prefer driver_id for unassigned detection; legacy rows with driver_name but no driver_id are still considered assigned
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ACTIVE_STATUSES as string[])
          .is("driver_id", null)
          .is("driver_name", null),
      ]);

      return {
        readyToDispatch: readyRes.count ?? 0,
        inTransit: transitRes.count ?? 0,
        exceptions: 0, // filled by attention data
        podReview: podRes.count ?? 0,
        completedToday: completedRes.count ?? 0,
        unassigned: unassignedRes.count ?? 0,
      } satisfies AdminKpis;
    },
    staleTime: 30_000,
  });
}

export function useDispatchBoard() {
  return useQuery({
    queryKey: ["control-dispatch-board"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, status, driver_name, pickup_city, pickup_postcode, delivery_city, delivery_postcode, job_date, updated_at, priority")
        .eq("is_hidden", false)
        .in("status", [...(ACTIVE_STATUSES as string[]), ...(PENDING_STATUSES as string[])])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as (Pick<Job, "id" | "external_job_number" | "vehicle_reg" | "vehicle_make" | "vehicle_model" | "status" | "driver_name" | "pickup_city" | "pickup_postcode" | "delivery_city" | "delivery_postcode" | "job_date" | "updated_at" | "priority">)[];
    },
    staleTime: 30_000,
  });
}

export function useRecentCompleted() {
  return useQuery({
    queryKey: ["control-recent-completed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id, external_job_number, vehicle_reg, status, driver_name, completed_at, delivery_city")
        .eq("is_hidden", false)
        .in("status", ["completed", "delivery_complete", "pod_ready"])
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}
