/**
 * useAdminOperationsBuckets — Stage 6 dashboard counts.
 *
 * Lightweight count-only queries that match the buckets defined in
 * src/lib/operationsBuckets.ts. We deliberately avoid pulling full
 * inspection/photo trees into the dashboard — the per-job classifier
 * runs in the jobs queue and POD review screens where the data already
 * exists. Here we use SQL `count` predicates that match the same
 * intent, keeping the dashboard fast.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listAcknowledgedEvidenceJobIds } from "@/lib/evidenceAckApi";

export interface OperationsBucketCounts {
  todays_active: number;
  needs_driver_action: number;
  needs_admin_review: number;
  blocked_evidence: number;
  ready_to_close: number;
  ready_to_invoice: number;
  completed_not_invoiced: number;
  failed_uploads: number;
  cancelled_archived: number;
}

const DRIVER_STATUSES = [
  "ready_for_pickup",
  "assigned",
  "pickup_complete",
  "in_transit",
  "delivery_in_progress",
];
const ADMIN_REVIEW_STATUSES = ["pod_ready", "delivery_complete", "awaiting_review"];
const TERMINAL_STATUSES = ["completed", "closed"];

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

async function safeCount(query: any): Promise<number> {
  const { count, error } = await query;
  if (error) {
    console.warn("[buckets] count query failed", error.message);
    return 0;
  }
  return count ?? 0;
}

export function useAdminOperationsBuckets() {
  return useQuery<OperationsBucketCounts>({
    queryKey: ["admin-operations-buckets"],
    queryFn: async () => {
      const { startIso, endIso } = todayBounds();

      const [
        todaysActive,
        needsDriver,
        needsReview,
        blockedEvidence,
        readyToInvoice,
        completedNotInvoiced,
        cancelled,
      ] = await Promise.all([
        // Today's active = active or under review with job_date today
        safeCount(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("is_hidden", false)
            .in("status", [...DRIVER_STATUSES, ...ADMIN_REVIEW_STATUSES])
            .gte("job_date", startIso.slice(0, 10))
            .lt("job_date", endIso.slice(0, 10)),
        ),
        // Needs driver action
        safeCount(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("is_hidden", false)
            .in("status", DRIVER_STATUSES),
        ),
        // Needs admin review
        safeCount(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("is_hidden", false)
            .in("status", ADMIN_REVIEW_STATUSES),
        ),
        // Blocked by evidence — proxy: review/completed status with a
        // missing pickup or delivery inspection flag. Returns ids so we
        // can subtract admin-resolved acks below (keeps this tile in
        // sync with the Missing Evidence queue's "Mark resolved" action).
        (async () => {
          const { data, error } = await supabase
            .from("jobs")
            .select("id")
            .eq("is_hidden", false)
            .in("status", [...ADMIN_REVIEW_STATUSES, ...TERMINAL_STATUSES])
            .or(
              "has_pickup_inspection.eq.false,has_delivery_inspection.eq.false",
            );
          if (error) {
            console.warn("[buckets] blocked_evidence query failed", error.message);
            return 0;
          }
          const ids = (data ?? []).map((r) => r.id as string);
          let dismissed: Set<string> = new Set();
          try {
            dismissed = await listAcknowledgedEvidenceJobIds();
          } catch {
            /* non-fatal */
          }
          return ids.filter((id) => !dismissed.has(id)).length;
        })(),
        // Ready to invoice — completed/closed, with price and client and
        // both inspections present. We don't try to filter "not yet
        // invoiced" here (requires invoice_items join); the finance page
        // owns the strict gate.
        safeCount(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("is_hidden", false)
            .in("status", TERMINAL_STATUSES)
            .gt("total_price", 0)
            .not("client_id", "is", null)
            .eq("has_pickup_inspection", true)
            .eq("has_delivery_inspection", true),
        ),
        // Completed but not invoiced — proxy via pdf_url null is unreliable;
        // we use total completed without pdf_url as the visible signal.
        safeCount(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("is_hidden", false)
            .in("status", TERMINAL_STATUSES)
            .is("pod_pdf_url", null),
        ),
        // Cancelled / archived
        safeCount(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .or("status.eq.cancelled,is_hidden.eq.true"),
        ),
      ]);

      // Ready to close = admin review minus those blocked by missing inspection.
      const readyToClose = Math.max(needsReview - blockedEvidence, 0);

      return {
        todays_active: todaysActive,
        needs_driver_action: needsDriver,
        needs_admin_review: needsReview,
        blocked_evidence: blockedEvidence,
        ready_to_close: readyToClose,
        ready_to_invoice: readyToInvoice,
        completed_not_invoiced: completedNotInvoiced,
        failed_uploads: 0, // surfaced from the local pendingUploads queue UI
        cancelled_archived: cancelled,
      };
    },
    staleTime: 30_000,
  });
}
