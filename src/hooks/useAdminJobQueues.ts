/**
 * Data hook for the Admin Jobs Queue page (mobile-first).
 * Fetches all operational jobs and groups them into dispatch queues.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_STATUSES, PENDING_STATUSES, TERMINAL_STATUSES } from "@/lib/statusConfig";
import { isJobStale } from "@/features/control/pages/jobs/jobsUtils";
import type { AdminJobRow } from "@/components/AdminJobCard";

const STALE_HOURS = 24;

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
    queryKey: ["admin-job-queues"],
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

      // Resolve driver names
      const rows: AdminJobRow[] = (data ?? []).map((r: any) => {
        const profile = r.driver_profiles;
        return {
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
          resolvedDriverName: profile
            ? (profile.display_name || profile.full_name || r.driver_name)
            : (r.driver_name || null),
        };
      });

      // Group into queues
      const queues: AdminJobQueues = {
        needsAttention: [],
        unassigned: [],
        inProgress: [],
        review: [],
        completed: [],
        missingEvidence: [],
      };

      for (const row of rows) {
        const isActive = (ACTIVE_STATUSES as string[]).includes(row.status) || row.status === "assigned";
        const isPending = (PENDING_STATUSES as string[]).includes(row.status);
        const isTerminal = (TERMINAL_STATUSES as string[]).includes(row.status);
        const isNoDriver = !row.resolvedDriverName;
        const stale = isJobStale(row);

        // Needs Attention: stale OR unassigned active jobs
        if (isActive && (stale || isNoDriver)) {
          queues.needsAttention.push(row);
        }

        // Unassigned: active with no driver (may overlap needsAttention)
        if (isActive && isNoDriver) {
          queues.unassigned.push(row);
        }

        // In Progress: active jobs with a driver
        if (isActive && !isNoDriver) {
          queues.inProgress.push(row);
        }

        // Review: POD-pending statuses
        if (isPending) {
          queues.review.push(row);
        }

        // Completed: terminal (show last 20)
        if (isTerminal) {
          queues.completed.push(row);
        }

        // Missing Evidence: completed/delivered jobs missing inspections (last 7 days)
        if (
          (isTerminal || isPending) &&
          (!row.has_pickup_inspection || !row.has_delivery_inspection)
        ) {
          const weekAgo = Date.now() - 7 * 86400_000;
          if (new Date(row.updated_at).getTime() > weekAgo) {
            queues.missingEvidence.push(row);
          }
        }
      }

      // Cap completed to recent
      queues.completed = queues.completed.slice(0, 20);

      return queues;
    },
    staleTime: 20_000,
  });
}

export function useAdminJobQueueKpis() {
  return useQuery({
    queryKey: ["admin-job-queue-kpis"],
    queryFn: async () => {
      const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();
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
