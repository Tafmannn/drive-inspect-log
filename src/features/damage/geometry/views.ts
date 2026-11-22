/**
 * Parametric generator for the 9 body families × 5 views (45 diagrams).
 *
 * Every view of a family is derived from ONE BodySpec, so the plan, side,
 * front and rear drawings always describe the same vehicle. Panels are real
 * polygons (clipped out of the silhouette), so what is drawn is exactly what
 * is tappable.
 *
 * Coordinate conventions (SVG, y grows downwards):
 *   • side views: ground at y = 0, heights are negative y. LEFT view has the
 *     vehicle front at the viewer's left; RIGHT view is its mirror image.
 *   • front/rear views: x = 0 on the centre line. FRONT view: vehicle-left
 *     is at +x (viewer's right). REAR view: vehicle-left is at −x.
 *   • top view: front at y = 0 (top of screen), vehicle-left at −x.
 */
import type { BodyType } from "../bodyTypes";
import { mirrorPanelId } from "../panels";
import { SPECS, type BodySpec } from "./specs";
import { buildVanArtView } from "../artwork/vanArtwork";
import {
  PathBuilder, type Poly, type Pt, type BBox,
  above, below, aboveLine, belowLine, between, leftOf, rightOf, vcut, xRange, yRange,
  clipConvex, roundRect, ellipse, mirrorX, area, bbox, interiorPoint, toPath, pointInPoly, distToPoly,
  type Cut,
} from "./poly";

export const VIEW_IDS = ["top", "front", "rear", "left", "right"] as const;
export type ViewId = (typeof VIEW_IDS)[number];
export const VIEW_LABELS: Record<ViewId, string> = {
  top: "Top", front: "Front", rear: "Rear", left: "Left", right: "Right",
};

export type Material =
  | "paint" | "paintShade" | "glass" | "light" | "tail" | "tyre" | "rim"
  | "trim" | "fabric" | "bed" | "plate" | "shadow" | "line" | "highlight";

export interface PanelShape {
  id: string;
  polys: Poly[];
  material: Material;
  d: string;
  bbox: BBox;
  /** A point well inside the panel (labels, default pin position, tests). */
  anchor: Pt;
}

export interface DecorShape {
  d: string;
  material: Material;
  opacity?: number;
}

export interface DiagramView {
  bodyType: BodyType;
  view: ViewId;
  viewBox: BBox;
  /** drawn first (shadows, arch liners) */
  under: DecorShape[];
  /** non-interactive body paint behind the panels (pillars, seams) */
  base: DecorShape[];
  /** selectable panels, back-to-front (later = on top) */
  panels: PanelShape[];
  /** non-interactive details on top (handles, plates, highlights) */
  over: DecorShape[];
  /** silhouette outline for the crisp outer stroke */
  outline: string;
  /** wheel-arch openings: body panels are clipped by these (tyres are not) */
  holes: Poly[];
  /**
   * Raster artwork drawn under the (transparent) panel polygons. Set for body
   * families illustrated with supplied artwork (currently: van). The panel
   * polygons are traced onto this image in its own pixel coordinates.
   */
  image?: { href: string; w: number; h: number };
}

// ── helpers ───────────────────────────────────────────────────────────

const Y = (h: number) => -h;
const MIN_AREA = 2;

export function panel(id: string, polys: Poly[], material: Material = "paint"): PanelShape | null {
  const ps = polys.filter((p) => p.length >= 3 && area(p) > MIN_AREA);
  if (!ps.length) return null;
  const all = ps.flat();
  const largest = ps.reduce((a, b) => (area(b) > area(a) ? b : a));
  return {
    id, polys: ps, material,
    d: ps.map(toPath).join(""),
    bbox: bbox(all),
    anchor: interiorPoint(largest),
  };
}

const decor = (polys: Poly | Poly[], material: Material, opacity?: number): DecorShape => {
  const list = (Array.isArray(polys[0]?.[0]) ? polys : [polys]) as Poly[];
  return { d: list.filter((p) => p.length >= 2).map(toPath).join(""), material, opacity };
};

/** Open polyline as a stroke-only decor line. */
const line = (pts: Pt[], opacity = 1): DecorShape => ({
  d: pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(""),
  material: "line",
  opacity,
});

const cut = (top: Pt, bottom: Pt): Cut => ({ a: top, b: bottom });

function compact<T>(xs: (T | null | undefined | false)[]): T[] {
  return xs.filter(Boolean) as T[];
}

// ── SIDE (left) ───────────────────────────────────────────────────────

function sideSilhouette(s: BodySpec, solid = false): Poly {
  const { L, H, R, FO, WB } = s;
  const xf = FO, xr = FO + WB, Ra = R + 4.5;
  const dx = Math.sqrt(Ra * Ra - (R - s.sill) * (R - s.sill));
  const aR = Math.atan2(R - s.sill, dx);
  const p = new PathBuilder();
  // nose
  p.move(5, Y(s.bumperBottom));
  p.quad(-1, Y(s.bumperBottom + 3), 0, Y(s.noseH));
  p.quad(-0.5, Y(s.bonnetFrontH - 1), s.bonnetFrontX, Y(s.bonnetFrontH));
  // bonnet
  p.quad(
    (s.bonnetFrontX + s.cowlX) / 2, Y(s.bonnetFrontH + (s.cowlH - s.bonnetFrontH) * 0.86),
    s.cowlX, Y(s.cowlH),
  );
  // windscreen
  const ws = s.roofFrontX - s.cowlX;
  p.cubic(
    s.cowlX + ws * 0.55, Y(s.cowlH + (H - s.cowlH) * 0.72),
    s.roofFrontX - ws * 0.22, Y(H - 0.3),
    s.roofFrontX, Y(H),
  );
  // roof
  p.quad((s.roofFrontX + s.roofRearX) / 2, Y(H + 1.2), s.roofRearX, Y(H - 1.5));
  // tail
  const rr = s.roofRearX, rg = s.rearGlassBaseX;
  switch (s.tail) {
    case "notch":
      p.cubic(rr + (rg - rr) * 0.45, Y(H - 3), rg - (rg - rr) * 0.3, Y(s.deckH + 4), rg, Y(s.deckH));
      p.quad((rg + L) / 2, Y(s.deckH + 1.5), L - 4, Y(s.deckH - 2));
      p.quad(L - 0.5, Y(s.deckH - 3), L, Y(s.tailMidH));
      break;
    case "hatch":
      p.cubic(rr + 14, Y(H - 1.5), rg - 8, Y(s.deckH + 12), rg, Y(s.deckH));
      p.quad(L + 0.5, Y(s.deckH - 4), L, Y(s.tailMidH));
      break;
    case "square":
      p.quad(rg - 1, Y(H - 1), rg, Y(H - 10));
      p.quad(rg + (L - rg) * 0.8, Y(s.deckH), L, Y(s.tailMidH));
      break;
    case "bed": {
      const cr = s.cabRearX!, bh = s.bedH!;
      p.quad(cr, Y(H - 0.5), cr, Y(H - 9));
      p.line(cr, Y(bh + 1));
      p.line(cr + 4, Y(bh));
      p.line(L - 3, Y(bh));
      p.quad(L, Y(bh), L, Y(bh - 4));
      p.line(L, Y(s.tailMidH));
      break;
    }
  }
  p.quad(L + 1, Y(s.bumperBottom + 3), L - 5, Y(s.bumperBottom));
  if (solid) {
    // arch-free underside used for clipping panels (arches are removed at
    // render/hit-test time as holes, so cut lines never bridge across them)
    p.line(xr + dx + 3, Y(s.sill));
    p.line(xf - dx - 3, Y(s.sill));
    return p.done();
  }
  // underside with wheel arches
  p.line(xr + dx + 3, Y(s.sill));
  p.line(xr + dx, Y(s.sill));
  p.arc(xr, Y(R), Ra, aR, -Math.PI - aR);
  p.line(xf + dx, Y(s.sill));
  p.arc(xf, Y(R), Ra, aR, -Math.PI - aR);
  p.line(xf - dx - 3, Y(s.sill));
  return p.done();
}

function sideDlo(s: BodySpec): Poly {
  const beltAt = (x: number) => s.beltF + (s.beltR - s.beltF) * (x / s.L);
  const top = s.dloTopH ?? s.H - s.roofT;
  const df = s.dloFrontX, tf = s.dloTopFrontX, tr = s.dloTopRearX, dr = s.dloRearX;
  const p = new PathBuilder();
  p.move(df, Y(beltAt(df)));
  p.cubic(
    df + (tf - df) * 0.55, Y(beltAt(df) + (top - beltAt(df)) * 0.72),
    tf - (tf - df) * 0.2, Y(top - 0.3),
    tf, Y(top),
  );
  p.quad((tf + tr) / 2, Y(top + 0.8), tr, Y(top - 1.5));
  if (s.tail === "notch" || s.tail === "hatch") {
    p.cubic(tr + (dr - tr) * 0.45, Y(top - 2), dr - (dr - tr) * 0.2, Y(beltAt(dr) + 6), dr, Y(beltAt(dr)));
  } else {
    p.quad(dr + 1, Y(top - 2), dr, Y(beltAt(dr)));
  }
  return p.done();
}

function wheelDecor(cx: number, cy: number, R: number, out: DecorShape[]) {
  out.push(decor(ellipse(cx, cy, R * 0.66, R * 0.66, 48), "rim"));
  // five spokes as thin wedges
  const spokes: Poly[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const w = 0.22;
    spokes.push([
      [cx + R * 0.16 * Math.cos(a - w * 1.6), cy + R * 0.16 * Math.sin(a - w * 1.6)],
      [cx + R * 0.6 * Math.cos(a - w * 0.45), cy + R * 0.6 * Math.sin(a - w * 0.45)],
      [cx + R * 0.6 * Math.cos(a + w * 0.45), cy + R * 0.6 * Math.sin(a + w * 0.45)],
      [cx + R * 0.16 * Math.cos(a + w * 1.6), cy + R * 0.16 * Math.sin(a + w * 1.6)],
    ]);
  }
  out.push(decor(ellipse(cx, cy, R * 0.6, R * 0.6, 48), "trim", 0.55));
  out.push(decor(spokes, "rim"));
  out.push(decor(ellipse(cx, cy, R * 0.15, R * 0.15, 20), "rim"));
}

function buildLeftSide(s: BodySpec) {
  const { L, R, FO, WB } = s;
  const xf = FO, xr = FO + WB, Ra = R + 4.5;
  const beltAt = (x: number) => s.beltF + (s.beltR - s.beltF) * (x / L);
  const silArched = sideSilhouette(s);
  const sil = sideSilhouette(s, true);
  const holes = [ellipse(xf, Y(R), Ra, Ra, 64), ellipse(xr, Y(R), Ra, Ra, 64)];
  const beltA: Pt = [0, Y(s.beltF)], beltB: Pt = [L, Y(s.beltR)];
  const lower = belowLine(sil, beltA, beltB);
  const upper = aboveLine(sil, beltA, beltB);
  const dloTop = s.dloTopH ?? s.H - s.roofT;
  const roofCapY = Y(dloTop + 2.5);
  const upperBody = below(upper, roofCapY); // upper body under the roof strip

  const cutBF = cut([xf - Ra * 0.3, Y(s.bumperTopF)], [xf - Ra * 0.8, Y(s.sill)]);
  const doorFront = Math.max(s.dloFrontX - 4, xf + Ra + 12);
  const cutWD = cut([doorFront, Y(beltAt(s.dloFrontX))], [doorFront - 7, Y(s.sill)]);
  const cutB = cut([s.bX + 1.5, Y(s.beltF)], [s.bX - 1.5, Y(s.sill)]);
  const cutBR = cut([xr + Ra * 0.3, Y(s.bumperTopR)], [xr + Ra * 0.8, Y(s.sill)]);
  const upperStart = vcut(s.dloFrontX - 3);
  const isConv = !!s.softTop;

  const doorBand = (l: Cut, r: Cut, withUpper = true): Poly[] =>
    compact([
      above(between(lower, l, r), Y(s.sillTop)),
      withUpper && !isConv ? between(upperBody, l, r) : null,
    ]);

  const panels: (PanelShape | null)[] = [];
  const glass: (PanelShape | null)[] = [];
  const dlo = sideDlo(s);

  // wing + front bumper
  panels.push(
    panel("front_bumper", [below(leftOf(lower, cutBF), Y(s.bumperTopF))]),
    panel("front_left_wing", [between(lower, cutBF, cutWD), above(leftOf(lower, cutBF), Y(s.bumperTopF))]),
  );

  let sillEnd: Cut;
  let quarterStart: Cut;
  const layout = s.layout;
  if (layout === "car4" || layout === "pickup") {
    const rearEnd =
      layout === "pickup"
        ? vcut(s.cabRearX! - 1)
        : cut([s.cX, Y(beltAt(s.cX))], [xr - Ra - 2, Y(s.sill)]);
    panels.push(
      panel("front_left_door", [...doorBand(cutWD, cutB).slice(0, 1), ...(isConv ? [] : [between(upperBody, upperStart, cutB)])]),
      panel("rear_left_door", doorBand(cutB, rearEnd)),
    );
    sillEnd = layout === "pickup" ? vcut(s.cabRearX! - 1) : vcut(xr - Ra - 2);
    quarterStart = rearEnd;
    if (layout === "pickup") {
      const bedStart = vcut(s.cabRearX! + 2);
      panels.push(
        panel("left_bed_side", [between(lower, bedStart, cutBR), above(rightOf(lower, cutBR), Y(s.bumperTopR))]),
      );
    } else {
      panels.push(
        panel("rear_left_quarter", [
          between(lower, rearEnd, cutBR),
          above(rightOf(lower, cutBR), Y(s.bumperTopR)),
          rightOf(upperBody, rearEnd),
        ]),
      );
    }
  } else if (layout === "car2") {
    panels.push(
      panel("front_left_door", [above(between(lower, cutWD, cutB), Y(s.sillTop)), ...(isConv ? [] : [between(upperBody, upperStart, cutB)])]),
    );
    sillEnd = vcut(xr - Ra - 2);
    quarterStart = cutB;
    panels.push(
      panel("rear_left_quarter", [
        above(between(lower, cutB, cutBR), Y(s.sillTop)),
        between(lower, sillEnd, cutBR),
        above(rightOf(lower, cutBR), Y(s.bumperTopR)),
        isConv ? rightOf(upper, vcut(s.rearGlassBaseX)) : rightOf(upperBody, cutB),
      ]),
    );
  } else {
    // van: cab door, sliding door, rear load side
    const cutS = vcut(s.cX);
    panels.push(
      panel("front_left_door", [above(between(lower, cutWD, cutB), Y(s.sillTop)), between(upperBody, upperStart, cutB)]),
      panel("left_sliding_door", doorBand(cutB, cutS)),
      panel("left_load_side", [
        between(lower, cutS, cutBR),
        above(rightOf(lower, cutBR), Y(s.bumperTopR)),
        rightOf(upperBody, cutS),
      ]),
    );
    sillEnd = cutS;
    quarterStart = cutS;
  }
  void quarterStart;
  panels.push(
    panel("rear_bumper", [below(rightOf(lower, cutBR), Y(s.bumperTopR))]),
    panel("left_sill", [below(between(lower, cutWD, sillEnd), Y(s.sillTop))], "paintShade"),
  );

  // roof strip / soft top
  if (isConv) {
    panels.push(
      panel("soft_top", [between(upper, vcut(s.roofFrontX - 6), vcut(s.rearGlassBaseX))], "fabric"),
    );
  } else {
    panels.push(panel("roof", [above(sil, roofCapY)]));
  }

  // windows
  const pw = 3.5;
  if (layout === "car4" || layout === "pickup") {
    glass.push(panel("front_left_window", [leftOf(dlo, vcut(s.bX - pw))], "glass"));
    if (s.qX) {
      glass.push(
        panel("rear_left_window", [between(dlo, vcut(s.bX + pw), vcut(s.qX - pw))], "glass"),
        panel("rear_left_quarter_glass", [rightOf(dlo, vcut(s.qX + pw))], "glass"),
      );
    } else {
      glass.push(panel("rear_left_window", [rightOf(dlo, vcut(s.bX + pw))], "glass"));
    }
  } else if (layout === "car2") {
    glass.push(panel("front_left_window", [leftOf(dlo, vcut(s.bX - pw))], "glass"));
    if (s.qX) glass.push(panel("rear_left_quarter_glass", [rightOf(dlo, vcut(s.qX + pw))], "glass"));
  } else {
    glass.push(panel("front_left_window", [leftOf(dlo, vcut(s.bX - pw - 1))], "glass"));
  }

  // lamps & mirror
  const hl = clipConvex(sil, [
    [-3, Y(s.bonnetFrontH + 4)],
    [s.hlLen, Y(s.bonnetFrontH + 2)],
    [s.hlLen - 6, Y(s.bonnetFrontH - s.hlH + 1)],
    [-3, Y(s.bonnetFrontH - s.hlH - 1)],
  ]);
  const tl = clipConvex(sil, [
    [L - s.tlLen, Y(s.tlTopH)],
    [L + 3, Y(s.tlTopH + 1)],
    [L + 3, Y(s.tlBotH)],
    [L - s.tlLen + 4, Y(s.tlBotH)],
  ]);
  const mx = s.dloFrontX + 2, my = Y(beltAt(s.dloFrontX) + 2);
  const mirror = new PathBuilder()
    .move(mx - 2, my)
    .quad(mx - 3, my - 9, mx + 6, my - 10)
    .quad(mx + 15, my - 10, mx + 15, my - 4)
    .quad(mx + 15, my + 1, mx + 6, my + 1)
    .done();

  const wheels = [
    panel("front_left_wheel", [ellipse(xf, Y(R), R, R, 56)], "tyre"),
    panel("rear_left_wheel", [ellipse(xr, Y(R), R, R, 56)], "tyre"),
  ];

  const under: DecorShape[] = [
    decor(ellipse(L / 2, 1.5, L * 0.53, 5.5, 60), "shadow"),
    decor(
      [above(ellipse(xf, Y(R), Ra - 0.4, Ra - 0.4, 56), Y(s.sill)), above(ellipse(xr, Y(R), Ra - 0.4, Ra - 0.4, 56), Y(s.sill))],
      "trim",
    ),
  ];
  const over: DecorShape[] = [];
  wheelDecor(xf, Y(R), R, over);
  wheelDecor(xr, Y(R), R, over);
  // door handles
  const handleY = Y(beltAt(s.bX) - 7);
  const handles: Poly[] = [roundRect(s.bX - 24, handleY, 13, 3.2, 1.6)];
  if (layout === "car4" || layout === "pickup") {
    const re = layout === "pickup" ? s.cabRearX! : s.cX;
    handles.push(roundRect(re - 22, Y(beltAt(re) - 7), 13, 3.2, 1.6));
  }
  if (layout === "van") handles.push(roundRect(s.bX + 10, handleY - 2, 14, 3.2, 1.6));
  over.push(decor(handles, "trim", 0.6));
  // character line
  over.push(line([[xf + Ra + 6, Y(s.beltF - 9)], [xr - Ra * 0.2, Y(s.beltR - 8)]], 0.45));
  // glass reflections
  over.push(
    decor(
      clipConvex(dlo, [
        [s.dloTopFrontX + 10, Y(dloTop + 5)],
        [s.dloTopFrontX + 40, Y(dloTop + 5)],
        [s.dloFrontX + 40, Y(beltAt(s.dloFrontX) - 3)],
        [s.dloFrontX + 14, Y(beltAt(s.dloFrontX) - 3)],
      ]),
      "highlight",
      0.16,
    ),
  );

  const lamps = [
    panel("left_headlight", [hl], "light"),
    panel("left_taillight", [tl], "tail"),
    panel("left_mirror", [mirror]),
  ];
  return {
    under,
    base: [decor(silArched, "paint")],
    panels: compact([...panels, ...glass, ...lamps, ...wheels]),
    over,
    outline: toPath(silArched),
    holes,
  };
}

// ── FRONT / REAR outline ──────────────────────────────────────────────

function endOutline(s: BodySpec, shoulderH: number, baseH: number, hw: number, g: number, r: number): Poly {
  const bb = s.bumperBottom;
  const right = new PathBuilder()
    .move(0, Y(bb))
    .line(hw * 0.76, Y(bb))
    .quad(hw * 0.94, Y(bb), hw * 0.965, Y(bb + 12))
    .quad(hw * 1.01, Y((bb + shoulderH) / 2), hw * 0.985, Y(shoulderH - 7))
    .quad(hw * 0.97, Y(shoulderH + 0.5), hw * 0.88, Y(shoulderH + 1))
    .quad(g + (hw * 0.88 - g) * 0.3, Y(baseH + 1), g, Y(baseH + 3))
    .quad(r + (g - r) * 0.25, Y(s.H - (s.H - baseH) * 0.12), r + 3, Y(s.H - 3))
    .quad(r + 1, Y(s.H), r - 6, Y(s.H))
    .line(0, Y(s.H))
    .done();
  const left = mirrorX(right, 0);
  // right goes bottom-centre → top-centre; left (mirrored+reversed) goes top-centre → bottom-centre
  return [...right, ...left.slice(1, -1)];
}

function tyreStubs(s: BodySpec, hw: number, ids: [string, string]) {
  const tw = s.W * 0.13, th = hw * 0.83;
  return [
    // ids[0] at −x, ids[1] at +x
    panel(ids[0], [roundRect(-th - tw / 2, Y(s.R * 1.25), tw, s.R * 1.25, 5)], "tyre"),
    panel(ids[1], [roundRect(th - tw / 2, Y(s.R * 1.25), tw, s.R * 1.25, 5)], "tyre"),
  ];
}

function sideMirrors(s: BodySpec, hw: number, g: number, h: number, ids: [string, string]) {
  const m = new PathBuilder()
    .move(g - 1, Y(h + 3))
    .line(hw + 4, Y(h + 4))
    .quad(hw + 15, Y(h + 4), hw + 15, Y(h + 10))
    .quad(hw + 15, Y(h + 15), hw + 5, Y(h + 15))
    .line(g + 2, Y(h + 11))
    .done();
  return [panel(ids[0], [mirrorX(m, 0)]), panel(ids[1], [m])];
}

function buildFront(s: BodySpec) {
  const hw = s.W / 2, g = hw * s.endGreenW, r = hw * s.endRoofW;
  const out = endOutline(s, s.beltF, s.cowlH, hw, g, r);
  const colX = hw * 0.78;
  const top = s.H - s.roofT;
  const gw = s.W * s.grilleW;
  const side = (pos: boolean, poly: Poly) => (pos ? xRange(poly, colX, 1e4) : xRange(poly, -1e4, -colX));

  const windscreen = new PathBuilder()
    .move(-(g - 6), Y(s.cowlH + 3))
    .quad(0, Y(s.cowlH - 1), g - 6, Y(s.cowlH + 3))
    .line(r - 2, Y(top))
    .quad(0, Y(top + 2), -(r - 2), Y(top))
    .done();

  const hlR = clipConvex(out, [
    [gw + 3, Y(s.bonnetFrontH - 1)],
    [hw - 1, Y(s.bonnetFrontH + 2)],
    [hw - 2, Y(s.bonnetFrontH - s.hlH + 1)],
    [gw + 6, Y(s.bonnetFrontH - s.hlH * 0.8)],
  ]);
  const grille = roundRect(-gw, Y(s.bonnetFrontH - 2), gw * 2, s.grilleH, 5);
  const centre = xRange(out, -colX, colX);
  const panels = compact([
    ...tyreStubs(s, hw, ["front_right_wheel", "front_left_wheel"]),
    panel("front_bumper", [below(centre, Y(s.bonnetFrontH)), below(side(true, out), Y(s.bumperTopF)), below(side(false, out), Y(s.bumperTopF))]),
    panel("bonnet", [yRange(centre, Y(s.cowlH), Y(s.bonnetFrontH))]),
    // vehicle-left is at +x (viewer's right) in the front view
    panel("front_left_wing", [yRange(side(true, out), Y(s.beltF), Y(s.bumperTopF))]),
    panel("front_right_wing", [yRange(side(false, out), Y(s.beltF), Y(s.bumperTopF))]),
    panel(s.softTop ? "soft_top" : "roof", [above(out, Y(top))], s.softTop ? "fabric" : "paint"),
    panel("windscreen", [windscreen], "glass"),
    panel("front_grille", [grille], "trim"),
    panel("left_headlight", [hlR], "light"),
    panel("right_headlight", [mirrorX(hlR, 0)], "light"),
    ...sideMirrors(s, hw, g, s.beltF, ["right_mirror", "left_mirror"]),
  ]);
  const plateY = Y(s.bumperTopF - 4);
  const over: DecorShape[] = [
    decor(roundRect(-26, plateY, 52, 11, 1.5), "plate"),
    decor(roundRect(-hw * 0.55, Y(s.bumperBottom + 12), hw * 1.1, 8, 4), "trim", 0.9),
    line([[-(g - 10), Y(s.cowlH - 3)], [g - 10, Y(s.cowlH - 3)]], 0.35),
    decor(
      clipConvex(windscreen, [[-g * 0.2, Y(top)], [g * 0.15, Y(top)], [-g * 0.05, Y(s.cowlH)], [-g * 0.4, Y(s.cowlH)]]),
      "highlight", 0.14,
    ),
  ];
  return {
    under: [decor(ellipse(0, 1.5, hw * 1.08, 5, 50), "shadow")],
    base: [decor(out, "paint")],
    panels,
    over,
    outline: toPath(out),
  };
}

function buildRear(s: BodySpec) {
  const hw = s.W / 2, g = hw * s.endGreenW, r = hw * s.endRoofW;
  const isBed = s.tail === "bed";
  const shoulder = isBed ? s.bedH! : s.beltR;
  const glassBase = s.tail === "notch" ? s.deckH : isBed ? s.bedH! + 4 : s.beltR;
  const out = endOutline(s, shoulder, glassBase, hw, g, r);
  const top = s.H - s.roofT;
  const panels: (PanelShape | null)[] = [...tyreStubs(s, hw, ["rear_left_wheel", "rear_right_wheel"])];
  const L = (poly: Poly, x: number) => xRange(poly, -1e4, -x);
  const Rr = (poly: Poly, x: number) => xRange(poly, x, 1e4);
  const over: DecorShape[] = [];

  panels.push(panel("rear_bumper", [below(out, Y(s.bumperTopR))]));

  if (s.layout === "van") {
    const cx = hw * 0.88;
    const doorH = yRange(out, Y(top), Y(s.bumperTopR));
    panels.push(
      panel("left_load_side", [L(doorH, cx)]),
      panel("right_load_side", [Rr(doorH, cx)]),
      panel("left_rear_cargo_door", [xRange(doorH, -cx, -0.8)]),
      panel("right_rear_cargo_door", [xRange(doorH, 0.8, cx)]),
      panel("roof", [above(out, Y(top))]),
    );
    const tlL = roundRect(-hw + 1, Y(s.tlTopH), hw - cx - 1.5, s.tlTopH - s.tlBotH, 2);
    panels.push(panel("left_taillight", [tlL], "tail"), panel("right_taillight", [mirrorX(tlL, 0)], "tail"));
    const win = roundRect(-cx + 8, Y(s.dloTopH ?? 196), cx - 14, 46, 4);
    over.push(decor([win, mirrorX(win, 0)], "glass"));
    over.push(decor([roundRect(-14, Y(s.bumperTopR + 70), 9, 3.5, 1.5), roundRect(5, Y(s.bumperTopR + 70), 9, 3.5, 1.5)], "trim", 0.7));
  } else if (isBed) {
    const cx = hw * 0.86;
    const tg = yRange(out, Y(s.bedH!), Y(s.bumperTopR));
    panels.push(
      panel("left_bed_side", [L(tg, cx)]),
      panel("right_bed_side", [Rr(tg, cx)]),
      panel("tailgate", [xRange(tg, -cx, cx)]),
      panel("roof", [above(out, Y(top))]),
      panel("rear_windscreen", [roundRect(-g + 10, Y(top - 4), (g - 10) * 2, top - 4 - (s.bedH! + 14), 5)], "glass"),
    );
    const tlL = roundRect(-hw + 1, Y(s.tlTopH), hw - cx - 1.5, s.tlTopH - s.tlBotH, 2);
    panels.push(panel("left_taillight", [tlL], "tail"), panel("right_taillight", [mirrorX(tlL, 0)], "tail"));
    over.push(line([[-cx + 6, Y(s.bedH! - 8)], [cx - 6, Y(s.bedH! - 8)]], 0.4));
    over.push(decor(roundRect(-12, Y(s.bedH! - 14), 24, 4, 2), "trim", 0.7));
  } else {
    const colX = hw * 0.74;
    const isNotch = s.tail === "notch";
    const lid = isNotch
      ? xRange(yRange(out, Y(s.deckH + 2), Y(s.bumperTopR)), -colX, colX)
      : null;
    const glassTop = s.softTop ? top - 6 : top - 1;
    const rg = new PathBuilder()
      .move(-(g - 7), Y(glassBase + 4))
      .line(g - 7, Y(glassBase + 4))
      .line(r - 4, Y(glassTop))
      .quad(0, Y(glassTop + 2), -(r - 4), Y(glassTop))
      .done();
    const rearGlass = s.softTop
      ? roundRect(-r * 0.62, Y(glassTop), r * 1.24, Math.min(18, glassTop - glassBase - 6), 4)
      : rg;
    panels.push(
      panel("rear_left_quarter", [L(yRange(out, Y(shoulder + 3), Y(s.bumperTopR)), colX)]),
      panel("rear_right_quarter", [Rr(yRange(out, Y(shoulder + 3), Y(s.bumperTopR)), colX)]),
    );
    if (isNotch) {
      panels.push(panel("boot", [lid!]));
    } else {
      panels.push(
        panel("tailgate", [
          xRange(yRange(out, Y(top), Y(shoulder)), -(g - 3), g - 3),
          xRange(yRange(out, Y(shoulder), Y(s.bumperTopR)), -colX, colX),
        ]),
      );
    }
    if (s.softTop) {
      panels.push(panel("soft_top", [above(out, Y(glassBase + 3))], "fabric"));
    } else {
      panels.push(panel("roof", [above(out, Y(top))]));
    }
    panels.push(panel("rear_windscreen", [rearGlass], "glass"));
    const tlL = clipConvex(out, [
      [-hw * 0.5, Y(s.tlTopH)],
      [-(hw + 2), Y(s.tlTopH + 1)],
      [-(hw + 2), Y(s.tlBotH)],
      [-hw * 0.54, Y(s.tlBotH + 3)],
    ]);
    panels.push(panel("left_taillight", [tlL], "tail"), panel("right_taillight", [mirrorX(tlL, 0)], "tail"));
    over.push(decor(roundRect(-13, Y(s.bumperTopR + 12), 26, 3.5, 1.7), "trim", 0.6));
  }
  panels.push(...sideMirrors(s, hw, g, s.beltF, ["left_mirror", "right_mirror"]));
  over.push(decor(roundRect(-26, Y(s.bumperTopR - 6), 52, 11, 1.5), "plate"));
  over.push(decor(ellipse(-hw * 0.6, Y(s.bumperBottom + 4), 6, 3, 20), "trim", 0.9));
  return {
    under: [decor(ellipse(0, 1.5, hw * 1.08, 5, 50), "shadow")],
    base: [decor(out, "paint")],
    panels: compact(panels),
    over,
    outline: toPath(out),
  };
}

// ── TOP (plan) ────────────────────────────────────────────────────────

function buildTop(s: BodySpec) {
  const { L, W, FO, WB, R } = s;
  const hw = W / 2;
  const xf = FO, xr = FO + WB;
  const right = new PathBuilder()
    .move(0, 0)
    .quad(hw * s.noseW * 0.6, 0, hw * s.noseW, 1.5)
    .quad(hw - 0.5, 4, hw, FO * 0.72)
    .quad(hw - 2.5, (xf + xr) / 2, hw, xr)
    .quad(hw, L - 3, hw * s.tailW, L - 1)
    .quad(hw * s.tailW * 0.6, L, 0, L)
    .done();
  const out: Poly = [...right, ...mirrorX(right, 0).slice(1, -1)];
  const bf = FO * 0.18 + 2;
  const br = (L - xr) * 0.17 + 2;
  const sw = hw * (1 - s.roofW);
  const inner = hw - sw;
  const C = xRange(out, -inner, inner);
  const leftStrip = xRange(out, -1e4, -inner);
  const isBed = s.tail === "bed";
  const isConv = !!s.softTop;
  const dWing = s.dloFrontX - 4;
  const yr = (poly: Poly, a: number, b: number) => yRange(poly, a, b);

  const leftPanels: (PanelShape | null)[] = [
    panel("front_left_wing", [yr(leftStrip, bf, dWing)]),
  ];
  const rearEnd = L - br;
  if (s.layout === "car4") {
    leftPanels.push(
      panel("front_left_door", [yr(leftStrip, dWing, s.bX)]),
      panel("rear_left_door", [yr(leftStrip, s.bX, s.cX)]),
      panel("rear_left_quarter", [yr(leftStrip, s.cX, rearEnd)]),
    );
  } else if (s.layout === "car2") {
    leftPanels.push(
      panel("front_left_door", [yr(leftStrip, dWing, s.bX)]),
      panel("rear_left_quarter", [yr(leftStrip, s.bX, rearEnd)]),
    );
  } else if (s.layout === "van") {
    leftPanels.push(
      panel("front_left_door", [yr(leftStrip, dWing, s.bX)]),
      panel("left_sliding_door", [yr(leftStrip, s.bX, s.cX)]),
      panel("left_load_side", [yr(leftStrip, s.cX, rearEnd)]),
    );
  } else {
    const bedStrip = xRange(out, -1e4, -(hw - 7));
    leftPanels.push(
      panel("front_left_door", [yr(leftStrip, dWing, s.bX)]),
      panel("rear_left_door", [yr(leftStrip, s.bX, s.cabRearX!)]),
      panel("left_bed_side", [yr(bedStrip, s.cabRearX! + 2, rearEnd)]),
    );
  }
  const mirror = new PathBuilder()
    .move(-(hw - 3), s.dloFrontX - 2)
    .line(-(hw + 9), s.dloFrontX + 1)
    .quad(-(hw + 15), s.dloFrontX + 3, -(hw + 14), s.dloFrontX + 8)
    .quad(-(hw + 13), s.dloFrontX + 12, -(hw + 6), s.dloFrontX + 11)
    .line(-(hw - 3), s.dloFrontX + 9)
    .done();
  leftPanels.push(panel("left_mirror", [mirror]));
  const hl = clipConvex(out, [
    [-hw * 0.4, bf - 1],
    [-(hw + 1), bf - 5],
    [-(hw + 1), bf + 6],
    [-hw * 0.44, bf + 4],
  ]);
  const tl = clipConvex(out, [
    [-hw * 0.5, rearEnd - 2],
    [-(hw + 1), rearEnd - 6],
    [-(hw + 1), rearEnd + 3],
    [-hw * 0.5, rearEnd + 1],
  ]);
  leftPanels.push(panel("left_headlight", [hl], "light"), panel("left_taillight", [tl], "tail"));

  const mirrorPanel = (p: PanelShape | null) =>
    p && panel(mirrorPanelId(p.id), p.polys.map((q) => mirrorX(q, 0)), p.material);
  const rightPanels = leftPanels.map(mirrorPanel);

  const glassTrap = (y0: number, y1: number, w0: number, w1: number, bulge0: number, bulge1: number) =>
    new PathBuilder()
      .move(-w0, y0)
      .quad(0, y0 - bulge0, w0, y0)
      .line(w1, y1)
      .quad(0, y1 + bulge1, -w1, y1)
      .done();

  const centre: (PanelShape | null)[] = [
    panel("front_bumper", [above(out, bf)]),
    panel("rear_bumper", [below(out, rearEnd)]),
    panel("bonnet", [yr(C, bf, s.cowlX + 2)]),
  ];
  const ws = glassTrap(s.cowlX + 3, s.roofFrontX, inner - 2, inner - 7, 7, -3);
  if (isConv) {
    const rgb = s.rearGlassBaseX;
    centre.push(
      panel("soft_top", [yr(C, s.roofFrontX - 4, rgb)], "fabric"),
      panel("rear_deck", [yr(C, rgb, rgb + 18)]),
      panel("boot", [yr(C, rgb + 18, rearEnd)]),
      panel("rear_windscreen", [roundRect(-inner * 0.6, rgb - 22, inner * 1.2, 14, 4)], "glass"),
    );
  } else if (isBed) {
    const cr = s.cabRearX!;
    const bedInner = hw - 7;
    centre.push(
      panel("roof", [yr(C, s.roofFrontX - 4, cr - 6)]),
      panel("rear_windscreen", [roundRect(-inner + 6, cr - 9, (inner - 6) * 2, 6, 2.5)], "glass"),
      panel("load_bed", [yr(xRange(out, -bedInner, bedInner), cr + 2, rearEnd - 7)], "bed"),
      panel("tailgate", [yr(xRange(out, -bedInner, bedInner), rearEnd - 7, rearEnd)]),
    );
  } else {
    // Leave a visible strip of tailgate/boot below the rear glass in plan.
    const rgEnd = Math.min(Math.max(s.roofRearX + 6, s.rearGlassBaseX - 2), rearEnd - 14);
    centre.push(
      panel("roof", [yr(C, s.roofFrontX - 4, s.roofRearX + 3)]),
      panel(s.tail === "notch" ? "boot" : "tailgate", [yr(C, s.tail === "notch" ? rgEnd - 3 : s.roofRearX + 1, rearEnd)]),
      panel("rear_windscreen", [glassTrap(s.roofRearX + 2, rgEnd, inner - 6, inner - 3, -3, 5)], "glass"),
    );
  }
  centre.push(panel("windscreen", [ws], "glass"));

  const tyres = (["front", "rear"] as const).flatMap((fr) => {
    const cy = fr === "front" ? xf : xr;
    const t = roundRect(-(hw + 2.5), cy - R * 0.8, 9, R * 1.6, 3.5);
    return [panel(`${fr}_left_wheel`, [t], "tyre"), panel(`${fr}_right_wheel`, [mirrorX(t, 0)], "tyre")];
  });

  const over: DecorShape[] = [];
  if (!isConv) {
    over.push(decor(roundRect(-inner * 0.62, s.roofFrontX + 10, inner * 1.24, Math.max(10, (isBed ? s.cabRearX! - 16 : s.roofRearX) - s.roofFrontX - 20), 14), "highlight", 0.35));
  } else {
    // fabric ribs
    for (let i = 1; i < 4; i++) {
      const y = s.roofFrontX + ((s.rearGlassBaseX - 26 - s.roofFrontX) * i) / 4;
      over.push(line([[-inner + 3, y], [inner - 3, y]], 0.35));
    }
  }
  over.push(line([[-inner * 0.45, bf + 8], [-inner * 0.3, s.cowlX - 8]], 0.3));
  over.push(line([[inner * 0.45, bf + 8], [inner * 0.3, s.cowlX - 8]], 0.3));

  return {
    under: [decor(roundRect(-hw - 5, -3, W + 10, L + 8, 34), "shadow")],
    base: [decor(out, "paint")],
    panels: compact([...tyres, ...centre, ...leftPanels, ...rightPanels]),
    over,
    outline: toPath(out),
  };
}

// ── assembly + cache ──────────────────────────────────────────────────

function viewBoxOf(polysD: PanelShape[], extra: Poly[], pad: number): BBox {
  const pts = [...polysD.flatMap((p) => p.polys.flat()), ...extra.flat()];
  const b = bbox(pts);
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
}

function mirrorView(v: Omit<DiagramView, "view">, cx: number): Omit<DiagramView, "view"> {
  const flipD = (d: string) =>
    d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_m, c, x, y) => `${c}${(2 * cx - parseFloat(x)).toFixed(1)} ${y}`);
  return {
    ...v,
    under: v.under.map((s) => ({ ...s, d: flipD(s.d) })),
    base: v.base.map((s) => ({ ...s, d: flipD(s.d) })),
    over: v.over.map((s) => ({ ...s, d: flipD(s.d) })),
    outline: flipD(v.outline),
    holes: v.holes.map((h) => mirrorX(h, cx)),
    panels: v.panels.map((p) => panel(mirrorPanelId(p.id), p.polys.map((q) => mirrorX(q, cx)), p.material)!),
    viewBox: { ...v.viewBox, x: 2 * cx - (v.viewBox.x + v.viewBox.w) },
  };
}

/**
 * Re-place each anchor on the VISIBLE part of its panel (panels drawn later
 * sit on top; arches cut body panels), so labels, default pins and tests
 * always land on the panel that a tap there would actually select.
 */
function fixAnchors(v: Omit<DiagramView, "view">) {
  const topAt = (pt: Pt): string | null => {
    const inHole = v.holes.some((h) => pointInPoly(pt, h));
    for (let i = v.panels.length - 1; i >= 0; i--) {
      const p = v.panels[i];
      if (inHole && p.material !== "tyre") continue;
      if (p.polys.some((q) => pointInPoly(pt, q))) return p.id;
    }
    return null;
  };
  for (const p of v.panels) {
    if (topAt(p.anchor) === p.id) continue;
    const b = p.bbox;
    let best: Pt | null = null, bestD = -1;
    const N = 40;
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        const pt: Pt = [b.x + (b.w * i) / N, b.y + (b.h * j) / N];
        if (topAt(pt) !== p.id) continue;
        // prefer points far from this panel's own edges and from covering panels
        const d = Math.min(...p.polys.map((q) => distToPoly(pt, q)));
        if (d > bestD) { bestD = d; best = pt; }
      }
    }
    if (best) p.anchor = best;
  }
}

const cache = new Map<string, DiagramView>();

export function getDiagram(bodyType: BodyType, view: ViewId): DiagramView {
  const key = `${bodyType}:${view}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (bodyType === "van") {
    const art = buildVanArtView(view);
    const v: Omit<DiagramView, "view"> = { ...art, bodyType };
    fixAnchors(v);
    const full: DiagramView = { ...v, view };
    cache.set(key, full);
    return full;
  }
  const s = SPECS[bodyType];
  let built: Omit<DiagramView, "view" | "bodyType" | "viewBox" | "holes"> & { holes?: Poly[] };
  if (view === "left" || view === "right") built = buildLeftSide(s);
  else if (view === "front") built = buildFront(s);
  else if (view === "rear") built = buildRear(s);
  else built = buildTop(s);
  const pad = view === "top" ? 8 : 10;
  const vb = viewBoxOf(built.panels, [], pad);
  // ground shadow lives just below y=0 on elevation views
  if (view !== "top") vb.h = Math.max(vb.h, -vb.y + 9);
  let v: Omit<DiagramView, "view"> = {
    bodyType,
    viewBox: vb,
    under: built.under,
    base: built.base,
    panels: built.panels,
    over: built.over,
    outline: built.outline,
    holes: built.holes ?? [],
  };
  if (view === "right") v = mirrorView(v, s.L / 2);
  fixAnchors(v);
  const full: DiagramView = { ...v, view };
  cache.set(key, full);
  return full;
}

/** Every panel id that appears in any view of a body type (for the manual picker). */
export function panelsForBodyType(bodyType: BodyType): string[] {
  const ids = new Set<string>();
  for (const v of VIEW_IDS) for (const p of getDiagram(bodyType, v).panels) ids.add(p.id);
  return [...ids];
}
