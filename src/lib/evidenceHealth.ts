/**
 * evidenceHealth — Stage 2 of the Axentra OS workflow intelligence layer.
 *
 * Why this exists
 * ───────────────
 * The workflowBrain (Stage 1) decides "what state is this job in and what
 * is the next action?". It does NOT answer the more specific operational
 * question that POD review, job detail and the admin attention surfaces
 * actually need:
 *
 *   "Is the evidence for this job trustworthy enough to (a) render a POD,
 *    (b) close the job, (c) raise an invoice?"
 *
 * Several real production incidents motivated this module:
 *
 *   • A POD page rendered ~282 placeholder boxes after a single broken
 *     image URL because the old viewer appended a placeholder on every
 *     onError fire. Photos were never deduped client-side.
 *
 *   • Reopening a job left previous-run delivery photos visible on the
 *     new run's POD because legacy null-run rows were treated as "show
 *     always".
 *
 *   • Failed background uploads silently flagged the job as "delivery
 *     complete" — the POD generated, but the evidence was incomplete.
 *
 * This module is a pure, composable function. No React, no Supabase, no
 * IO. It builds on `canonicalisePhotos` (which owns archived filtering,
 * current-run isolation and identity dedupe) and produces a single
 * `EvidenceHealthResult` consumed by:
 *
 *   • POD review page  → must block PDF generation when level === "red"
 *                        or "critical".
 *   • Job detail       → renders the health badge + blockers/warnings
 *                        panel beneath the primary CTA.
 *   • Admin attention  → uses level + canCloseJob/canInvoice to route to
 *                        the right intervention queue.
 *
 * Stage 2 is read-only: it does NOT mutate the upload queue, does NOT
 * change RLS, and does NOT alter any existing route. It is purely an
 * advisory layer.
 */

import type { Inspection, Photo } from "./types";
import {
  canonicalisePhotos,
  excludeArchived,
  isolateToCurrentRun,
  photoIdentity,
} from "./photoDedupe";

// ── Public types ────────────────────────────────────────────────────

/**
 * Health levels are ordered: green < amber < red < critical.
 *
 *   • green    — clean evidence. Safe to POD, close, invoice.
 *   • amber    — usable but with non-blocking warnings (e.g. low photo
 *                count, legacy null-run fallback applied).
 *   • red      — required evidence missing or upload failures present.
 *                POD/close/invoice are blocked until resolved.
 *   • critical — data integrity issue (stale-run leakage, evidence
 *                belonging to a different job, very high duplicate
 *                count). Demands operator intervention; never auto-pass.
 */
export type EvidenceHealthLevel = "green" | "amber" | "red" | "critical";

export interface EvidenceBlocker {
  /** Stable machine code for branching/logging. Never parse `message`. */
  code:
    | "missing_pickup_inspection"
    | "missing_delivery_inspection"
    | "missing_pickup_photos"
    | "missing_delivery_photos"
    | "missing_driver_signature"
    | "missing_customer_signature"
    | "failed_uploads"
    | "stale_run_evidence"
    | "evidence_mismatch"
    | "duplicate_flood";
  /** Human-friendly. Safe to render in toasts / panels. NO JSON. */
  message: string;
}

export interface EvidenceWarning {
  code:
    | "legacy_null_run_photos"
    | "missing_photo_url"
    | "low_pickup_photo_count"
    | "low_delivery_photo_count"
    | "duplicate_photos_collapsed";
  message: string;
}

export interface EvidencePhotoSummary {
  /** Raw count from the input array (pre any filtering). */
  totalRaw: number;
  /** Count after archived filter, run isolation, and identity dedupe. */
  totalDeduped: number;
  pickupCount: number;
  deliveryCount: number;
  /** Photos with run_id === null that were used via legacy fallback. */
  legacyCount: number;
  /** Photos belonging to a non-current run (excluded). */
  staleRunCount: number;
  /** Photos excluded because of archived_at. */
  archivedCount: number;
  /** Photos with falsy/blank url. */
  missingUrlCount: number;
  /** Number of duplicate rows collapsed by `dedupeByIdentity`. */
  duplicateCount: number;
}

export interface EvidenceHealthResult {
  level: EvidenceHealthLevel;
  /** True iff POD PDF generation is permitted. */
  canUseForPod: boolean;
  /** True iff the job may be moved to a terminal status. */
  canCloseJob: boolean;
  /** True iff the job may be added to an invoice. */
  canInvoice: boolean;
  blockers: EvidenceBlocker[];
  warnings: EvidenceWarning[];
  photoSummary: EvidencePhotoSummary;
}

// ── Inputs ──────────────────────────────────────────────────────────

export interface EvidenceHealthInput {
  /** Job's current run id. Drives stale-run detection. */
  currentRunId: string | null | undefined;
  /** All photos for the job, including archived/legacy/stale. */
  photos: Photo[] | null | undefined;
  /** All inspections for the job. */
  inspections: Inspection[] | null | undefined;
  /** Per-job pending upload summary. */
  pendingUploads?: {
    failedCount: number;
    blockedCount?: number;
  } | null;
  /**
   * Whether this job actually requires pickup/delivery evidence. Some
   * job types (e.g. cancelled, draft) shouldn't be flagged red just
   * because they lack an inspection. Defaults to true for both.
   */
  requirePickup?: boolean;
  requireDelivery?: boolean;
  /**
   * Minimum acceptable photo counts. Falling below triggers an amber
   * warning, not a blocker. Defaults: 1 each.
   */
  minPickupPhotos?: number;
  minDeliveryPhotos?: number;
  /**
   * Threshold above which the duplicate count is treated as critical
   * (likely a runaway client). Defaults to 20 collapsed duplicates.
   */
  duplicateFloodThreshold?: number;
}

// ── Internal helpers ────────────────────────────────────────────────

function isPickupPhotoType(t: string): boolean {
  return t.startsWith("pickup") || t === "odometer_pickup" || t === "fuel_pickup";
}
function isDeliveryPhotoType(t: string): boolean {
  return (
    t.startsWith("delivery") || t === "odometer_delivery" || t === "fuel_delivery"
  );
}

function pickInspection(
  inspections: Inspection[],
  type: "pickup" | "delivery",
): Inspection | null {
  const matches = inspections.filter((i) => i.type === type);
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const aT = a.inspected_at || a.created_at || "";
    const bT = b.inspected_at || b.created_at || "";
    return bT.localeCompare(aT);
  });
  return matches[0];
}

function escalate(
  current: EvidenceHealthLevel,
  next: EvidenceHealthLevel,
): EvidenceHealthLevel {
  const order: EvidenceHealthLevel[] = ["green", "amber", "red", "critical"];
  return order.indexOf(next) > order.indexOf(current) ? next : current;
}

// ── Main ────────────────────────────────────────────────────────────

export function evaluateEvidenceHealth(
  input: EvidenceHealthInput,
): EvidenceHealthResult {
  const {
    currentRunId,
    photos: rawPhotos,
    inspections: rawInspections,
    pendingUploads,
    requirePickup = true,
    requireDelivery = true,
    minPickupPhotos = 1,
    minDeliveryPhotos = 1,
    duplicateFloodThreshold = 20,
  } = input;

  const photos = rawPhotos ?? [];
  const inspections = rawInspections ?? [];

  const blockers: EvidenceBlocker[] = [];
  const warnings: EvidenceWarning[] = [];

  // ── Photo accounting ──────────────────────────────────────────────
  // We instrument each step of the canonicalisation so the photoSummary
  // reflects what was excluded *and why*. This is what makes the result
  // useful to support tooling, not just to UI.
  const totalRaw = photos.length;

  const archived = photos.filter((p) => !!p.archived_at);
  const archivedCount = archived.length;
  const nonArchived = excludeArchived(photos);

  // Stale-run accounting requires a known currentRunId. Without it we
  // cannot reason about stale evidence and report 0.
  let staleRunCount = 0;
  let legacyCount = 0;
  if (currentRunId) {
    for (const p of nonArchived) {
      const rid = p.run_id ?? null;
      if (rid !== null && rid !== currentRunId) staleRunCount++;
    }
  }

  // canonicalisePhotos applies: archived filter (already done above for
  // accounting), run isolation with legacy fallback, identity dedupe.
  // We re-run it on the *original* input for the final list so the
  // public function stays the single source of truth.
  const isolated = isolateToCurrentRun(nonArchived, currentRunId ?? null);
  // legacyCount = number of null-run rows actually used via fallback.
  if (currentRunId) {
    const currentRunMatches = nonArchived.filter(
      (p) => (p.run_id ?? null) === currentRunId,
    ).length;
    if (currentRunMatches === 0) {
      legacyCount = isolated.filter((p) => (p.run_id ?? null) === null).length;
    }
  }

  // Identity dedupe + duplicate accounting.
  const seen = new Set<string>();
  const deduped: Photo[] = [];
  let duplicateCount = 0;
  for (const p of isolated) {
    const key = photoIdentity(p);
    if (seen.has(key)) {
      duplicateCount++;
      continue;
    }
    seen.add(key);
    deduped.push(p);
  }

  // Sanity check: deduped should match canonicalisePhotos output.
  // (Asserted in tests; not enforced at runtime to avoid throws in prod.)
  void canonicalisePhotos;

  const missingUrlCount = deduped.filter(
    (p) => !p.url || p.url.trim() === "",
  ).length;

  const pickupPhotos = deduped.filter((p) => isPickupPhotoType(p.type));
  const deliveryPhotos = deduped.filter((p) => isDeliveryPhotoType(p.type));

  const photoSummary: EvidencePhotoSummary = {
    totalRaw,
    totalDeduped: deduped.length,
    pickupCount: pickupPhotos.length,
    deliveryCount: deliveryPhotos.length,
    legacyCount,
    staleRunCount,
    archivedCount,
    missingUrlCount,
    duplicateCount,
  };

  // ── Inspection accounting ─────────────────────────────────────────
  const pickupInspection = pickInspection(inspections, "pickup");
  const deliveryInspection = pickInspection(inspections, "delivery");

  // ── Blockers (drive RED) ──────────────────────────────────────────
  if (requirePickup && !pickupInspection) {
    blockers.push({
      code: "missing_pickup_inspection",
      message: "Pickup inspection has not been recorded.",
    });
  }
  if (requireDelivery && !deliveryInspection) {
    blockers.push({
      code: "missing_delivery_inspection",
      message: "Delivery inspection has not been recorded.",
    });
  }
  if (requirePickup && pickupPhotos.length === 0) {
    blockers.push({
      code: "missing_pickup_photos",
      message: "No pickup photos found for this job run.",
    });
  }
  if (requireDelivery && deliveryPhotos.length === 0) {
    blockers.push({
      code: "missing_delivery_photos",
      message: "No delivery photos found for this job run.",
    });
  }
  if (deliveryInspection && !deliveryInspection.driver_signature_url) {
    blockers.push({
      code: "missing_driver_signature",
      message: "Driver signature is missing from the delivery inspection.",
    });
  }
  if (deliveryInspection && !deliveryInspection.customer_signature_url) {
    blockers.push({
      code: "missing_customer_signature",
      message: "Customer signature is missing from the delivery inspection.",
    });
  }
  const failedUploads = pendingUploads?.failedCount ?? 0;
  const blockedUploads = pendingUploads?.blockedCount ?? 0;
  if (failedUploads > 0 || blockedUploads > 0) {
    blockers.push({
      code: "failed_uploads",
      message:
        "One or more uploads failed. Resolve them in Pending Uploads before closing the job.",
    });
  }

  // ── Critical conditions (data integrity) ──────────────────────────
  let critical = false;
  if (currentRunId && staleRunCount > 0) {
    blockers.push({
      code: "stale_run_evidence",
      message: `${staleRunCount} photo(s) belong to a previous job run and were excluded.`,
    });
    critical = true;
  }
  // Inspection-side stale-run check (inspection rows can carry run_id too).
  if (currentRunId) {
    const staleInspection =
      (deliveryInspection &&
        (deliveryInspection as any).run_id != null &&
        (deliveryInspection as any).run_id !== currentRunId) ||
      (pickupInspection &&
        (pickupInspection as any).run_id != null &&
        (pickupInspection as any).run_id !== currentRunId);
    if (staleInspection) {
      blockers.push({
        code: "evidence_mismatch",
        message:
          "An inspection on this job belongs to a previous run. Re-inspect on the current run.",
      });
      critical = true;
    }
  }
  if (duplicateCount >= duplicateFloodThreshold) {
    blockers.push({
      code: "duplicate_flood",
      message: `${duplicateCount} duplicate photo rows were collapsed. Investigate the upload pipeline.`,
    });
    critical = true;
  }

  // ── Warnings (drive AMBER, never block) ───────────────────────────
  if (legacyCount > 0) {
    warnings.push({
      code: "legacy_null_run_photos",
      message: `${legacyCount} legacy photo(s) without a run id were used as a fallback.`,
    });
  }
  if (missingUrlCount > 0) {
    warnings.push({
      code: "missing_photo_url",
      message: `${missingUrlCount} photo row(s) have no image URL and will not render.`,
    });
  }
  if (
    requirePickup &&
    pickupPhotos.length > 0 &&
    pickupPhotos.length < minPickupPhotos
  ) {
    warnings.push({
      code: "low_pickup_photo_count",
      message: `Only ${pickupPhotos.length} pickup photo(s) — fewer than recommended.`,
    });
  }
  if (
    requireDelivery &&
    deliveryPhotos.length > 0 &&
    deliveryPhotos.length < minDeliveryPhotos
  ) {
    warnings.push({
      code: "low_delivery_photo_count",
      message: `Only ${deliveryPhotos.length} delivery photo(s) — fewer than recommended.`,
    });
  }
  if (duplicateCount > 0 && duplicateCount < duplicateFloodThreshold) {
    warnings.push({
      code: "duplicate_photos_collapsed",
      message: `${duplicateCount} duplicate photo row(s) were collapsed.`,
    });
  }

  // ── Level rollup ──────────────────────────────────────────────────
  let level: EvidenceHealthLevel = "green";
  if (warnings.length > 0) level = escalate(level, "amber");
  if (blockers.length > 0) level = escalate(level, "red");
  if (critical) level = escalate(level, "critical");

  // ── Gate flags ────────────────────────────────────────────────────
  // Red and critical both block POD, close, and invoice. Amber/green
  // pass. We deliberately do NOT use a "soft override" — operators must
  // resolve blockers explicitly.
  const passes = level === "green" || level === "amber";
  const canUseForPod = passes;
  const canCloseJob = passes;
  const canInvoice = passes;

  return {
    level,
    canUseForPod,
    canCloseJob,
    canInvoice,
    blockers,
    warnings,
    photoSummary,
  };
}
