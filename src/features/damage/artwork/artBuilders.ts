/**
 * Builds selectable panel geometry on top of a supplied vehicle illustration.
 *
 * Inputs per view:
 *   • pixel data extracted from the artwork itself (artPixels.ts): outline,
 *     glass/dark regions, red lamps;
 *   • a small hand-read spec (artSpecs.ts): wheel circles, the artwork's own
 *     shut lines (as two-point lines), sill/bumper levels, headlight & mirror
 *     outlines.
 * Output is the same DiagramView the vector families produce, so hit-testing,
 * pins and every orientation test apply unchanged.
 */
import type { DiagramView, PanelShape, ViewId } from "../geometry/views";
import { panel } from "../geometry/views";
import {
  bbox, clipConvex, ellipse, leftOf, rightOf, toPath, vcut, xRange, yRange, area,
  type Cut, type Poly, type Pt,
} from "../geometry/poly";
import { ART_PIXELS, type ArtPixels } from "./artPixels";

const BIG = 5000;
export type Line = [Pt, Pt];

const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const cutOf = (l: Line): Cut => ({ a: l[0], b: l[1] });
const mirrorPts = (pts: Pt[], c: number): Pt[] => pts.map(([x, y]) => [2 * c - x, y] as Pt).reverse();

type Spec = Array<[id: string, material: PanelShape["material"], polys: (Poly | null | undefined)[]]>;

function assemble(
  view: ViewId,
  px: ArtPixels,
  href: string,
  outline: Poly,
  spec: Spec,
  wheels: { id: string; cx: number; cy: number; r: number; arch: number }[] = [],
): Omit<DiagramView, "bodyType"> {
  const panels = spec
    .map(([id, material, polys]) => panel(id, polys.filter((p): p is Poly => !!p && p.length >= 3), material))
    .filter((p): p is PanelShape => !!p);
  for (const w of wheels) {
    const p = panel(w.id, [ellipse(w.cx, w.cy, w.r, w.r, 56)], "tyre");
    if (p) panels.push(p);
  }
  return {
    view,
    viewBox: { x: 0, y: 0, w: px.w, h: px.h },
    under: [], base: [], over: [],
    panels,
    outline: toPath(outline),
    holes: wheels.map((w) => ellipse(w.cx, w.cy, w.arch, w.arch, 64)),
    image: { href, w: px.w, h: px.h },
  };
}

/** Dark region best matching a predicate (largest area wins). */
function pickDark(px: ArtPixels, ok: (b: { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }) => boolean): Poly | null {
  let best: Poly | null = null, bestA = 0;
  for (const d of px.darks) {
    const [x0, y0, x1, y1] = d.bbox;
    if (!ok({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 })) continue;
    if (d.area > bestA) { bestA = d.area; best = d.poly; }
  }
  return best;
}

// ── side ──────────────────────────────────────────────────────────────

export interface SideSpec {
  /** where the vehicle's front is in this image */
  front: "left" | "right";
  layout: "car4" | "car2" | "pickup";
  wheels: { front: [number, number, number]; rear: [number, number, number] };
  /** arch radius as a multiple of tyre radius */
  arch?: number;
  ground: number;
  /** shut lines, each [top point, bottom point] */
  bumperF: Line; doorF: Line; b: Line; c?: Line; bumperR: Line;
  sill: [top: number, bottom: number];
  /** bottom of the roof strip (null = no roof, e.g. roof-down convertible) */
  roofCap: number | null;
  /** x of each window pillar, front to rear */
  pillars: number[];
  head: Pt[];
  mirror: Pt[];
  /** optional explicit side-window polygon if pixel pick is unsuitable */
  dlo?: Pt[];
  /** roof-down convertible: no side windows; windscreen + stowed-roof deck instead */
  windowsDown?: boolean;
  windscreen?: Pt[];
  deck?: Pt[];
}

export function buildSide(view: "left" | "right", key: string, href: string, s: SideSpec) {
  const px = ART_PIXELS[key];
  const side = view; // ids follow the physical side shown
  const S = clipConvex(px.outline, rect(-BIG, -BIG, BIG, s.ground));
  const toFront = (p: Poly, l: Line) => (s.front === "left" ? leftOf(p, cutOf(l)) : rightOf(p, cutOf(l)));
  const toRear = (p: Poly, l: Line) => (s.front === "left" ? rightOf(p, cutOf(l)) : leftOf(p, cutOf(l)));
  const between = (p: Poly, fwd: Line, aft: Line) => toFront(toRear(p, fwd), aft);
  const aboveY = (p: Poly, y: number) => yRange(p, -BIG, y);
  const k = s.arch ?? 1.28;
  const [fx, fy, fr] = s.wheels.front, [rx, ry, rr] = s.wheels.rear;
  const archF = fr * k, archR = rr * k;
  const sillX0 = s.front === "left" ? fx + archF : rx + archR;
  const sillX1 = s.front === "left" ? rx - archR : fx - archF;
  const sill = yRange(xRange(S, sillX0, sillX1), s.sill[0], s.sill[1]);

  const id = (base: string) => base.replace("{s}", side);
  const out: Spec = [
    ["front_bumper", "paint", [toFront(S, s.bumperF)]],
    [id("front_{s}_wing"), "paint", [between(S, s.bumperF, s.doorF)]],
  ];
  if (s.layout === "car4" || s.layout === "pickup") {
    out.push(
      [id("front_{s}_door"), "paint", [aboveY(between(S, s.doorF, s.b), s.sill[0])]],
      [id("rear_{s}_door"), "paint", [aboveY(between(S, s.b, s.c!), s.sill[0])]],
      s.layout === "pickup"
        ? [id("{s}_bed_side"), "paint", [between(S, s.c!, s.bumperR)]]
        : [id("rear_{s}_quarter"), "paint", [between(S, s.c!, s.bumperR)]],
    );
  } else {
    out.push(
      [id("front_{s}_door"), "paint", [aboveY(between(S, s.doorF, s.b), s.sill[0])]],
      [id("rear_{s}_quarter"), "paint", [between(S, s.b, s.bumperR)]],
    );
  }
  out.push(["rear_bumper", "paint", [toRear(S, s.bumperR)]], [id("{s}_sill"), "paintShade", [sill]]);
  if (s.roofCap != null) out.push(["roof", "paint", [aboveY(S, s.roofCap)]]);

  if (s.deck) out.push(["rear_deck", "trim", [s.deck]]);
  if (s.windscreen) out.push(["windscreen", "glass", [s.windscreen]]);
  // windows: the artwork's own glass region, split at the pillars
  const dlo = s.windowsDown ? null : s.dlo ?? pickDark(px, (b) => b.cy < px.h * 0.42 && b.x1 - b.x0 > px.w * 0.12);
  if (dlo) {
    const names =
      s.layout === "car2"
        ? [id("front_{s}_window"), id("rear_{s}_quarter_glass")]
        : [id("front_{s}_window"), id("rear_{s}_window"), id("rear_{s}_quarter_glass")];
    const xs = s.pillars;
    for (let i = 0; i <= xs.length && i < names.length; i++) {
      // walk front → rear
      const lo = i === 0 ? null : xs[i - 1];
      const hi = i === xs.length ? null : xs[i];
      let piece = dlo;
      const gap = 1.5;
      if (s.front === "left") {
        if (lo != null) piece = rightOf(piece, vcut(lo + gap));
        if (hi != null) piece = leftOf(piece, vcut(hi - gap));
      } else {
        if (lo != null) piece = leftOf(piece, vcut(lo - gap));
        if (hi != null) piece = rightOf(piece, vcut(hi + gap));
      }
      if (area(piece) > 20) out.push([names[i], "glass", [piece]]);
    }
  }
  // lamps & mirror
  const reds = px.reds.filter((r) => area(r) > 20);
  const rearSideX = s.front === "left" ? px.w : 0;
  // the tail lamp is the largest red region near the rear edge (small low ones are reflectors)
  const nearRear = reds.filter((r) => Math.abs(cx(r) - rearSideX) < px.w * 0.22);
  const tail = (nearRear.length ? nearRear : reds).sort((a, b) => area(b) - area(a))[0];
  out.push(
    [id("{s}_headlight"), "light", [s.head]],
    ...(tail ? [[id("{s}_taillight"), "tail", [tail]] as Spec[number]] : []),
    [id("{s}_mirror"), "trim", [s.mirror]],
  );
  return assemble(view, px, href, S, out, [
    { id: id("front_{s}_wheel"), cx: fx, cy: fy, r: fr, arch: archF },
    { id: id("rear_{s}_wheel"), cx: rx, cy: ry, r: rr, arch: archR },
  ]);
}
const cx = (p: Poly) => { const b = bbox(p); return b.x + b.w / 2; };
const cy = (p: Poly) => { const b = bbox(p); return b.y + b.h / 2; };

// ── front ─────────────────────────────────────────────────────────────

export interface FrontSpec {
  centre: number;
  ground: number;
  /** null = roof-down convertible (no roof panel) */
  roofCap: number | null;
  bonnet: [top: number, bottom: number];
  /** x of the wing/bonnet boundary on the viewer's left (mirrored for the right) */
  wingX: number;
  wingBottom: number;
  /** y where the tyres become visible below the bumper */
  tyreTop: number;
  /** viewer's-left tyre x-range (mirrored for the right) */
  tyreX: [number, number];
  grille: Pt[];
  /** viewer's-left headlight (= vehicle RIGHT headlight); mirrored for the other */
  head: Pt[];
  /** viewer's-left mirror (= vehicle RIGHT mirror) */
  mirror: Pt[];
  /** use the artwork's dark region for the windscreen (default) or an explicit polygon */
  glass?: Pt[];
}

export function buildFront(key: string, href: string, s: FrontSpec) {
  const px = ART_PIXELS[key];
  const c = s.centre;
  const S = clipConvex(px.outline, rect(-BIG, -BIG, BIG, s.ground));
  const glass = s.glass ?? pickDark(px, (b) => b.y0 < px.h * 0.25 && b.x1 - b.x0 > px.w * 0.4);
  const wR = 2 * c - s.wingX;
  const tyreR: [number, number] = [2 * c - s.tyreX[1], 2 * c - s.tyreX[0]];
  // FRONT view: vehicle-left is on the viewer's RIGHT.
  return assemble("front", px, href, S, [
    ["front_right_wheel", "tyre", [yRange(xRange(S, s.tyreX[0], s.tyreX[1]), s.tyreTop, BIG)]],
    ["front_left_wheel", "tyre", [yRange(xRange(S, tyreR[0], tyreR[1]), s.tyreTop, BIG)]],
    ...(s.roofCap != null ? ([["roof", "paint", [yRange(S, -BIG, s.roofCap)]]] as Spec) : []),
    ["front_bumper", "paint", [yRange(xRange(S, s.wingX, wR), s.bonnet[1], s.tyreTop), yRange(S, s.wingBottom, s.tyreTop)]],
    ["bonnet", "paint", [yRange(xRange(S, s.wingX, wR), s.bonnet[0], s.bonnet[1])]],
    ["front_right_wing", "paint", [yRange(xRange(S, -BIG, s.wingX), s.bonnet[0], s.wingBottom)]],
    ["front_left_wing", "paint", [yRange(xRange(S, wR, BIG), s.bonnet[0], s.wingBottom)]],
    ["windscreen", "glass", [glass]],
    ["front_grille", "trim", [s.grille]],
    ["right_headlight", "light", [s.head]],
    ["left_headlight", "light", [mirrorPts(s.head, c)]],
    ["right_mirror", "trim", [s.mirror]],
    ["left_mirror", "trim", [mirrorPts(s.mirror, c)]],
  ]);
}

// ── rear ──────────────────────────────────────────────────────────────

export interface RearSpec {
  centre: number;
  ground: number;
  /** bottom of the roof strip; null = roof-down convertible */
  roofCap: number | null;
  /** boot lid / tailgate lower edge and its x half-span boundary (viewer's left x) */
  lidX: number;
  lidBottom: number;
  /** boot: top of the lid (deck). tailgate: spans from roofCap. */
  kind: "boot" | "tailgate";
  lidTop: number;
  /** y range of the rear quarter (corner) panels */
  quarter: [number, number];
  tyreTop: number;
  tyreX: [number, number];
  /** viewer's-left mirror (= vehicle LEFT mirror) */
  mirror?: Pt[];
  /** pickup: the load-bed side corners outside lidX are bed sides */
  pickup?: boolean;
  /** convertible: deck behind the cabin, above the boot */
  deck?: [number, number];
  glass?: Pt[] | null;
}

export function buildRear(key: string, href: string, s: RearSpec) {
  const px = ART_PIXELS[key];
  const c = s.centre;
  const S = clipConvex(px.outline, rect(-BIG, -BIG, BIG, s.ground));
  const lidR = 2 * c - s.lidX;
  const tyreR: [number, number] = [2 * c - s.tyreX[1], 2 * c - s.tyreX[0]];
  const glass = s.glass === null ? null : s.glass ?? pickDark(px, (b) => b.y0 < px.h * 0.3 && b.x1 - b.x0 > px.w * 0.3);
  // tail lamps sit above the lid's lower edge (lower red parts are reflectors)
  const reds = px.reds.filter((r) => area(r) > 20 && cy(r) < s.lidBottom);
  const leftTail = reds.filter((r) => cx(r) < c).sort((a, b) => area(b) - area(a))[0];
  const rightTail = reds.filter((r) => cx(r) >= c).sort((a, b) => area(b) - area(a))[0];
  // a hatch/estate/SUV tailgate spans up to the roof; a pickup tailgate stops at the bed
  const lidTop = s.kind === "tailgate" && s.roofCap != null && !s.pickup ? s.roofCap : s.lidTop;
  const sideIds = s.pickup ? ["left_bed_side", "right_bed_side"] : ["rear_left_quarter", "rear_right_quarter"];
  const spec: Spec = [
    // REAR view: vehicle-left is on the viewer's LEFT.
    ["rear_left_wheel", "tyre", [yRange(xRange(S, s.tyreX[0], s.tyreX[1]), s.tyreTop, BIG)]],
    ["rear_right_wheel", "tyre", [yRange(xRange(S, tyreR[0], tyreR[1]), s.tyreTop, BIG)]],
    ["rear_bumper", "paint", [yRange(S, s.lidBottom, s.tyreTop), yRange(xRange(S, -BIG, s.lidX), s.quarter[1], s.tyreTop), yRange(xRange(S, lidR, BIG), s.quarter[1], s.tyreTop)]],
    [sideIds[0], "paint", [yRange(xRange(S, -BIG, s.lidX), s.quarter[0], s.quarter[1])]],
    [sideIds[1], "paint", [yRange(xRange(S, lidR, BIG), s.quarter[0], s.quarter[1])]],
    [s.kind, "paint", [yRange(xRange(S, s.lidX, lidR), lidTop, s.lidBottom)]],
  ];
  if (s.deck) spec.push(["rear_deck", "paint", [yRange(S, s.deck[0], s.deck[1])]]);
  if (s.roofCap != null) spec.push(["roof", "paint", [yRange(S, -BIG, s.roofCap)]]);
  if (glass) spec.push(["rear_windscreen", "glass", [glass]]);
  if (leftTail) spec.push(["left_taillight", "tail", [leftTail]]);
  if (rightTail) spec.push(["right_taillight", "tail", [rightTail]]);
  if (s.mirror) spec.push(["left_mirror", "trim", [s.mirror]], ["right_mirror", "trim", [mirrorPts(s.mirror, c)]]);
  return assemble("rear", px, href, S, spec);
}

// ── top (front up, vehicle-left on the viewer's left) ─────────────────

export interface TopSpec {
  /** x range of the body (trims the soft drop shadow beside the car) */
  bodyX: [number, number];
  /** inner x of the left side strip (doors seen from above); mirrored about centre */
  stripX: number;
  centre: number;
  bumperF: number;
  /** bonnet → windscreen */
  bonnetEnd: number;
  roof: [number, number];
  /** start of boot/tailgate (after the rear glass) */
  bootStart: number;
  bumperR: number;
  /** door seam y positions: [wing|front door, front|rear door (B), rear door|quarter (C)] */
  seams: number[];
  layout: "car4" | "car2" | "pickup";
  mirrors: [Pt[], Pt[]];
  kind: "boot" | "tailgate";
  /** pickup: load bed y-range */
  bed?: [number, number];
  /** convertible: open cabin y-range (not a panel) and rear deck */
  deck?: [number, number];
  roofDown?: boolean;
}

export function buildTop(key: string, href: string, s: TopSpec) {
  const px = ART_PIXELS[key];
  const S = clipConvex(px.outline, rect(s.bodyX[0], -BIG, s.bodyX[1], BIG));
  const inR = 2 * s.centre - s.stripX;
  const C = xRange(S, s.stripX, inR);
  const L = xRange(S, -BIG, s.stripX);
  const R = xRange(S, inR, BIG);
  const yr = (p: Poly, a: number, b: number) => yRange(p, a, b);
  // glass = the artwork's dark region, clipped to its band (dark trim can merge into it)
  const band = (y0: number, y1: number) => {
    const d = pickDark(px, (b) => b.y0 < y1 && b.y1 > y0 && b.x1 - b.x0 > px.w * 0.3);
    if (!d) return null;
    const p = clipConvex(yRange(d, y0, y1), rect(s.stripX - 6, -BIG, inR + 6, BIG));
    return area(p) > 50 ? p : null;
  };
  const ws = band(s.bonnetEnd - 12, s.roof[0] + 8);
  const rg = s.bed ? null : band(s.roof[1] - 8, s.bootStart + 8);
  const reds = px.reds.filter((r) => area(r) > 15);
  const leftTail = reds.filter((r) => cx(r) < s.centre).sort((a, b) => area(b) - area(a))[0];
  const rightTail = reds.filter((r) => cx(r) >= s.centre).sort((a, b) => area(b) - area(a))[0];
  const [w, b2, c3] = s.seams;
  const sideSpec = (strip: Poly, side: "left" | "right"): Spec => {
    const out: Spec = [[`front_${side}_wing`, "paint", [yr(strip, s.bumperF, w)]]];
    if (s.layout === "car4") {
      out.push(
        [`front_${side}_door`, "paint", [yr(strip, w, b2)]],
        [`rear_${side}_door`, "paint", [yr(strip, b2, c3)]],
        [`rear_${side}_quarter`, "paint", [yr(strip, c3, s.bumperR)]],
      );
    } else if (s.layout === "car2") {
      out.push([`front_${side}_door`, "paint", [yr(strip, w, b2)]], [`rear_${side}_quarter`, "paint", [yr(strip, b2, s.bumperR)]]);
    } else {
      out.push(
        [`front_${side}_door`, "paint", [yr(strip, w, b2)]],
        [`rear_${side}_door`, "paint", [yr(strip, b2, c3)]],
        [`${side}_bed_side`, "paint", [yr(strip, c3, s.bumperR)]],
      );
    }
    return out;
  };
  const spec: Spec = [
    ["front_bumper", "paint", [yr(S, -BIG, s.bumperF)]],
    ["rear_bumper", "paint", [yr(S, s.bumperR, BIG)]],
    ["bonnet", "paint", [yr(C, s.bumperF, s.bonnetEnd)]],
  ];
  if (s.bed) {
    spec.push(
      ["roof", "paint", [yr(C, s.roof[0], s.roof[1])]],
      ["load_bed", "bed", [yr(C, s.bed[0], s.bed[1])]],
      ["tailgate", "paint", [yr(C, s.bed[1], s.bumperR)]],
    );
  } else if (s.roofDown) {
    spec.push(
      ["rear_deck", "paint", [yr(C, s.deck![0], s.deck![1])]],
      [s.kind, "paint", [yr(C, s.bootStart, s.bumperR)]],
    );
  } else {
    spec.push(
      ["roof", "paint", [yr(C, s.roof[0], s.roof[1])]],
      [s.kind, "paint", [yr(C, s.bootStart, s.bumperR)]],
    );
  }
  spec.push(...sideSpec(L, "left"), ...sideSpec(R, "right"));
  if (ws) spec.push(["windscreen", "glass", [ws]]);
  if (rg && !s.roofDown) spec.push(["rear_windscreen", "glass", [rg]]);
  if (leftTail) spec.push(["left_taillight", "tail", [leftTail]]);
  if (rightTail) spec.push(["right_taillight", "tail", [rightTail]]);
  spec.push(["left_mirror", "trim", [s.mirrors[0]]], ["right_mirror", "trim", [s.mirrors[1]]]);
  return assemble("top", px, href, S, spec);
}
