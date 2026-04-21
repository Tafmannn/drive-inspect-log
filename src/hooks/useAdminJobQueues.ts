/**
 * Data hook for the Admin Jobs Queue page (mobile-first).
 * Fetches all operational jobs and groups them into dispatch queues.
 *
 * Both grouping logic and driver-name resolution are delegated to the shared
 * selectors module so this surface stays in sync with the desktop Control Jobs
 * page (`useControlJobsData`).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES, PENDING_STATUSES } from "@/lib/statusConfig";
import { qk } from "@/lib/queryKeys";
import {
  groupJobsByQueue,
  resolveDriverName,
  staleThresholdIso,
} from "@/features/jobs/selectors";
import type { AdminJobRow } from "@/components/AdminJobCard";

export interface AdminJobQueues {
  needsAttention: AdminJobRow[];
  unassigned: AdminJobRow[];
  inProgress: AdminJobRow[];
  review: AdminJobRow[];
  completed: AdminJobRow[];
  missingEvidence: AdminJobRow[];
}

export function useAdminJobQueues() {
  return useQuery({
    queryKey: qk.jobs.adminQueues(),
    queryFn: async () => {
      // Fetch all non-hidden jobs with driver profile join
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, external_job_number, vehicle_reg, status, driver_id, driver_name, pickup_city, pickup_postcode, delivery_city, delivery_postcode, updated_at, has_pickup_inspection, has_delivery_inspection, driver_profiles(display_name, full_name)"
        )
        .eq("is_hidden", false)
        .order("updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;

      // Resolve driver names using the shared selector
      const rows: AdminJobRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        external_job_number: r.external_job_number,
        vehicle_reg: r.vehicle_reg,
        status: r.status,
        pickup_city: r.pickup_city,
        pickup_postcode: r.pickup_postcode,
        delivery_city: r.delivery_city,
        delivery_postcode: r.delivery_postcode,
        updated_at: r.updated_at,
        has_pickup_inspection: r.has_pickup_inspection,
        has_delivery_inspection: r.has_delivery_inspection,
        driver_id: r.driver_id,
        resolvedDriverName: resolveDriverName(r),
      }));

      // Group via shared selector — guarantees same definitions as Control Jobs
      const queues = groupJobsByQueue(rows);

      // Cap completed to recent
      queues.completed = queues.completed.slice(0, 20);

      return queues as AdminJobQueues;
    },
    staleTime: 20_000,
  });
}

export function useAdminJobQueueKpis() {
  return useQuery({
    queryKey: qk.jobs.adminQueueKpis(),
    queryFn: async () => {
      const staleThreshold = staleThresholdIso();
      const [activeRes, podRes, unassignedRes, staleRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", PENDING_STATUSES as string[]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[]).is("driver_id", null).is("driver_name", null),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[]).lt("updated_at", staleThreshold),
      ]);
      return {
        active: activeRes.count ?? 0,
        podReview: podRes.count ?? 0,
        unassigned: unassignedRes.count ?? 0,
        stale: staleRes.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}
