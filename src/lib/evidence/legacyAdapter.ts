/**
 * Legacy adapter — the backwards-compatibility contract.
 *
 * The existing system stores photos in `public.photos` with a single `type`
 * string that encodes both stage and category, e.g. "pickup_exterior_front",
 * "delivery_fuel_gauge", "damage_close_up". This module is the ONE place that
 * knows that encoding, so the rest of the evidence subsystem speaks only in
 * typed (stage, category) terms.
 *
 * Pure functions, no I/O. Fully deterministic and unit-tested. It maps in BOTH
 * directions so new evidence can also be written with a legacy-compatible `type`
 * where a consumer (e.g. POD splitting on the "pickup_"/"delivery_" prefix) still
 * needs it — that keeps old completed jobs and old code paths working untouched.
 */

import type { Photo } from "@/lib/types";
import type {
  EvidenceCategory,
  EvidenceStage,
  EvidenceView,
} from "./types";

// Canonical category vocabulary as used by the current inspection form
// (src/features/inspection/inspectionFormConfig.ts) — do not drift from these.
const SUFFIX_TO_CATEGORY: Record<string, EvidenceCategory> = {
  exterior_front: "front",
  exterior_rear: "rear",
  // UK convention: driver side = offside, passenger side = nearside.
  exterior_driver_side: "offside",
  exterior_passenger_side: "nearside",
  interior: "interior",
  dashboard: "dashboard",
  fuel_gauge: "fuel",
  other: "additional",
};

const CATEGORY_TO_SUFFIX: Partial<Record<EvidenceCategory, string>> = {
  front: "exterior_front",
  rear: "exterior_rear",
  offside: "exterior_driver_side",
  nearside: "exterior_passenger_side",
  interior: "interior",
  dashboard: "dashboard",
  fuel: "fuel_gauge",
  additional: "other",
};

export interface StageCategory {
  stage: EvidenceStage | null;
  category: EvidenceCategory | null;
}

/**
 * Parse a legacy `photos.type` into (stage, category). Returns nulls for the
 * parts it cannot determine rather than guessing — e.g. "damage_close_up" has a
 * clear category (damage) but no stage in the string itself.
 */
export function parseLegacyType(type: string | null | undefined): StageCategory {
  const t = (type ?? "").trim().toLowerCase();
  if (!t) return { stage: null, category: null };

  // Damage close-ups carry no stage prefix; stage comes from the inspection.
  if (t === "damage_close_up" || t === "damage") {
    return { stage: null, category: "damage" };
  }

  let stage: EvidenceStage | null = null;
  let rest = t;
  if (t.startsWith("pickup_")) {
    stage = "pickup";
    rest = t.slice("pickup_".length);
  } else if (t.startsWith("delivery_")) {
    stage = "delivery";
    rest = t.slice("delivery_".length);
  }

  const category = SUFFIX_TO_CATEGORY[rest] ?? null;
  return { stage, category };
}

/**
 * Build a legacy-compatible `type` string from (stage, category). Used when new
 * evidence must also present a value that legacy consumers (POD prefix split,
 * old readers) understand. Damage maps to the unprefixed "damage_close_up".
 */
export function toLegacyType(
  stage: EvidenceStage,
  category: EvidenceCategory,
): string {
  if (category === "damage") return "damage_close_up";
  const suffix = CATEGORY_TO_SUFFIX[category];
  // Categories with no legacy equivalent (mileage/vin/keys/document/...) fall
  // back to a stage-prefixed raw category so nothing is silently dropped.
  return `${stage}_${suffix ?? category}`;
}

/** Present a legacy `photos` row as a unified EvidenceView for merged reads. */
export function legacyPhotoToView(photo: Photo): EvidenceView {
  const { stage, category } = parseLegacyType(photo.type);
  return {
    id: photo.id,
    source: "legacy",
    jobId: photo.job_id,
    stage,
    category,
    evidenceType: "photo",
    damageItemId: (photo as { damage_item_id?: string | null }).damage_item_id ?? null,
    capturedAt: photo.created_at ?? null,
    legacyType: photo.type ?? null,
    storageBucket: null,
    storagePath: null,
    thumbnailPath: null,
    legacyUrl: photo.url ?? null,
    hash: null,
  };
}
