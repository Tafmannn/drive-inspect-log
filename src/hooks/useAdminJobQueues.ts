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
import { listAcknowledgedEvidenceJobIds } from "@/lib/evidenceAckApi";
import type { JobControlRow } from "@/features/control/hooks/useControlJobsData";

/** Queue rows share the list row shape, so either can feed the jobs table or card. */
export type QueueJobRow = JobControlRow;
type AdminJobRow = QueueJobRow;

export interface AdminJobQueues {
  needsAttention: AdminJobRow[];
  unassigned: AdminJobRow[];
  inProgress: AdminJobRow[];
  review: AdminJobRow[];
  completed: AdminJobRow[];
  missingEvidence: AdminJobRow[];
  /**
   * True when the underlying fetch (ordered most-recently-updated first,
   * capped at 300) hit its limit. Older, longer-untouched jobs sort last and
   * are the first to be dropped — exactly the stale/unassigned/review jobs
   * these queues exist to surface — so this signals every bucket below may
   * be missing rows even though the KPI tiles above stay accurate.
   */
  truncated: boolean;
}

export function useAdminJobQueues() {
  return useQuery({
    queryKey: qk.jobs.adminQueues(),
    queryFn: async () => {
      // Fetch all non-hidden jobs with driver profile join
      const { data, error } = await supabase
        .from("jobs")
        .select(
          "id, external_job_number, vehicle_reg, vehicle_make, vehicle_model, status, driver_id, driver_name, pickup_city, pickup_postcode, delivery_city, delivery_postcode, job_date, updated_at, priority, completed_at, client_company, client_name, has_pickup_inspection, has_delivery_inspection, driver_profiles(display_name, full_name)"
        )
        .eq("is_hidden", false)
        .order("updated_at", { ascending: false })
        .limit(300);

      if (error) throw error;

      // Resolve driver names using the shared selector
      const rows: AdminJobRow[] = (data ?? []).map((r: any) => ({
        ...r,
        driver_profiles: undefined, // strip join artifact
        resolvedDriverName: resolveDriverName(r),
      }));

      // Group via shared selector — guarantees same definitions as Control Jobs
      const queues = groupJobsByQueue(rows);

      // Filter out jobs whose missing-evidence blocker has been explicitly
      // dismissed by an admin. Read-only failure is non-fatal — the queue
      // still renders the unfiltered list rather than crashing.
      try {
        const dismissed = await listAcknowledgedEvidenceJobIds();
        if (dismissed.size > 0) {
          queues.missingEvidence = queues.missingEvidence.filter((j) => !dismissed.has(j.id));
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[useAdminJobQueues] could not load evidence acks", e);
      }

      // Cap completed to recent
      queues.completed = queues.completed.slice(0, 20);

      return {
        ...queues,
        truncated: (data ?? []).length >= 300,
      } as AdminJobQueues;
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
      // A failed count is `null` (unknown), never 0: a silent zero would
      // read as "nothing unassigned / nothing to review".
      const n = (label: string, r: { count: number | null; error: { message: string } | null }): number | null => {
        if (r.error) {
          console.warn(`[kpis] ${label} count failed`, r.error.message);
          return null;
        }
        return r.count ?? 0;
      };
      return {
        active: n("active", activeRes),
        podReview: n("podReview", podRes),
        unassigned: n("unassigned", unassignedRes),
        stale: n("stale", staleRes),
      };
    },
    staleTime: 30_000,
  });
}
