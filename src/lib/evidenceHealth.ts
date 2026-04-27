/**
 * evidenceHealth — workflow intelligence advisory layer.
 *
 * Pure function. Aggregates archived/run-isolation/dedupe accounting +
 * inspection/signature/upload checks into a single advisory result used
 * by POD review, Job detail, and admin attention surfaces.
 *
 * Built on top of `photoDedupe` so it shares the exact rules used by
 * the photo viewers — there is no chance of UI and health drifting.
 */

import type { Inspection, Photo } from "./types";
import {
  excludeArchived,
  isolateToCurrentRun,
  photoIdentity,
} from "./photoDedupe";

export type EvidenceHealthLevel = "green" | "amber" | "red" | "critical";

export interface EvidenceBlocker {
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
  totalRaw: number;
  totalDeduped: number;
  pickupCount: number;
  deliveryCount: number;
  legacyCount: number;
  staleRunCount: number;
  archivedCount: number;
  missingUrlCount: number;
  duplicateCount: number;
}

export interface EvidenceHealthResult {
  level: EvidenceHealthLevel;
  canUseForPod: boolean;
  canCloseJob: boolean;
  canInvoice: boolean;
  blockers: EvidenceBlocker[];
  warnings: EvidenceWarning[];
  photoSummary: EvidencePhotoSummary;
}

export interface EvidenceHealthInput {
  currentRunId: string | null | undefined;
  photos: Photo[] | null | undefined;
  inspections: Inspection[] | null | undefined;
  pendingUploads?: { failedCount: number; blockedCount?: number } | null;
  requirePickup?: boolean;
  requireDelivery?: boolean;
  minPickupPhotos?: number;
  minDeliveryPhotos?: number;
  duplicateFloodThreshold?: number;
}

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

  const totalRaw = photos.length;
  const archived = photos.filter((p) => !!p.archived_at);
  const archivedCount = archived.length;
  const nonArchived = excludeArchived(photos);

  let staleRunCount = 0;
  let legacyCount = 0;
  if (currentRunId) {
    for (const p of nonArchived) {
      const rid = p.run_id ?? null;
      if (rid !== null && rid !== currentRunId) staleRunCount++;
    }
  }

  const isolated = isolateToCurrentRun(nonArchived, currentRunId ?? null);
  if (currentRunId) {
    const currentRunMatches = nonArchived.filter(
      (p) => (p.run_id ?? null) === currentRunId,
    ).length;
    if (currentRunMatches === 0) {
      legacyCount = isolated.filter((p) => (p.run_id ?? null) === null).length;
    }
  }

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

  const pickupInspection = pickInspection(inspections, "pickup");
  const deliveryInspection = pickInspection(inspections, "delivery");

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

  let critical = false;
  if (currentRunId && staleRunCount > 0) {
    blockers.push({
      code: "stale_run_evidence",
      message: `${staleRunCount} photo(s) belong to a previous job run and were excluded.`,
    });
    critical = true;
  }
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

  let level: EvidenceHealthLevel = "green";
  if (warnings.length > 0) level = escalate(level, "amber");
  if (blockers.length > 0) level = escalate(level, "red");
  if (critical) level = escalate(level, "critical");

  const passes = level === "green" || level === "amber";
  return {
    level,
    canUseForPod: passes,
    canCloseJob: passes,
    canInvoice: passes,
    blockers,
    warnings,
    photoSummary,
  };
}
