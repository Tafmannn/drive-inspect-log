/**
 * Attention Center – data fetching hook.
 * Accepts `scope` to filter by org or show all.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  deriveTimingExceptions,
  deriveEvidenceExceptions,
  deriveSyncExceptions,
  deriveStateExceptions,
  sortExceptions,
} from "../engine/exceptionEngine";
import type { AttentionException, AttentionKpiData, AttentionFiltersState } from "../types/exceptionTypes";
import { ACTIVE_STATUSES } from "@/lib/statusConfig";
import type { Tables } from "@/integrations/supabase/types";

type JobRow = Tables<"jobs">;

interface UseAttentionDataOpts {
  /** "all" for super admin, or org-scoped automatically via RLS */
  scope: "org" | "all";
  filters: AttentionFiltersState;
}

export function useAttentionData({ scope, filters }: UseAttentionDataOpts) {
  return useQuery({
    queryKey: ["attention-center", scope, filters],
    queryFn: async () => {
      const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00";

      // Parallel data fetch
      const [
        activeJobsRes,
        completedJobsRes,
        inspectionsRes,
        syncErrorsRes,
        logEntriesRes,
        orgsRes,
      ] = await Promise.all([
        // Active jobs for timing exceptions
        supabase.from("jobs").select("*")
          .eq("is_hidden", false)
          .in("status", ["ready_for_pickup", "assigned", "pickup_in_progress", "delivery_in_progress", "pod_ready"])
          .order("updated_at", { ascending: false })
          .limit(500),

        // Recently completed jobs for evidence exceptions (last 7 days)
        supabase.from("jobs").select("*")
          .eq("is_hidden", false)
          .in("status", ["completed", "delivery_complete", "pod_ready"])
          .gte("updated_at", new Date(Date.now() - 7 * 86400_000).toISOString())
          .limit(500),

        // Inspections for completed jobs
        supabase.from("inspections").select("id, job_id, org_id, driver_signature_url, customer_signature_url")
          .gte("created_at", new Date(Date.now() - 7 * 86400_000).toISOString())
          .limit(1000),

        // Unresolved sync errors
        supabase.from("sync_errors").select("*")
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .limit(200),

        // Recent client log events (today's logs for state/evidence)
        supabase.from("client_logs").select("event, job_id, created_at, context, severity")
          .in("event", [
            "signature_resolve_failed",
            "photo_upload_failed",
            "upload_failed",
            "blocked_status_transition",
            "blocked_inspection_resubmit",
            "duplicate_job_skipped",
          ])
          .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
          .order("created_at", { ascending: false })
          .limit(500),

        // Orgs for super admin scope
        scope === "all"
          ? supabase.from("organisations").select("id, name")
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);

      const activeJobs = (activeJobsRes.data ?? []) as Job[];
      const completedJobs = (completedJobsRes.data ?? []) as Job[];
      const inspections = inspectionsRes.data ?? [];
      const syncErrors = (syncErrorsRes.data ?? []) as any[];
      const logEntries = (logEntriesRes.data ?? []) as any[];
      const orgs = (orgsRes as any).data ?? [];

      const orgLookup = new Map<string, string>();
      for (const o of orgs) orgLookup.set(o.id, o.name);

      // Derive all exceptions
      let exceptions: AttentionException[] = sortExceptions([
        ...deriveTimingExceptions(activeJobs, orgLookup),
        ...deriveEvidenceExceptions(completedJobs, inspections, logEntries, orgLookup),
        ...deriveSyncExceptions(syncErrors, logEntries),
        ...deriveStateExceptions(logEntries),
      ]);

      // Apply filters
      if (filters.severity !== "all") {
        exceptions = exceptions.filter(e => e.severity === filters.severity);
      }
      if (filters.category !== "all") {
        exceptions = exceptions.filter(e => e.category === filters.category);
      }
      if (filters.orgId !== "all" && scope === "all") {
        exceptions = exceptions.filter(e => e.orgId === filters.orgId);
      }
      if (filters.dateFrom) {
        exceptions = exceptions.filter(e => e.createdAt >= filters.dateFrom);
      }
      if (filters.dateTo) {
        exceptions = exceptions.filter(e => e.createdAt <= filters.dateTo + "T23:59:59");
      }

      // KPIs
      const allActiveCount = (await supabase.from("jobs").select("id", { count: "exact", head: true }).eq("is_hidden", false).in("status", ACTIVE_STATUSES as string[])).count ?? 0;
      const uploadFailuresToday = logEntries.filter(l =>
        (l.event === "photo_upload_failed" || l.event === "upload_failed") && l.created_at >= todayStart
      ).length;
      const syncErrorsToday = syncErrors.filter(s => s.created_at >= todayStart).length;

      const kpis: AttentionKpiData = {
        activeJobs: allActiveCount,
        highSeverity: exceptions.filter(e => e.severity === "critical" || e.severity === "high").length,
        missingSignatures: exceptions.filter(e => e.title.includes("Missing") && e.title.includes("signature")).length,
        uploadFailuresToday,
        syncErrorsToday,
      };

      return { exceptions, kpis, orgs };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
