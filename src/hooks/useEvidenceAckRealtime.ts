/**
 * Realtime subscription on `attention_acknowledgements`.
 *
 * Why: the Admin Jobs queue and KPI counters derive "Missing Evidence"
 * visibility from this table (see `evidenceAckApi.ts`). Without a live
 * subscription, an ack made by another admin (or a backend job) only
 * surfaced after a manual refresh / refocus. This hook bridges that gap
 * by invalidating every admin operational queue the moment any row in
 * `attention_acknowledgements` changes.
 *
 * Channel scope: the table is small and admin-scoped via RLS, so we
 * subscribe to all events. The handler is debounced via React Query's
 * own invalidation coalescing — multiple rapid changes collapse into a
 * single refetch per query key.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateAdminOperationalQueues } from "@/lib/mutationEvents";
import { qk } from "@/lib/queryKeys";

const isDev = typeof import.meta !== "undefined" && (import.meta as any).env?.DEV;

export function useEvidenceAckRealtime(enabled: boolean = true) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel("attention-acks-admin-queues")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attention_acknowledgements" },
        (payload) => {
          if (isDev) {
            // eslint-disable-next-line no-console
            console.debug("[useEvidenceAckRealtime] change", payload.eventType);
          }
          // Bust admin operational queues + the mobile admin buckets/KPIs that
          // are derived from these acks.
          invalidateAdminOperationalQueues(qc);
          qc.invalidateQueries({ queryKey: qk.jobs.adminQueues() });
          qc.invalidateQueries({ queryKey: qk.jobs.adminQueueKpis() });
          qc.invalidateQueries({ queryKey: qk.attention.all });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
