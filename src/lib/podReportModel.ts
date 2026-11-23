/**
 * What the Proof of Delivery PDF shows, worked out from a job.
 *
 * Pure (no jsPDF, no network) so the content rules are unit-tested
 * (src/test/pod-report-model.test.ts); src/lib/podPdfLayout.ts draws it.
 */
import { isKnownPanel, panelLabel, ukSide } from "@/features/damage/panels";
import { savedDamageDescription } from "@/features/damage/damageModel";
import type { JobWithRelations } from "./types";
import { FUEL_PERCENT_TO_LABEL } from "./types";
import { getChecklistItems } from "./inspectionFields";
import { PHOTO_TYPES_BY_INSPECTION } from "@/features/inspection/inspectionFormConfig";

type Inspection = JobWithRelations["inspections"][number];

export interface PodPhoto {
  url: string;
  label?: string | null;
  type: string;
}

export interface PodStat {
  label: string;
  value: string;
  detail?: string;
}

export interface PodStop {
  title: "Collection" | "Delivery";
  done: boolean;
  address: string;
  company: string | null;
  contact: string | null;
  phone: string | null;
  when: string | null;
  odometer: string | null;
  fuel: string | null;
  driver: string | null;
  /** Who handed over (collection) or received (delivery) the vehicle. */
  customer: string | null;
  damages: number;
}

export interface PodChecklistRow {
  label: string;
  collection: string | null;
  delivery: string | null;
}

/** One table comparing what was recorded at collection and at delivery. */
export interface PodChecklist {
  hasCollection: boolean;
  hasDelivery: boolean;
  rows: PodChecklistRow[];
  notes: { stage: "Collection" | "Delivery"; text: string }[];
}

export interface PodDamage {
  stage: "Collection" | "Delivery";
  location: string;
  item: string;
  damage: string;
  notes: string | null;
}

export interface PodPhotoGroup {
  title: string;
  subtitle: string | null;
  photos: PodPhoto[];
}

export interface PodSignature {
  role: string;
  name: string | null;
  url: string | null;
}

export interface PodSignoff {
  stage: "Collection" | "Delivery";
  when: string | null;
  signatures: [PodSignature, PodSignature];
}

export interface PodExpenseLine {
  category: string;
  description: string | null;
}

export interface PodReportModel {
  ref: string;
  reg: string;
  vehicleTitle: string;
  vehicleSubtitle: string | null;
  status: { label: string; tone: "success" | "info" | "neutral" | "danger" };
  stats: PodStat[];
  collection: PodStop;
  delivery: PodStop;
  checklist: PodChecklist | null;
  damages: PodDamage[];
  photoGroups: PodPhotoGroup[];
  signoffs: PodSignoff[];
  expenses: PodExpenseLine[];
}

// ── Formatting ───────────────────────────────────────────────────────────────

function text(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** "16 Nov 2026, 17:34" in UK time; null for missing/invalid. */
export function formatPodDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** "16 Nov 2026" in UK time. */
export function formatPodDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** "07577791633" -> "07577 791633"; anything else is returned trimmed. */
export function formatUkPhone(phone: string | null | undefined): string | null {
  const raw = text(phone);
  if (!raw) return null;
  const digits = raw.replace(/[\s-]/g, "");
  if (/^07\d{9}$/.test(digits)) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (/^\+447\d{9}$/.test(digits)) return `+44 ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return raw;
}

/** "yd66owp" -> "YD66 OWP" for current-style plates; others just upper-cased. */
export function formatReg(reg: string | null | undefined): string {
  const compact = (reg ?? "").replace(/\s+/g, "").toUpperCase();
  if (!compact) return "—";
  const m = /^([A-Z]{2}\d{2})([A-Z]{3})$/.exec(compact);
  return m ? `${m[1]} ${m[2]}` : (reg ?? "").trim().toUpperCase();
}

function titleCase(s: string): string {
  // "LAND ROVER" / "fuel" -> "Land Rover" / "Fuel"; mixed case ("McLaren", "Range Rover Evoque") is left alone.
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function fuel(pct: number | null | undefined): string | null {
  if (pct == null) return null;
  return FUEL_PERCENT_TO_LABEL[pct] ?? `${pct}%`;
}

function miles(n: number | null | undefined): string | null {
  return n == null ? null : `${n.toLocaleString("en-GB")} mi`;
}

/** The person who did the inspection, ignoring the generic "Driver" placeholder. */
function driverName(insp: Inspection | undefined, job: JobWithRelations): string | null {
  const own = text(insp?.inspected_by_name);
  if (own && !/^\s*driver\s*$/i.test(own)) return own;
  return text(job.resolvedDriverName ?? job.driver_name);
}

function joinNonEmpty(parts: unknown[], sep: string): string | null {
  const out = parts.map(text).filter(Boolean) as string[];
  return out.length ? out.join(sep) : null;
}

const PHOTO_LABELS: Record<string, string> = Object.fromEntries(
  [...PHOTO_TYPES_BY_INSPECTION.pickup, ...PHOTO_TYPES_BY_INSPECTION.delivery].map((p) => [p.key, p.label]),
);

export function photoCaption(p: PodPhoto): string {
  return text(p.label) ?? PHOTO_LABELS[p.type] ?? (p.type === "damage_close_up" ? "Damage close-up" : p.type);
}

// ── Model ────────────────────────────────────────────────────────────────────

export function buildPodReportModel(
  job: JobWithRelations,
  photos: { pickupPhotos: PodPhoto[]; deliveryPhotos: PodPhoto[]; damagePhotos: PodPhoto[] },
  expenses: { category: string; label: string | null; billable_on_pod?: boolean }[] = [],
): PodReportModel {
  const ref = text(job.external_job_number) ?? job.id.slice(0, 8).toUpperCase();
  const reg = formatReg(job.vehicle_reg);
  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");
  const pickupDamages = job.damage_items.filter((d) => pickup && d.inspection_id === pickup.id);
  const deliveryDamages = job.damage_items.filter((d) => delivery && d.inspection_id === delivery.id);

  const make = text(job.vehicle_make);
  const model = text(job.vehicle_model);
  const vehicleTitle = joinNonEmpty([make && titleCase(make), model && titleCase(model)], " ") ?? "Vehicle";
  const colour = text(job.vehicle_colour);
  const vehicleSubtitle = joinNonEmpty([colour && titleCase(colour), job.vehicle_year], " · ");

  const status =
    delivery
      ? { label: "Delivered", tone: "success" as const }
      : job.status === "cancelled" || job.status === "failed" || job.status === "aborted"
        ? {
            label: job.status === "cancelled" ? "Cancelled" : job.status === "aborted" ? "Aborted — not collected" : "Not completed",
            tone: "danger" as const,
          }
        : pickup
          ? { label: "In transit", tone: "info" as const }
          : { label: "Awaiting collection", tone: "neutral" as const };

  // Headline facts.
  const stats: PodStat[] = [
    { label: "Collected", value: formatPodDateTime(pickup?.inspected_at) ?? "—" },
    { label: "Delivered", value: formatPodDateTime(delivery?.inspected_at) ?? "—" },
  ];
  const odoIn = pickup?.odometer ?? null;
  const odoOut = delivery?.odometer ?? null;
  if (odoOut != null || odoIn != null) {
    const diff = odoIn != null && odoOut != null && odoOut >= odoIn ? odoOut - odoIn : null;
    stats.push({
      label: "Odometer",
      value: miles(odoOut ?? odoIn) ?? "—",
      detail:
        diff != null
          ? `+${diff.toLocaleString("en-GB")} mi since collection`
          : odoOut != null
            ? "At delivery"
            : "At collection",
    });
  }
  const fuelIn = fuel(pickup?.fuel_level_percent);
  const fuelOut = fuel(delivery?.fuel_level_percent);
  if (fuelIn || fuelOut) {
    stats.push({
      label: "Fuel",
      value: fuelOut ?? fuelIn ?? "—",
      detail: fuelOut && fuelIn ? `${fuelIn} at collection` : fuelOut ? "At delivery" : "At collection",
    });
  }

  const stop = (
    title: "Collection" | "Delivery",
    insp: Inspection | undefined,
    p: "pickup" | "delivery",
    damages: number,
  ): PodStop => ({
    title,
    done: !!insp,
    address: joinNonEmpty([job[`${p}_address_line1`], job[`${p}_city`], job[`${p}_postcode`]], ", ") ?? "—",
    company: text(job[`${p}_company`]),
    contact: text(job[`${p}_contact_name`]),
    phone: formatUkPhone(job[`${p}_contact_phone`]),
    when: formatPodDateTime(insp?.inspected_at),
    odometer: miles(insp?.odometer),
    fuel: fuel(insp?.fuel_level_percent),
    driver: insp ? driverName(insp, job) : null,
    customer: text(insp?.customer_name),
    damages,
  });

  // Checklist: one row per item recorded at either stage, in form order.
  const rowsByKey = new Map<string, PodChecklistRow>();
  for (const [stage, insp] of [["collection", pickup], ["delivery", delivery]] as const) {
    for (const f of getChecklistItems(insp)) {
      const row = rowsByKey.get(f.key) ?? { label: f.label, collection: null, delivery: null };
      row[stage] = text((insp as unknown as Record<string, unknown>)[f.key]);
      rowsByKey.set(f.key, row);
    }
  }
  const checklistNotes = [
    { stage: "Collection" as const, text: text(pickup?.notes) },
    { stage: "Delivery" as const, text: text(delivery?.notes) },
  ].filter((n): n is { stage: "Collection" | "Delivery"; text: string } => !!n.text);
  const checklist: PodChecklist | null =
    rowsByKey.size || checklistNotes.length
      ? {
          hasCollection: [...rowsByKey.values()].some((r) => r.collection != null),
          hasDelivery: [...rowsByKey.values()].some((r) => r.delivery != null),
          rows: [...rowsByKey.values()],
          notes: checklistNotes,
        }
      : null;

  // V2 rows carry a stable panel id: report the canonical panel label and
  // severity so the PDF always agrees with what was tapped. Legacy rows keep
  // their free-text area/item exactly as before.
  const damage = (stage: "Collection" | "Delivery") => (d: JobWithRelations["damage_items"][number]): PodDamage => {
    const v2 = !!d.panel_id;
    const side = v2 && d.panel_id && isKnownPanel(d.panel_id) ? ukSide(d.panel_id) : null;
    return {
      stage,
      location: v2 ? side ?? text(d.area) ?? "—" : text(d.area) ?? "—",
      item: v2 ? panelLabel(d.panel_id, d.item) : text(d.item) ?? "—",
      damage: savedDamageDescription(d),
      notes: text(d.notes),
    };
  };

  const photoGroups: PodPhotoGroup[] = [
    { title: "Collection photos", subtitle: formatPodDateTime(pickup?.inspected_at), photos: photos.pickupPhotos },
    { title: "Delivery photos", subtitle: formatPodDateTime(delivery?.inspected_at), photos: photos.deliveryPhotos },
    { title: "Damage close-ups", subtitle: null, photos: photos.damagePhotos },
  ].filter((g) => g.photos.length > 0);

  const signoffs: PodSignoff[] = [];
  if (pickup) {
    signoffs.push({
      stage: "Collection",
      when: formatPodDateTime(pickup.inspected_at),
      signatures: [
        { role: "Collected by (driver)", name: driverName(pickup, job), url: text(pickup.driver_signature_url) },
        { role: "Released by (customer)", name: text(pickup.customer_name), url: text(pickup.customer_signature_url) },
      ],
    });
  }
  if (delivery) {
    signoffs.push({
      stage: "Delivery",
      when: formatPodDateTime(delivery.inspected_at),
      signatures: [
        { role: "Delivered by (driver)", name: driverName(delivery, job), url: text(delivery.driver_signature_url) },
        { role: "Received by (customer)", name: text(delivery.customer_name), url: text(delivery.customer_signature_url) },
      ],
    });
  }

  return {
    ref,
    reg,
    vehicleTitle,
    vehicleSubtitle,
    status,
    stats,
    collection: stop("Collection", pickup, "pickup", pickupDamages.length),
    delivery: stop("Delivery", delivery, "delivery", deliveryDamages.length),
    checklist,
    damages: [...pickupDamages.map(damage("Collection")), ...deliveryDamages.map(damage("Delivery"))],
    photoGroups,
    signoffs,
    expenses: expenses
      .filter((e) => e.billable_on_pod !== false)
      .map((e) => ({ category: titleCase(text(e.category) ?? "Expense"), description: text(e.label) })),
  };
}

// ── Proof of Collection ──────────────────────────────────────────────────────

/**
 * The job as it stood at collection: only the pickup inspection, its damage
 * items and its photos (including damage close-ups linked to it). Used to
 * print a Proof of Collection, which must not show anything from delivery.
 */
export function collectionOnlyJob(job: JobWithRelations): JobWithRelations {
  const pickup = job.inspections.find((i) => i.type === "pickup");
  const damageItems = job.damage_items.filter((d) => !!pickup && d.inspection_id === pickup.id);
  const damageIds = new Set(damageItems.map((d) => d.id));
  const photos = job.photos.filter((p) => {
    if (p.type.startsWith("pickup_")) return true;
    if (p.type !== "damage_close_up" || !pickup) return false;
    if (p.inspection_id) return p.inspection_id === pickup.id;
    return !!p.damage_item_id && damageIds.has(p.damage_item_id);
  });
  return { ...job, inspections: pickup ? [pickup] : [], damage_items: damageItems, photos };
}

/** Adjust a model built from collectionOnlyJob() for a Proof of Collection. */
export function toCollectionModel(model: PodReportModel): PodReportModel {
  return {
    ...model,
    status: model.collection.done
      ? { label: "Collected", tone: "info" }
      : { label: "Awaiting collection", tone: "neutral" },
    stats: model.stats.filter((s) => s.label !== "Delivered"),
    expenses: [],
  };
}
