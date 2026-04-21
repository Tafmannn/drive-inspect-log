/**
 * Data hooks for the Jobs Control Page.
 * Reuses existing Supabase queries, extends for filtering.
 *
 * Driver-name resolution and stale/unassigned predicates are delegated to
 * `@/features/jobs/selectors` so the desktop Control surface and the mobile
 * Admin Jobs Queue cannot drift in their definitions of these concepts.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES, PENDING_STATUSES, TERMINAL_STATUSES } from "@/lib/statusConfig";
import { qk } from "@/lib/queryKeys";
import { resolveDriverName, staleThresholdIso } from "@/features/jobs/selectors";
import type { Job } from "@/lib/types";

export type JobControlRow = Pick<
  Job,
  | "id" | "external_job_number" | "vehicle_reg" | "vehicle_make" | "vehicle_model"
  | "status" | "driver_name" | "pickup_city" | "pickup_postcode"
  | "delivery_city" | "delivery_postcode" | "job_date" | "updated_at"
  | "priority" | "completed_at" | "client_company" | "client_name"
  | "has_pickup_inspection" | "has_delivery_inspection"
> & {
  /** FK to driver_profiles if set */
  driver_id: string | null;
  /** Resolved driver display name from FK join or legacy driver_name */
  resolvedDriverName: string | null;
};

export interface JobsFilter {
  search: string;
  status: "all" | "active" | "pod_review" | "completed" | "unassigned" | "stale";
  sort?: "updated" | "date";
}

export function useControlJobs(filter: JobsFilter) {
  return useQuery({
    queryKey: qk.jobs.controlList(filter),
    queryFn: async () => {
      // Select with FK join to driver_profiles for resolved name + inspection flags
      let query = supabase
        .from("jobs")
        .select(
          "id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, status, driver_id, driver_name, pickup_city, pickup_postcode, delivery_city, delivery_postcode, job_date, updated_at, priority, completed_at, client_company, client_name, has_pickup_inspection, has_delivery_inspection, driver_profiles(display_name, full_name)"
        )
        .eq("is_hidden", false);

      // Status filtering
      if (filter.status === "active") {
        query = query.in("status", ACTIVE_STATUSES as string[]);
      } else if (filter.status === "pod_review") {
        query = query.in("status", PENDING_STATUSES as string[]);
      } else if (filter.status === "completed") {
        query = query.in("status", TERMINAL_STATUSES as string[]);
      } else if (filter.status === "unassigned") {
        query = query.in("status", ACTIVE_STATUSES as string[]).is("driver_id", null).is("driver_name", null);
      } else if (filter.status === "stale") {
        // Stale = active + not updated within threshold. Filter server-side as much as possible.
        query = query.in("status", ACTIVE_STATUSES as string[]).lt("updated_at", staleThresholdIso());
      }

      // Sort order
      const sortCol = filter.sort === "date" ? "job_date" : "updated_at";
      query = query.order(sortCol, { ascending: false }).limit(200);

      const { data, error } = await query;
      if (error) throw error;

      // Resolve driver display name via shared selector (single source of truth).
      let rows: JobControlRow[] = (data ?? []).map((r: any) => ({
        ...r,
        driver_profiles: undefined, // strip join artifact
        resolvedDriverName: resolveDriverName(r),
      }));

      // Client-side search — search resolved name too
      if (filter.search.trim()) {
        const s = filter.search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.vehicle_reg?.toLowerCase().includes(s) ||
            r.external_job_number?.toLowerCase().includes(s) ||
            r.client_company?.toLowerCase().includes(s) ||
            r.client_name?.toLowerCase().includes(s) ||
            r.resolvedDriverName?.toLowerCase().includes(s) ||
            r.driver_name?.toLowerCase().includes(s) ||
            r.pickup_postcode?.toLowerCase().includes(s) ||
            r.delivery_postcode?.toLowerCase().includes(s) ||
            r.pickup_city?.toLowerCase().includes(s) ||
            r.delivery_city?.toLowerCase().includes(s)
        );
      }

      return rows;
    },
    staleTime: 20_000,
  });
}

export function useJobsKpis() {
  return useQuery({
    queryKey: qk.jobs.controlKpis(),
    queryFn: async () => {
      const staleThreshold = staleThresholdIso();
      const [activeRes, podRes, unassignedRes, staleRes, totalRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", PENDING_STATUSES as string[]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[]).is("driver_id", null).is("driver_name", null),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[]).lt("updated_at", staleThreshold),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false),
      ]);
      return {
        active: activeRes.count ?? 0,
        podReview: podRes.count ?? 0,
        unassigned: unassignedRes.count ?? 0,
        stale: staleRes.count ?? 0,
        total: totalRes.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}
