/**
 * Attention Center – data fetching hook.
 * Accepts `scope` to filter by org or show all.
 * Fetches acknowledgements to filter dismissed/snoozed exceptions.
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

export interface AcknowledgementRow {
  id: string;
  exception_id: string;
  job_id: string | null;
  acknowledged_by: string;
  note: string | null;
  snoozed_until: string | null;
  created_at: string;
}

interface UseAttentionDataOpts {
  scope: "org" | "all";
  filters: AttentionFiltersState;
}

export function useAttentionData({ scope, filters }: UseAttentionDataOpts) {
  return useQuery({
    queryKey: ["attention-center", scope, filters],
    queryFn: async () => {
      const todayStart = new Date().toISOString().slice(0, 10) + "T00:00:00";
      const now = new Date().toISOString();

      const [
        activeJobsRes,
        completedJobsRes,
        syncErrorsRes,
        logEntriesRes,
        orgsRes,
        acksRes,
      ] = await Promise.all([
        supabase.from("jobs").select("*")
          .eq("is_hidden", false)
          .in("status", ["ready_for_pickup", "assigned", "pickup_in_progress", "delivery_in_progress", "pod_ready"])
          .order("updated_at", { ascending: false })
          .limit(500),

        supabase.from("jobs").select("*")
          .eq("is_hidden", false)
          .in("status", ["completed", "delivery_complete", "pod_ready"])
          .gte("updated_at", new Date(Date.now() - 7 * 86400_000).toISOString())
          .limit(500),

        supabase.from("sync_errors").select("*")
          .eq("resolved", false)
          .order("created_at", { ascending: false })
          .limit(200),

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

        scope === "all"
          ? supabase.from("organisations").select("id, name")
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),

        // Fetch acknowledgements
        supabase.from("attention_acknowledgements").select("*")
          .order("created_at", { ascending: false }),
      ]);

      const activeJobs = (activeJobsRes.data ?? []) as JobRow[];
      const completedJobs = (completedJobsRes.data ?? []) as JobRow[];
      const syncErrors = (syncErrorsRes.data ?? []) as any[];
      const logEntries = (logEntriesRes.data ?? []) as any[];
      const orgs = (orgsRes as any).data ?? [];
      const acknowledgements = (acksRes.data ?? []) as AcknowledgementRow[];

      // Build ack lookup: exception_id -> ack row (most recent)
      const ackMap = new Map<string, AcknowledgementRow>();
      for (const ack of acknowledgements) {
        if (!ackMap.has(ack.exception_id)) {
          ackMap.set(ack.exception_id, ack);
        }
      }

      // Fetch inspections scoped to completed job IDs
      const completedJobIds = completedJobs.map(j => j.id);
      let inspections: any[] = [];
      if (completedJobIds.length > 0) {
        const chunks: string[][] = [];
        for (let i = 0; i < completedJobIds.length; i += 100) {
          chunks.push(completedJobIds.slice(i, i + 100));
        }
        const results = await Promise.all(
          chunks.map(chunk =>
            supabase.from("inspections")
              .select("id, job_id, org_id, driver_signature_url, customer_signature_url")
              .in("job_id", chunk)
          )
        );
        for (const r of results) {
          if (r.data) inspections.push(...r.data);
        }
      }

      const orgLookup = new Map<string, string>();
      for (const o of orgs) orgLookup.set(o.id, o.name);

      // Derive all exceptions
      let allExceptions: AttentionException[] = sortExceptions([
        ...deriveTimingExceptions(activeJobs, orgLookup),
        ...deriveEvidenceExceptions(completedJobs, inspections, logEntries, orgLookup),
        ...deriveSyncExceptions(syncErrors, logEntries),
        ...deriveStateExceptions(logEntries),
      ]);

      // Separate acknowledged vs active
      const activeExceptions: AttentionException[] = [];
      const acknowledgedExceptions: AttentionException[] = [];

      for (const ex of allExceptions) {
        const ack = ackMap.get(ex.id);
        if (ack) {
          // If snoozed and snooze hasn't expired, treat as acknowledged
          if (ack.snoozed_until && ack.snoozed_until > now) {
            acknowledgedExceptions.push(ex);
          } else if (!ack.snoozed_until) {
            // Permanently acknowledged
            acknowledgedExceptions.push(ex);
          } else {
            // Snooze expired — back to active
            activeExceptions.push(ex);
          }
        } else {
          activeExceptions.push(ex);
        }
      }

      let exceptions = activeExceptions;

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

      // KPIs (based on active only)
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

      return {
        exceptions,
        acknowledgedExceptions,
        acknowledgedCount: acknowledgedExceptions.length,
        kpis,
        orgs,
        ackMap,
      };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
