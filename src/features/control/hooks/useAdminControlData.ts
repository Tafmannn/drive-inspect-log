/**
 * Admin Control Centre – hooks for real operational data.
 * Uses existing Supabase queries, aligned with Jobs dispatch semantics.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES, PENDING_STATUSES } from "@/lib/statusConfig";
import type { Job } from "@/lib/types";

// ─── Stale threshold — must match Jobs page (24 h) ──────────────────
const STALE_HOURS = 24;

export interface AdminKpis {
  readyToDispatch: number;
  inTransit: number;
  exceptions: number;
  podReview: number;
  completedToday: number;
  unassigned: number;
  stale: number;
}

export function useAdminKpis() {
  return useQuery({
    queryKey: ["control-admin-kpis"],
    queryFn: async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

      const [readyRes, transitRes, podRes, completedRes, unassignedRes, staleRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ["ready_for_pickup", "assigned"]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ["pickup_in_progress", "in_transit", "delivery_in_progress"]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ["pod_ready", "delivery_complete"]),
        // Only `status = completed` counts as completed. pod_ready /
        // delivery_complete are review states surfaced separately above.
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .eq("status", "completed")
          .gte("completed_at", `${todayStr}T00:00:00`),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ACTIVE_STATUSES as string[])
          .is("driver_id", null)
          .is("driver_name", null),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", ACTIVE_STATUSES as string[])
          .lt("updated_at", staleThreshold),
      ]);

      return {
        readyToDispatch: readyRes.count ?? 0,
        inTransit: transitRes.count ?? 0,
        exceptions: 0, // filled by attention data
        podReview: podRes.count ?? 0,
        completedToday: completedRes.count ?? 0,
        unassigned: unassignedRes.count ?? 0,
        stale: staleRes.count ?? 0,
      } satisfies AdminKpis;
    },
    staleTime: 30_000,
  });
}

/** Extended dispatch row — aligned with JobControlRow from Jobs page */
export interface DispatchBoardRow extends Pick<
  Job,
  | "id" | "external_job_number" | "vehicle_reg" | "vehicle_make" | "vehicle_model"
  | "status" | "driver_name" | "pickup_city" | "pickup_postcode"
  | "delivery_city" | "delivery_postcode" | "job_date" | "updated_at"
  | "priority" | "client_company" | "client_name"
  | "has_pickup_inspection" | "has_delivery_inspection"
> {
  driver_id: string | null;
  resolvedDriverName: string | null;
}

const DISPATCH_SELECT = "id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, status, driver_id, driver_name, pickup_city, pickup_postcode, delivery_city, delivery_postcode, job_date, updated_at, priority, client_company, client_name, has_pickup_inspection, has_delivery_inspection, driver_profiles(display_name, full_name)";

function resolveDriverRows(data: any[]): DispatchBoardRow[] {
  return data.map((r: any) => {
    const profile = r.driver_profiles;
    const resolvedDriverName = profile
      ? (profile.display_name || profile.full_name || r.driver_name)
      : (r.driver_name || null);
    return { ...r, driver_profiles: undefined, resolvedDriverName } as DispatchBoardRow;
  });
}

/** Active dispatch board — all active + pending jobs, ordered by most recently updated */
export function useDispatchBoard() {
  return useQuery({
    queryKey: ["control-dispatch-board"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(DISPATCH_SELECT)
        .eq("is_hidden", false)
        .in("status", [...(ACTIVE_STATUSES as string[]), ...(PENDING_STATUSES as string[]), "assigned"])
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return resolveDriverRows(data ?? []);
    },
    staleTime: 30_000,
  });
}

/** Unassigned queue — active jobs with no driver, ordered by creation (oldest first = most urgent) */
export function useUnassignedQueue() {
  return useQuery({
    queryKey: ["control-unassigned-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(DISPATCH_SELECT)
        .eq("is_hidden", false)
        .in("status", ACTIVE_STATUSES as string[])
        .is("driver_id", null)
        .is("driver_name", null)
        .order("updated_at", { ascending: true })
        .limit(20);
      if (error) throw error;
      return resolveDriverRows(data ?? []);
    },
    staleTime: 30_000,
  });
}

/** POD review queue — delivery_complete / pod_ready, ordered by oldest first */
export function usePodReviewQueue() {
  return useQuery({
    queryKey: ["control-overview-pod-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(DISPATCH_SELECT)
        .eq("is_hidden", false)
        .in("status", PENDING_STATUSES as string[])
        .order("updated_at", { ascending: true })
        .limit(20);
      if (error) throw error;
      return resolveDriverRows(data ?? []);
    },
    staleTime: 30_000,
  });
}

/** Recently completed — last 20 completed jobs */
export function useRecentCompleted() {
  return useQuery({
    queryKey: ["control-recent-completed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select(DISPATCH_SELECT)
        .eq("is_hidden", false)
        .in("status", ["completed"])
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return resolveDriverRows(data ?? []);
    },
    staleTime: 30_000,
  });
}
