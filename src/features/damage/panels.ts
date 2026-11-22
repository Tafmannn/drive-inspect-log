/**
 * Canonical, versioned panel identities for damage records.
 *
 * Panel IDs are STABLE storage keys (damage_items.panel_id). Never rename or
 * repurpose one; add new IDs instead and bump DIAGRAM_VERSION when the drawn
 * geometry changes meaningfully.
 *
 * Orientation convention (used everywhere, never view-dependent):
 *   • "left"/"right" are the VEHICLE's left/right, as seen by someone sitting
 *     in the driver's seat facing forward.
 *   • UK: left = nearside (kerb side), right = offside (driver's side on a
 *     right-hand-drive car).
 *   • A panel keeps its physical meaning in every camera view — e.g. the
 *     left headlight appears on the viewer's RIGHT in the Front view.
 */
export const DIAGRAM_VERSION = "v2.0";

export type PanelSide = "left" | "right" | "centre";
export type LegacyArea = "Front of Vehicle" | "Nearside" | "Rear of Vehicle" | "Roof" | "Offside" | "Interior";
export type PanelKind = "Panels" | "Glass" | "Lights" | "Wheels";

export interface PanelDef {
  id: string;
  label: string;
  side: PanelSide;
  /** Where it sits fore/aft — used to fill the legacy `area` column. */
  zone: "front" | "side" | "rear" | "roof" | "other";
  kind: PanelKind;
}

const P = (id: string, label: string, side: PanelSide, zone: PanelDef["zone"], kind: PanelKind = "Panels"): PanelDef => ({
  id, label, side, zone, kind,
});

export const PANELS: Record<string, PanelDef> = Object.fromEntries(
  [
    // Front
    P("front_bumper", "Front Bumper", "centre", "front"),
    P("front_grille", "Front Grille", "centre", "front"),
    P("bonnet", "Bonnet", "centre", "front"),
    P("windscreen", "Windscreen", "centre", "front", "Glass"),
    P("left_headlight", "Left Headlight", "left", "front", "Lights"),
    P("right_headlight", "Right Headlight", "right", "front", "Lights"),
    // Roof
    P("roof", "Roof", "centre", "roof"),
    P("soft_top", "Soft Top (Roof)", "centre", "roof"),
    // Rear
    P("rear_bumper", "Rear Bumper", "centre", "rear"),
    P("boot", "Boot Lid", "centre", "rear"),
    P("tailgate", "Tailgate", "centre", "rear"),
    P("rear_deck", "Rear Deck / Tonneau", "centre", "rear"),
    P("rear_windscreen", "Rear Windscreen", "centre", "rear", "Glass"),
    P("left_taillight", "Left Tail Light", "left", "rear", "Lights"),
    P("right_taillight", "Right Tail Light", "right", "rear", "Lights"),
    P("left_rear_cargo_door", "Rear Left Cargo Door", "left", "rear"),
    P("right_rear_cargo_door", "Rear Right Cargo Door", "right", "rear"),
    P("load_bed", "Load Bed", "centre", "rear"),
    // Sides (generated for both)
    ...(["left", "right"] as const).flatMap((s) => {
      const S = s === "left" ? "Left" : "Right";
      return [
        P(`front_${s}_wing`, `Front ${S} Wing`, s, "side"),
        P(`front_${s}_door`, `Front ${S} Door`, s, "side"),
        P(`rear_${s}_door`, `Rear ${S} Door`, s, "side"),
        P(`rear_${s}_quarter`, `Rear ${S} Quarter`, s, "side"),
        P(`${s}_sill`, `${S} Sill`, s, "side"),
        P(`${s}_mirror`, `${S} Mirror`, s, "side"),
        P(`front_${s}_window`, `Front ${S} Window`, s, "side", "Glass"),
        P(`rear_${s}_window`, `Rear ${S} Window`, s, "side", "Glass"),
        P(`rear_${s}_quarter_glass`, `Rear ${S} Quarter Glass`, s, "side", "Glass"),
        P(`front_${s}_wheel`, `Front ${S} Wheel`, s, "side", "Wheels"),
        P(`rear_${s}_wheel`, `Rear ${S} Wheel`, s, "side", "Wheels"),
        P(`${s}_sliding_door`, `${S} Sliding Door`, s, "side"),
        P(`${s}_load_side`, `${S} Load Side Panel`, s, "side"),
        P(`${s}_bed_side`, `${S} Load Bed Side`, s, "side"),
      ];
    }),
    // Manual fallback for anything the generic template can't show.
    P("other", "Other (described)", "centre", "other"),
  ].map((p) => [p.id, p]),
);

export const OTHER_PANEL_ID = "other";

export function isKnownPanel(id: string | null | undefined): id is string {
  return !!id && Object.prototype.hasOwnProperty.call(PANELS, id);
}

export function panelLabel(id: string | null | undefined, customLabel?: string | null): string {
  if (id === OTHER_PANEL_ID) return customLabel?.trim() || "Other";
  if (isKnownPanel(id)) return PANELS[id].label;
  return customLabel?.trim() || "Unknown panel";
}

/** UK nearside/offside wording for a panel, or null for centre panels. */
export function ukSide(id: string): "Nearside" | "Offside" | null {
  const side = PANELS[id]?.side;
  return side === "left" ? "Nearside" : side === "right" ? "Offside" : null;
}

/**
 * Legacy columns (area / location / item) are still written for every new
 * record so older report code, exports and the client portal keep reading
 * sensible text even before they learn about panel_id.
 */
export function legacyFieldsForPanel(
  id: string,
  customLabel?: string | null,
): { area: LegacyArea; location: string; item: string } {
  const def = PANELS[id];
  const item = panelLabel(id, customLabel);
  if (!def || id === OTHER_PANEL_ID) return { area: "Interior", location: "Other", item };
  const area: LegacyArea =
    def.side === "left" ? "Nearside"
    : def.side === "right" ? "Offside"
    : def.zone === "front" ? "Front of Vehicle"
    : def.zone === "rear" ? "Rear of Vehicle"
    : "Roof";
  return { area, location: def.kind === "Glass" ? "Glass" : def.kind, item };
}

/** Swap left/right in a panel id (used to derive the right-hand view). */
export function mirrorPanelId(id: string): string {
  if (id.includes("left")) return id.replace("left", "right");
  if (id.includes("right")) return id.replace("right", "left");
  return id;
}
