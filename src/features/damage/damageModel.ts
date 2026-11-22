/**
 * Pure helpers for damage records (V2). No React, no Supabase — unit tested.
 */
import type { DamageItem, DamageItemDraft, DamagePhotoDraft } from "@/lib/types";
import { DIAGRAM_VERSION, OTHER_PANEL_ID, isKnownPanel, legacyFieldsForPanel, panelLabel, ukSide } from "./panels";
import { isBodyType } from "./bodyTypes";

/** Existing categories are preserved verbatim; "Crack" added for glass/lamps. */
export const DAMAGE_TYPES = [
  "Scratch",
  "Dent",
  "Scuff",
  "Paint Chip",
  "Crack",
  "Rust",
  "Collision Damage",
  "Missing",
] as const;

export const SEVERITIES = ["minor", "moderate", "severe"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const SEVERITY_LABELS: Record<Severity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
};

/** Severity dot colours — always paired with the text label, never colour alone. */
export const SEVERITY_DOT: Record<Severity, string> = {
  minor: "bg-emerald-500",
  moderate: "bg-amber-500",
  severe: "bg-red-600",
};

export function newId(prefix = "dmg"): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** All close-up photo Files on a damage, including a pre-V2 single `photo`. */
export function damagePhotoFiles(d: DamageItemDraft): File[] {
  if (d.photos?.length) return d.photos.map((p) => p.file).filter((f): f is File => f instanceof File);
  return d.photo instanceof File ? [d.photo] : [];
}

export function damageLabel(d: Pick<DamageItemDraft, "panelId" | "customLabel" | "area" | "item">): string {
  if (d.panelId) return panelLabel(d.panelId, d.customLabel ?? d.item);
  return [d.area, d.item].filter(Boolean).join(" – ") || "Unlinked damage";
}

/** "Front Left Door (nearside)" style label for reports/lists. */
export function damageLabelWithSide(d: Pick<DamageItemDraft, "panelId" | "customLabel" | "area" | "item">): string {
  const base = damageLabel(d);
  const side = d.panelId && isKnownPanel(d.panelId) ? ukSide(d.panelId) : null;
  return side ? `${base} (${side.toLowerCase()})` : base;
}

/** Missing fields for the damage editor's Save. Empty = valid. */
export function validateDamage(d: Partial<DamageItemDraft>): string[] {
  const missing: string[] = [];
  if (!d.panelId) missing.push("Panel");
  else if (d.panelId === OTHER_PANEL_ID && !d.customLabel?.trim()) missing.push("Description of location");
  else if (d.panelId !== OTHER_PANEL_ID && !isKnownPanel(d.panelId)) missing.push("Panel");
  if (!d.damageTypes?.length) missing.push("Damage type");
  if (!d.severity) missing.push("Severity");
  return missing;
}

/** Fill legacy area/location/item + diagram x/y from the V2 fields. */
export function withLegacyFields(d: DamageItemDraft): DamageItemDraft {
  if (!d.panelId) return d;
  const legacy = legacyFieldsForPanel(d.panelId, d.customLabel);
  return { ...d, ...legacy };
}

/**
 * damage_items payload for submit_inspection (online RPC and offline queue).
 * Unknown/legacy drafts keep their old fields and send NULL V2 fields; older
 * servers simply ignore the extra keys.
 */
export function buildDamagePayloadItem(d: DamageItemDraft): Record<string, unknown> {
  const v2 = !!d.panelId;
  const hasPos = typeof d.panelU === "number" && typeof d.panelV === "number";
  return {
    x: Number.isFinite(d.x) ? d.x : null,
    y: Number.isFinite(d.y) ? d.y : null,
    area: d.area,
    location: d.location,
    item: d.item,
    damage_types: d.damageTypes,
    notes: d.notes,
    photo_url: null, // set server-side when the close-up photo row is inserted
    panel_id: v2 ? d.panelId : null,
    view_id: v2 ? d.viewId ?? null : null,
    body_type: v2 && isBodyType(d.bodyType) ? d.bodyType : null,
    diagram_version: v2 ? d.diagramVersion ?? DIAGRAM_VERSION : null,
    severity: d.severity ?? null,
    panel_position: v2 && hasPos ? { u: round3(d.panelU!), v: round3(d.panelV!) } : null,
  };
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Draft JSON must never contain File objects (they serialise to `{}`). */
export function serialiseDamagesForDraft(damages: DamageItemDraft[]): DamageItemDraft[] {
  return damages.map((d) => {
    const { photo: _photo, photos, photoUrl: _url, ...rest } = d;
    void _photo; void _url;
    return { ...rest, photoIds: photos?.map((p) => p.id) ?? d.photoIds ?? [] };
  });
}

/** After a draft restore: drop anything that isn't a real File (old drafts stored `{}`). */
export function sanitiseRestoredDamages(raw: unknown): DamageItemDraft[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is DamageItemDraft => !!d && typeof d === "object" && typeof (d as DamageItemDraft).tempId === "string")
    .map((d) => {
      const out: DamageItemDraft = { ...d, damageTypes: Array.isArray(d.damageTypes) ? d.damageTypes : [] };
      if (!(out.photo instanceof File)) delete out.photo;
      out.photos = (out.photos ?? []).filter((p) => p && p.file instanceof File);
      return out;
    });
}

/** Re-attach IndexedDB-stored close-ups to restored damages (by photo id). */
export function attachRestoredPhotos(
  damages: DamageItemDraft[],
  stored: Array<{ id: string; damageTempId: string; file: File }>,
  makeUrl: (f: File) => string,
): DamageItemDraft[] {
  return damages.map((d) => {
    const have = new Set((d.photos ?? []).map((p) => p.id));
    const wanted = new Set(d.photoIds ?? []);
    const extra: DamagePhotoDraft[] = stored
      .filter((s) => s.damageTempId === d.tempId && !have.has(s.id) && (wanted.size === 0 || wanted.has(s.id)))
      .map((s) => ({ id: s.id, file: s.file, previewUrl: makeUrl(s.file) }));
    return extra.length ? { ...d, photos: [...(d.photos ?? []), ...extra] } : d;
  });
}

/** Display label for a saved damage_items row (reports, POD, delivery reference). */
export function savedDamageLabel(row: Pick<DamageItem, "panel_id" | "area" | "item">): {
  label: string;
  legacy: boolean;
} {
  if (row.panel_id && isKnownPanel(row.panel_id)) {
    const side = ukSide(row.panel_id);
    const base = panelLabel(row.panel_id, row.item);
    return { label: side ? `${base} (${side.toLowerCase()})` : base, legacy: false };
  }
  if (row.panel_id === OTHER_PANEL_ID) return { label: row.item?.trim() || "Other", legacy: false };
  const text = [row.area, row.item].filter(Boolean).join(" – ");
  return { label: text || "Location not recorded", legacy: true };
}

export function savedDamageDescription(row: Pick<DamageItem, "damage_types" | "severity">): string {
  const types = row.damage_types?.length ? row.damage_types.join(", ") : "—";
  return row.severity ? `${types} (${SEVERITY_LABELS[row.severity]})` : types;
}

/**
 * One client id per damage, index-aligned with the RPC's damageItemIds —
 * INCLUDING damages without photos. (The previous offline-queue order was
 * built from damages-with-photos only, so a photo-less first damage shifted
 * every later photo onto the wrong damage row after an offline drain.)
 */
export function damageClientIds(damageCount: number, submissionSessionId: string): string[] {
  return Array.from({ length: damageCount }, (_, i) => `dmg-${submissionSessionId}-${i}`);
}
