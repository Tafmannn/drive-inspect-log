/**
 * Data hooks for the Jobs Control Page.
 * Reuses existing Supabase queries, extends for filtering.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES, PENDING_STATUSES, TERMINAL_STATUSES } from "@/lib/statusConfig";
import type { Job } from "@/lib/types";

export type JobControlRow = Pick<
  Job,
  | "id" | "external_job_number" | "vehicle_reg" | "vehicle_make" | "vehicle_model"
  | "status" | "driver_name" | "driver_id" | "pickup_city" | "pickup_postcode"
  | "delivery_city" | "delivery_postcode" | "job_date" | "updated_at"
  | "priority" | "completed_at" | "client_company" | "client_name"
> & {
  /** Resolved driver display name from FK join or legacy driver_name */
  resolvedDriverName: string | null;
};

const ALL_OPERATIONAL = [
  ...ACTIVE_STATUSES,
  ...PENDING_STATUSES,
  "assigned",
  "draft",
  "new",
  "pending",
  "incomplete",
] as string[];

export interface JobsFilter {
  search: string;
  status: "all" | "active" | "pod_review" | "completed" | "unassigned";
}

export function useControlJobs(filter: JobsFilter) {
  return useQuery({
    queryKey: ["control-jobs", filter],
    queryFn: async () => {
      let query = supabase
        .from("jobs")
        .select(
          "id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, status, driver_name, pickup_city, pickup_postcode, delivery_city, delivery_postcode, job_date, updated_at, priority, completed_at, client_company, client_name"
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
        query = query.in("status", ACTIVE_STATUSES as string[]).is("driver_name", null);
      }
      // "all" → no status filter

      query = query.order("updated_at", { ascending: false }).limit(100);

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as JobControlRow[];

      // Client-side search
      if (filter.search.trim()) {
        const s = filter.search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.vehicle_reg?.toLowerCase().includes(s) ||
            r.external_job_number?.toLowerCase().includes(s) ||
            r.client_company?.toLowerCase().includes(s) ||
            r.client_name?.toLowerCase().includes(s) ||
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
    queryKey: ["control-jobs-kpis"],
    queryFn: async () => {
      const [activeRes, podRes, unassignedRes, totalRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", PENDING_STATUSES as string[]),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[]).is("driver_name", null),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false),
      ]);
      return {
        active: activeRes.count ?? 0,
        podReview: podRes.count ?? 0,
        unassigned: unassignedRes.count ?? 0,
        total: totalRes.count ?? 0,
      };
    },
    staleTime: 30_000,
  });
}
