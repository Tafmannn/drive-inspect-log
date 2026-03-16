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
 *   - driver_name               → Assignment state
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
 * ── NOT DERIVED (would require data not currently available) ─────────
 *   - "proof complete"          → No composite evidence-verified flag exists
 *   - "signature validated"     → Requires inspection join, not done here
 *   - "review passed"           → No review workflow/state exists
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { JOB_STATUS } from "@/lib/statusConfig";
import type { Job } from "@/lib/types";

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
  | "client_company" | "client_name" | "pickup_postcode"
> & {
  /** Derived: pickup inspection missing on a closure-stage job */
  missingPickupInspection: boolean;
  /** Derived: delivery inspection missing on a closure-stage job */
  missingDeliveryInspection: boolean;
  /** Derived: item has been in current state longer than STALE_HOURS */
  isStale: boolean;
  /** Which band this item belongs to */
  band: "review_queue" | "recently_completed";
};

export interface ClosureKpis {
  reviewQueue: number;
  podReady: number;
  deliveryComplete: number;
  completedRecent: number;
  missingEvidence: number;
}

const SELECT_FIELDS = [
  "id", "external_job_number", "vehicle_reg", "vehicle_make", "vehicle_model",
  "status", "driver_name", "delivery_city", "delivery_postcode",
  "updated_at", "completed_at", "has_pickup_inspection", "has_delivery_inspection",
  "client_company", "client_name", "pickup_postcode",
].join(", ");

// ── Derivation ───────────────────────────────────────────────────────

function deriveRow(job: any, band: ClosureReviewRow["band"]): ClosureReviewRow {
  const hoursInState = (Date.now() - new Date(job.updated_at).getTime()) / 3_600_000;
  return {
    ...job,
    band,
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
          .limit(100),
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

      const queueRows = (queueRes.data ?? []).map(j => deriveRow(j, "review_queue"));
      const recentRows = (recentRes.data ?? []).map(j => deriveRow(j, "recently_completed"));

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
        // Missing evidence = closure-stage jobs without delivery inspection
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
        missingEvidence: missingEvidenceRes.count ?? 0,
      } satisfies ClosureKpis;
    },
    staleTime: 30_000,
  });
}
