/**
 * podReadiness — Stage 4 POD operational gating.
 *
 * Important rule (from product brief):
 *   "POD ready" does NOT mean "job completed".
 *   "POD ready" means proof can be reviewed/generated.
 *
 * This module is a thin, well-named adapter over `evaluateEvidenceHealth`
 * so that POD review surfaces and the POD PDF generator share one source
 * of truth and one vocabulary. It is a pure function — no React, no IO.
 *
 * It does NOT:
 *   - mutate job status
 *   - auto-complete jobs when POD becomes ready
 *   - auto-invoice on approval
 *
 * It DOES:
 *   - decide whether a POD can be reviewed
 *   - decide whether a POD PDF should be considered trustworthy
 *   - decide whether admin approval may unlock job completion
 *   - explain the decision via blockers + warnings the UI can render
 */

import type { Inspection, Photo } from "./types";
import {
  evaluateEvidenceHealth,
  type EvidenceHealthResult,
  type EvidenceBlocker,
  type EvidenceWarning,
  type EvidencePhotoSummary,
} from "./evidenceHealth";

export interface PodReadinessInput {
  currentRunId: string | null | undefined;
  photos: Photo[] | null | undefined;
  inspections: Inspection[] | null | undefined;
  pendingUploads?: { failedCount: number; blockedCount?: number } | null;
  /**
   * Defaults to true. Some legacy/customer-pickup-only flows may set this
   * to false to allow a delivery-only job to ship a POD. Setting this off
   * is an explicit, intentional override.
   */
  requirePickupInspection?: boolean;
  /** Defaults to true. */
  requireDeliveryInspection?: boolean;
  minPickupPhotos?: number;
  minDeliveryPhotos?: number;
}

export interface PodReadinessResult {
  /** True when the POD can be reviewed and the PDF can be generated safely. */
  podReady: boolean;
  /**
   * True when admin approval is permitted to unlock job completion.
   * Always false when health is red/critical, even if the admin clicks.
   */
  safeToApprove: boolean;
  /**
   * True when the job may be marked complete (still requires admin action).
   * Always false when health is red/critical.
   */
  safeToCloseJob: boolean;
  health: EvidenceHealthResult;
  blockers: EvidenceBlocker[];
  warnings: EvidenceWarning[];
  photoSummary: EvidencePhotoSummary;
  missingSections: string[];
}

/**
 * Pure POD readiness check. Wraps `evaluateEvidenceHealth` and projects
 * the result into the language POD review uses (ready/approve/close).
 */
export function evaluatePodReadiness(
  input: PodReadinessInput,
): PodReadinessResult {
  const health = evaluateEvidenceHealth({
    currentRunId: input.currentRunId,
    photos: input.photos,
    inspections: input.inspections,
    pendingUploads: input.pendingUploads,
    requirePickup: input.requirePickupInspection ?? true,
    requireDelivery: input.requireDeliveryInspection ?? true,
    minPickupPhotos: input.minPickupPhotos,
    minDeliveryPhotos: input.minDeliveryPhotos,
  });

  // Derive the human-friendly "missing sections" list from blocker codes.
  const missingSections: string[] = [];
  for (const b of health.blockers) {
    switch (b.code) {
      case "missing_pickup_inspection":
        missingSections.push("Pickup inspection");
        break;
      case "missing_delivery_inspection":
        missingSections.push("Delivery inspection");
        break;
      case "missing_pickup_photos":
        missingSections.push("Pickup photos");
        break;
      case "missing_delivery_photos":
        missingSections.push("Delivery photos");
        break;
      case "missing_driver_signature":
        missingSections.push("Driver signature");
        break;
      case "missing_customer_signature":
        missingSections.push("Customer signature");
        break;
      default:
        break;
    }
  }

  const passes = health.level === "green" || health.level === "amber";

  return {
    podReady: passes,
    safeToApprove: passes,
    safeToCloseJob: passes,
    health,
    blockers: health.blockers,
    warnings: health.warnings,
    photoSummary: health.photoSummary,
    missingSections,
  };
}
