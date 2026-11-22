/**
 * Pure tap → panel resolution, shared by the live diagram and the tests.
 *
 * Rules
 *  1. A tap inside a panel selects the TOP-MOST panel under the finger
 *     (lamps and mirrors sit above bumpers/wings).
 *  2. A tap just outside every panel (within `tolerance`, i.e. a fingertip)
 *     snaps to the nearest panel — this is the "enlarged invisible hit area"
 *     for small parts, computed rather than drawn so it can never overlap.
 *  3. If two different panels are both that close and roughly equally near,
 *     the result is ambiguous and the UI shows a small chooser.
 *  4. Empty space further away selects nothing.
 *  5. A tap inside a big panel but within ~half a fingertip of a panel that
 *     is narrower than a fingertip (roof strip, lamp, mirror) asks too.
 */
import type { DiagramView } from "./geometry/views";
import { distToPoly, pointInPoly, type Pt } from "./geometry/poly";

export interface TapResult {
  panelId: string | null;
  /** >1 entries means "ask the driver which one". */
  candidates: string[];
  inside: boolean;
}

/** A panel narrower than one fingertip (in either direction). */
function isTiny(p: DiagramView["panels"][number], tolerance: number): boolean {
  return Math.min(p.bbox.w, p.bbox.h) < tolerance;
}
/** How close (as a fraction of the fingertip tolerance) a tap must be to a tiny panel to ask. */
const TINY_REACH = 0.4;

export function resolveTap(diagram: DiagramView, pt: Pt, tolerance: number): TapResult {
  const inHole = diagram.holes.some((h) => pointInPoly(pt, h));
  for (let i = diagram.panels.length - 1; i >= 0; i--) {
    const p = diagram.panels[i];
    // Body panels are cut away by the wheel arches; tyres are not.
    if (inHole && p.material !== "tyre") continue;
    if (p.polys.some((poly) => pointInPoly(pt, poly))) {
      // Thin/tiny panels (roof strips, lamps, mirrors) narrower than a
      // fingertip can't be hit reliably when they border a big panel: a tap
      // meant for the strip usually lands just inside the neighbour. If this
      // tap is that close to such a panel, ask instead of guessing.
      if (tolerance > 0 && !isTiny(p, tolerance)) {
        const near = diagram.panels
          .filter((q) => q.id !== p.id && isTiny(q, tolerance))
          .map((q) => ({ id: q.id, d: Math.min(...q.polys.map((poly) => distToPoly(pt, poly))) }))
          .filter((q) => q.d <= tolerance * TINY_REACH)
          .sort((x, y) => x.d - y.d)
          .map((q) => q.id);
        if (near.length) return { panelId: null, candidates: [...near.slice(0, 3), p.id], inside: true };
      }
      return { panelId: p.id, candidates: [p.id], inside: true };
    }
  }
  const near = diagram.panels
    .map((p) => ({ id: p.id, d: Math.min(...p.polys.map((poly) => distToPoly(pt, poly))) }))
    .filter((x) => x.d <= tolerance)
    .sort((a, b) => a.d - b.d);
  if (!near.length) return { panelId: null, candidates: [], inside: false };
  const [first, second] = near;
  if (second && second.id !== first.id && second.d - first.d < tolerance * 0.35) {
    const ids = [...new Set(near.filter((n) => n.d - first.d < tolerance * 0.35).map((n) => n.id))].slice(0, 4);
    return { panelId: null, candidates: ids, inside: false };
  }
  return { panelId: first.id, candidates: [first.id], inside: false };
}

/** Panel-relative position (0..1 within the panel's bounding box in that view). */
export function toPanelUV(diagram: DiagramView, panelId: string, pt: Pt): { u: number; v: number } | null {
  const p = diagram.panels.find((x) => x.id === panelId);
  if (!p) return null;
  const { x, y, w, h } = p.bbox;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return { u: clamp((pt[0] - x) / (w || 1)), v: clamp((pt[1] - y) / (h || 1)) };
}

export function fromPanelUV(diagram: DiagramView, panelId: string, uv: { u: number; v: number }): Pt | null {
  const p = diagram.panels.find((x) => x.id === panelId);
  if (!p) return null;
  const pt: Pt = [p.bbox.x + uv.u * p.bbox.w, p.bbox.y + uv.v * p.bbox.h];
  // If the stored point no longer falls on the panel (e.g. a concave panel or a
  // future geometry revision), fall back to the panel's anchor so the pin is
  // never drawn on a neighbouring panel.
  const onPanel =
    p.polys.some((poly) => pointInPoly(pt, poly)) &&
    (p.material === "tyre" || !diagram.holes.some((h) => pointInPoly(pt, h)));
  return onPanel ? pt : p.anchor;
}

export function hasPanel(diagram: DiagramView, panelId: string): boolean {
  return diagram.panels.some((p) => p.id === panelId);
}
