/**
 * Closure-State Derivation Layer
 * 
 * PURPOSE: Deterministic identification of jobs in a reviewable late-stage state.
 * This is the single source of truth for what constitutes a "closure-review" item.
 *
 * ── QUEUE RULES ──────────────────────────────────────────────────────
 *
 * REVIEWABLE STATUSES (jobs actively needing closure review):
 *   - pod_ready        → POD generated, awaiting admin sign-off
 *   - delivery_complete → Delivery done, may still need POD generation or review
 *
 * RECENTLY CLOSED (completed within REVIEW_WINDOW_DAYS, shown as secondary):
 *   - completed         → Fully closed, but recent enough to warrant quick audit
 *
 * EXCLUDED STATUSES (and why):
 *   - draft/new/pending/incomplete → Too early in lifecycle
 *   - ready_for_pickup/assigned/pickup_in_progress/pickup_complete/in_transit/delivery_in_progress → Active operations, not closure
 *   - failed/archived/cancelled → Terminal, not reviewable
 *
 * ── CANONICAL FIELDS USED ────────────────────────────────────────────
 *   - status                    → Queue membership
 *   - completed_at              → Recency for recently-closed items
 *   - updated_at                → Staleness / age calculation
 *   - driver_id + driver_profiles → Assignment state (FK-preferred, driver_name fallback)
 *   - has_pickup_inspection      → Evidence completeness (canonical)
 *   - has_delivery_inspection    → Evidence completeness (canonical)
 *   - delivery_city, delivery_postcode → Location context
 *   - external_job_number, vehicle_reg, vehicle_make, vehicle_model → Identity
 *
 * ── DERIVED SIGNALS (secondary, not authoritative) ───────────────────
 *   - missingPickupInspection   → has_pickup_inspection === false on a closure-stage job
 *   - missingDeliveryInspection → has_delivery_inspection === false on a closure-stage job
 *   - isStale                   → updated_at older than STALE_HOURS threshold
 *   - These are UI annotations only; they do not change queue membership.
 *
 *   - hasCustomerSignature / hasDriverSignature → from the latest active
 *     (non-archived) delivery inspection's persisted signature URLs
 *   - evidence                  → "missing_inspection" | "missing_signatures" | "complete"
 *     (partitions the review queue; used by the grouped default view)
 *
 * ── NOT DERIVED (would require data not currently available) ─────────
 *   - "review passed"           → No review workflow/state exists
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUS } from "@/lib/statusConfig";
import type { Job } from "@/lib/types";
import { matchesJobSearch } from "../pages/jobs/jobsView";

// ── Configuration ────────────────────────────────────────────────────

/** How many days back to include recently-completed jobs in the review surface */
const REVIEW_WINDOW_DAYS = 7;

/** Hours after which a reviewable item is considered stale */
const STALE_HOURS = 4;

/** Statuses that form the active review queue */
export const CLOSURE_REVIEW_STATUSES = [
  JOB_STATUS.POD_READY,
  JOB_STATUS.DELIVERY_COMPLETE,
] as const;

/** Recently-completed status for secondary audit band */
const RECENTLY_COMPLETED_STATUS = JOB_STATUS.COMPLETED;

// ── Types ────────────────────────────────────────────────────────────

export type ClosureReviewRow = Pick<
  Job,
  | "id" | "external_job_number" | "vehicle_reg" | "vehicle_make" | "vehicle_model"
  | "status" | "driver_name" | "delivery_city" | "delivery_postcode"
  | "updated_at" | "completed_at" | "has_pickup_inspection" | "has_delivery_inspection"
  | "client_company" | "client_name" | "pickup_postcode" | "pickup_city"
> & {
  /** FK to driver_profiles if set */
  driver_id: string | null;
  /** Resolved driver display name from FK join or legacy driver_name */
  resolvedDriverName: string | null;
  /** Derived: pickup inspection missing on a closure-stage job */
  missingPickupInspection: boolean;
  /** Derived: delivery inspection missing on a closure-stage job */
  missingDeliveryInspection: boolean;
  /** Derived: item has been in current state longer than STALE_HOURS */
  isStale: boolean;
  /** Which band this item belongs to */
  band: "review_queue" | "recently_completed";
  /** Latest active delivery inspection has a customer signature */
  hasCustomerSignature: boolean;
  /** Latest active delivery inspection has a driver signature */
  hasDriverSignature: boolean;
  /** Evidence state: no delivery inspection, signatures missing, or complete */
  evidence: EvidenceState;
};

export type EvidenceState = "missing_inspection" | "missing_signatures" | "complete";

export interface ClosureKpis {
  reviewQueue: number;
  podReady: number;
  deliveryComplete: number;
  completedRecent: number;
  missingDeliveryInspection: number;
}

export type ClosureStatusFilter =
  | "all"
  | "pod_ready"
  | "delivery_complete"
  | "missing_delivery_inspection"
  | "missing_signatures"
  | "ready"
  | "recently_completed";

/** Evidence state for a closure-stage job (pure; tested). */
export function evidenceState(row: {
  has_delivery_inspection: boolean | null;
  hasCustomerSignature: boolean;
  hasDriverSignature: boolean;
}): EvidenceState {
  if (!row.has_delivery_inspection) return "missing_inspection";
  if (!row.hasCustomerSignature || !row.hasDriverSignature) return "missing_signatures";
  return "complete";
}

export interface ClosureReviewData {
  queue: ClosureReviewRow[];
  recentlyCompleted: ClosureReviewRow[];
}

/**
 * Pure row-selection for the POD Review surface.
 *
 * The default "all" view is the *Review Queue* — jobs actively requiring
 * review (pod_ready / delivery_complete) only. Recently-completed jobs are
 * already actioned and are surfaced exclusively under the "recently_completed"
 * filter; they must never leak into the "all" view, otherwise the queue reads
 * as populated (and mislabelled "requiring review") even after everything has
 * been closed out — the exact mismatch where the Review Queue KPI shows 0 but
 * the list still renders rows.
 */
export function selectClosureRows(
  data: ClosureReviewData | undefined | null,
  statusFilter: ClosureStatusFilter,
  search = "",
): ClosureReviewRow[] {
  if (!data) return [];

  let rows: ClosureReviewRow[];
  if (statusFilter === "recently_completed") {
    rows = data.recentlyCompleted;
  } else if (statusFilter === "pod_ready") {
    rows = data.queue.filter(r => r.status === "pod_ready");
  } else if (statusFilter === "delivery_complete") {
    rows = data.queue.filter(r => r.status === "delivery_complete");
  } else if (statusFilter === "missing_delivery_inspection") {
    rows = data.queue.filter(r => r.missingDeliveryInspection);
  } else if (statusFilter === "missing_signatures") {
    rows = data.queue.filter(r => r.evidence === "missing_signatures");
  } else if (statusFilter === "ready") {
    rows = data.queue.filter(r => r.evidence === "complete");
  } else {
    rows = data.queue;
  }

  if (search.trim()) rows = rows.filter(r => matchesJobSearch(r, search));

  return rows;
}

const SELECT_FIELDS = [
  "id", "external_job_number", "vehicle_reg", "vehicle_make", "vehicle_model",
  "status", "driver_id", "driver_name", "delivery_city", "delivery_postcode",
  "updated_at", "completed_at", "has_pickup_inspection", "has_delivery_inspection",
  "client_company", "client_name", "pickup_postcode", "pickup_city",
  "driver_profiles(display_name, full_name)",
].join(", ");

// ── Derivation ───────────────────────────────────────────────────────

type SignatureMap = Record<string, { customer: boolean; driver: boolean }>;

function hasPersistedSignature(url: string | null | undefined): boolean {
  return typeof url === "string" && url.trim().length > 0;
}

/** Latest active delivery inspection per job → which signatures are on file. */
export function buildSignatureMap(
  inspections: Array<{
    job_id: string;
    customer_signature_url: string | null;
    driver_signature_url: string | null;
    inspected_at: string | null;
    created_at: string | null;
  }>,
): SignatureMap {
  const latest: Record<string, { customer: boolean; driver: boolean; ts: number }> = {};
  for (const insp of inspections) {
    const ts = Date.parse(insp.inspected_at ?? insp.created_at ?? "") || 0;
    const existing = latest[insp.job_id];
    if (!existing || ts >= existing.ts) {
      latest[insp.job_id] = {
        customer: hasPersistedSignature(insp.customer_signature_url),
        driver: hasPersistedSignature(insp.driver_signature_url),
        ts,
      };
    }
  }
  const out: SignatureMap = {};
  for (const [id, v] of Object.entries(latest)) out[id] = { customer: v.customer, driver: v.driver };
  return out;
}

function deriveRow(job: any, band: ClosureReviewRow["band"], sigs: SignatureMap = {}): ClosureReviewRow {
  const hoursInState = (Date.now() - new Date(job.updated_at).getTime()) / 3_600_000;
  const profile = job.driver_profiles;
  const resolvedDriverName = profile
    ? (profile.display_name || profile.full_name || job.driver_name)
    : (job.driver_name || null);
  const hasCustomerSignature = sigs[job.id]?.customer ?? false;
  const hasDriverSignature = sigs[job.id]?.driver ?? false;
  return {
    ...job,
    driver_profiles: undefined, // strip join artifact
    resolvedDriverName,
    band,
    hasCustomerSignature,
    hasDriverSignature,
    evidence: evidenceState({ has_delivery_inspection: job.has_delivery_inspection, hasCustomerSignature, hasDriverSignature }),
    missingPickupInspection: !job.has_pickup_inspection,
    missingDeliveryInspection: !job.has_delivery_inspection,
    isStale: hoursInState > STALE_HOURS,
  };
}

// ── Hooks ────────────────────────────────────────────────────────────

export function useClosureReviewQueue() {
  return useQuery({
    queryKey: ["closure-review-queue"],
    queryFn: async () => {
      const reviewCutoff = new Date();
      reviewCutoff.setDate(reviewCutoff.getDate() - REVIEW_WINDOW_DAYS);

      // Two parallel queries: active review queue + recently completed
      const [queueRes, recentRes] = await Promise.all([
        supabase
          .from("jobs")
          .select(SELECT_FIELDS)
          .eq("is_hidden", false)
          .in("status", CLOSURE_REVIEW_STATUSES as unknown as string[])
          .order("updated_at", { ascending: true }) // oldest first = most urgent
          .limit(150),
        supabase
          .from("jobs")
          .select(SELECT_FIELDS)
          .eq("is_hidden", false)
          .eq("status", RECENTLY_COMPLETED_STATUS)
          .gte("completed_at", reviewCutoff.toISOString())
          .order("completed_at", { ascending: false })
          .limit(50),
      ]);

      if (queueRes.error) throw queueRes.error;
      if (recentRes.error) throw recentRes.error;

      // Signature status from active delivery inspections. Archived inspections
      // (from a run before a reopen) never count. A failed read is non-fatal:
      // rows then show "missing signatures", which errs on the side of review.
      const jobIds = [...(queueRes.data ?? []), ...(recentRes.data ?? [])].map((j) => (j as unknown as { id: string }).id);
      let sigs: SignatureMap = {};
      if (jobIds.length > 0) {
        const { data: inspections, error: inspErr } = await supabase
          .from("inspections")
          .select("job_id, customer_signature_url, driver_signature_url, inspected_at, created_at, archived_at")
          .eq("type", "delivery")
          .in("job_id", jobIds)
          .is("archived_at", null);
        if (inspErr) {
          console.warn("[useClosureReviewQueue] could not load delivery signatures", inspErr);
        } else {
          sigs = buildSignatureMap(inspections ?? []);
        }
      }

      const queueRows = (queueRes.data ?? []).map(j => deriveRow(j, "review_queue", sigs));
      const recentRows = (recentRes.data ?? []).map(j => deriveRow(j, "recently_completed", sigs));

      return { queue: queueRows, recentlyCompleted: recentRows };
    },
    staleTime: 20_000,
  });
}

export function useClosureKpis() {
  return useQuery({
    queryKey: ["closure-review-kpis"],
    queryFn: async () => {
      const reviewCutoff = new Date();
      reviewCutoff.setDate(reviewCutoff.getDate() - REVIEW_WINDOW_DAYS);

      const [podReadyRes, delCompleteRes, completedRes, missingEvidenceRes] = await Promise.all([
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).eq("status", JOB_STATUS.POD_READY),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).eq("status", JOB_STATUS.DELIVERY_COMPLETE),
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false).eq("status", RECENTLY_COMPLETED_STATUS)
          .gte("completed_at", reviewCutoff.toISOString()),
        // Missing delivery inspection on closure-stage jobs
        supabase.from("jobs").select("id", { count: "exact", head: true })
          .eq("is_hidden", false)
          .in("status", CLOSURE_REVIEW_STATUSES as unknown as string[])
          .eq("has_delivery_inspection", false),
      ]);

      const podReady = podReadyRes.count ?? 0;
      const deliveryComplete = delCompleteRes.count ?? 0;

      return {
        reviewQueue: podReady + deliveryComplete,
        podReady,
        deliveryComplete,
        completedRecent: completedRes.count ?? 0,
        missingDeliveryInspection: missingEvidenceRes.count ?? 0,
      } satisfies ClosureKpis;
    },
    staleTime: 30_000,
  });
}
