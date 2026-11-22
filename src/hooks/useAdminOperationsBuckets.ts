/**
 * useAdminOperationsBuckets — Stage 6 dashboard counts.
 *
 * Lightweight queries that match the buckets defined in
 * src/lib/operationsBuckets.ts. We deliberately avoid pulling full
 * inspection/photo trees into the dashboard — the per-job classifier
 * runs in the jobs queue and POD review screens where the data already
 * exists.
 *
 * Honesty rules (fixes to the earlier version):
 *   - A count that could not be computed is `null`, never 0. Callers must
 *     show it as unknown. (Previously a failed query silently read as 0.)
 *   - Id lists are paged past PostgREST's 1,000-row cap, so totals are exact.
 *   - Both invoicing buckets exclude jobs that already have a (non-cancelled)
 *     invoice, via the duplicate-invoice guard `findAlreadyInvoicedJobs` —
 *     the same rule Invoice Prep uses. That lookup fails closed: if it
 *     errors, the bucket is `null`.
 *   - `failed_uploads` is always `null` here: failed uploads are queued on
 *     each driver's device and are not recorded centrally.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchPricingByJobId, type PricingRow } from "@/lib/jobPricingApi";
import { listAcknowledgedEvidenceJobIds } from "@/lib/evidenceAckApi";
import { findAlreadyInvoicedJobs } from "@/features/invoicing/api/createInvoice";

/** A bucket count, or `null` when it could not be computed. */
export type BucketCount = number | null;

export interface OperationsBucketCounts {
  todays_active: BucketCount;
  needs_driver_action: BucketCount;
  needs_admin_review: BucketCount;
  blocked_evidence: BucketCount;
  ready_to_close: BucketCount;
  ready_to_invoice: BucketCount;
  completed_not_invoiced: BucketCount;
  /** Always null: failed uploads live in each device's local queue. */
  failed_uploads: null;
  cancelled_archived: BucketCount;
}

// Every status where the job is with a driver (matches ACTIVE_STATUSES in
// lib/statusConfig; pickup_in_progress was missing, so jobs mid-collection
// were left out of "with drivers" and "today's active").
const DRIVER_STATUSES = [
  "ready_for_pickup",
  "assigned",
  "pickup_in_progress",
  "pickup_complete",
  "in_transit",
  "delivery_in_progress",
];
const ADMIN_REVIEW_STATUSES = ["pod_ready", "delivery_complete", "awaiting_review"];
const TERMINAL_STATUSES = ["completed", "closed"];

/** PostgREST returns at most this many rows per request on Supabase. */
export const ID_PAGE_SIZE = 1000;
/** Job ids per invoice lookup, keeping the request URL short. */
export const INVOICE_LOOKUP_CHUNK = 100;

function todayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

// Supabase's query builder is a deeply generic thenable; these helpers only
// need `count`/`data`/`error` and `range`, so they take a structural type.
type CountResult = { count: number | null; error: { message: string } | null };
type IdsQuery = {
  range: (from: number, to: number) => PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
};

/** A head-count query, or `null` if it failed. */
export async function countOrNull(query: PromiseLike<CountResult>): Promise<BucketCount> {
  const { count, error } = await query;
  if (error) {
    console.warn("[buckets] count query failed", error.message);
    return null;
  }
  return count ?? 0;
}

/**
 * Every id a query matches, paged past the 1,000-row cap. `makeQuery` must
 * build a fresh, deterministically ordered query on each call. Throws on error.
 */
export async function fetchAllIds(makeQuery: () => IdsQuery): Promise<string[]> {
  const ids: string[] = [];
  for (let from = 0; ; from += ID_PAGE_SIZE) {
    const { data, error } = await makeQuery().range(from, from + ID_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    for (const r of page) ids.push(r.id);
    if (page.length < ID_PAGE_SIZE) return ids;
  }
}

/** Which of these jobs already have a non-cancelled invoice. Throws (fails closed) on error. */
export async function invoicedAmong(jobIds: string[]): Promise<Set<string>> {
  const chunks: string[][] = [];
  for (let i = 0; i < jobIds.length; i += INVOICE_LOOKUP_CHUNK) chunks.push(jobIds.slice(i, i + INVOICE_LOOKUP_CHUNK));
  const sets = await Promise.all(chunks.map((c) => findAlreadyInvoicedJobs(c)));
  const out = new Set<string>();
  for (const s of sets) for (const id of s) out.add(id);
  return out;
}

/** Pure: candidates with a total price above zero that are not yet invoiced. */
export function countReadyToInvoice(
  candidateIds: string[],
  totalPriceByJob: ReadonlyMap<string, PricingRow>,
  invoiced: Set<string>,
): number {
  let n = 0;
  for (const id of candidateIds) {
    if (invoiced.has(id)) continue;
    if (Number(totalPriceByJob.get(id)?.total_price) > 0) n++;
  }
  return n;
}

/** Pure: completed jobs that are not on any non-cancelled invoice. */
export function countNotInvoiced(completedIds: string[], invoiced: Set<string>): number {
  let n = 0;
  for (const id of completedIds) if (!invoiced.has(id)) n++;
  return n;
}

/** Run a bucket; any thrown error makes that bucket `null` instead of 0. */
async function orNull(label: string, run: () => Promise<number>): Promise<BucketCount> {
  try {
    return await run();
  } catch (e) {
    console.warn(`[buckets] ${label} could not be counted`, (e as Error).message);
    return null;
  }
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
        countOrNull(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("is_hidden", false)
            .in("status", [...DRIVER_STATUSES, ...ADMIN_REVIEW_STATUSES])
            .gte("job_date", startIso.slice(0, 10))
            .lt("job_date", endIso.slice(0, 10)),
        ),
        // Needs driver action
        countOrNull(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("is_hidden", false)
            .in("status", DRIVER_STATUSES),
        ),
        // Needs admin review
        countOrNull(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .eq("is_hidden", false)
            .in("status", ADMIN_REVIEW_STATUSES),
        ),
        // Blocked by evidence — proxy: review/completed status with a
        // missing pickup or delivery inspection flag. Ids so admin-resolved
        // acks can be subtracted (keeps this tile in sync with the Missing
        // Evidence queue's "Mark resolved" action).
        orNull("blocked_evidence", async () => {
          const ids = await fetchAllIds(() =>
            supabase
              .from("jobs")
              .select("id")
              .eq("is_hidden", false)
              .in("status", [...ADMIN_REVIEW_STATUSES, ...TERMINAL_STATUSES])
              .or("has_pickup_inspection.eq.false,has_delivery_inspection.eq.false")
              .order("id"),
          );
          let dismissed: Set<string> = new Set();
          try {
            dismissed = await listAcknowledgedEvidenceJobIds();
          } catch {
            /* non-fatal: count stays unfiltered (over-reports, never hides) */
          }
          return ids.filter((id) => !dismissed.has(id)).length;
        }),
        // Ready to invoice — completed/closed live jobs with a client, both
        // inspections and a price above zero, that are NOT already invoiced.
        orNull("ready_to_invoice", async () => {
          const ids = await fetchAllIds(() =>
            supabase
              .from("jobs")
              .select("id")
              .eq("is_hidden", false)
              .eq("is_test", false)
              .in("status", TERMINAL_STATUSES)
              .not("client_id", "is", null)
              .eq("has_pickup_inspection", true)
              .eq("has_delivery_inspection", true)
              .order("id"),
          );
          if (ids.length === 0) return 0;
          // Both throw on error: an unknown price or invoice state is never read as zero.
          const [pricing, invoiced] = await Promise.all([fetchPricingByJobId(ids), invoicedAmong(ids)]);
          return countReadyToInvoice(ids, pricing, invoiced);
        }),
        // Completed but not invoiced — completed/closed visible LIVE jobs with
        // no non-cancelled invoice. Test jobs are excluded, as in Invoice Prep,
        // ready_to_invoice and the weekly unbilled figure: they are never
        // invoiced, and on 2026-11-21 they were 56 of the 60 counted here.
        orNull("completed_not_invoiced", async () => {
          const ids = await fetchAllIds(() =>
            supabase
              .from("jobs")
              .select("id")
              .eq("is_hidden", false)
              .eq("is_test", false)
              .in("status", TERMINAL_STATUSES)
              .order("id"),
          );
          if (ids.length === 0) return 0;
          return countNotInvoiced(ids, await invoicedAmong(ids));
        }),
        // Cancelled / archived
        countOrNull(
          supabase
            .from("jobs")
            .select("id", { count: "exact", head: true })
            .or("status.eq.cancelled,is_hidden.eq.true"),
        ),
      ]);

      // Ready to close = admin review minus those blocked by missing inspection.
      const readyToClose =
        needsReview === null || blockedEvidence === null ? null : Math.max(needsReview - blockedEvidence, 0);

      return {
        todays_active: todaysActive,
        needs_driver_action: needsDriver,
        needs_admin_review: needsReview,
        blocked_evidence: blockedEvidence,
        ready_to_close: readyToClose,
        ready_to_invoice: readyToInvoice,
        completed_not_invoiced: completedNotInvoiced,
        failed_uploads: null,
        cancelled_archived: cancelled,
      };
    },
    staleTime: 30_000,
  });
}
