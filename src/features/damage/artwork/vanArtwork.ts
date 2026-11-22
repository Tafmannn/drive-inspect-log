/**
 * Van diagram family drawn with the supplied van illustrations.
 *
 * The artwork is the visual layer; every selectable panel is a real polygon
 * traced onto that artwork (outline from the image itself, seams read off the
 * illustration's own shut lines), so a tap is resolved against the panel the
 * driver can actually see — not guessed from x/y over a flat picture.
 *
 * Image coordinates (px of the cropped artwork) are the diagram's units.
 * Orientation matches the rest of the system: LEFT view has the front at the
 * viewer's left, RIGHT view the front at the right, FRONT view shows the
 * vehicle's left on the viewer's right, REAR/TOP show it on the viewer's left
 * (top view: front at the top).
 */
import type { DiagramView, PanelShape, ViewId } from "../geometry/views";
import { panel } from "../geometry/views";
import { clipConvex, ellipse, toPath, type Poly, type Pt } from "../geometry/poly";
import { VAN_OUTLINES } from "./vanOutlines";
import leftUrl from "../assets/van/left.webp";
import rightUrl from "../assets/van/right.webp";
import topUrl from "../assets/van/top.webp";
import frontUrl from "../assets/van/front.webp";
import rearUrl from "../assets/van/rear.webp";

const URLS: Record<ViewId, string> = { left: leftUrl, right: rightUrl, top: topUrl, front: frontUrl, rear: rearUrl };

const BIG = 5000;
const rect = (x0: number, y0: number, x1: number, y1: number): Poly => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** Mirror an x coordinate about the artwork's centre line. */
const mx = (pts: Pt[], c: number): Pt[] => pts.map(([x, y]) => [2 * c - x, y] as Pt).reverse();

type Spec = Array<[id: string, material: PanelShape["material"], polys: Poly[]]>;

interface Wheel { id: string; cx: number; cy: number; r: number; arch: number }

function build(
  view: ViewId,
  spec: (sil: (convex: Poly) => Poly) => Spec,
  wheels: Wheel[] = [],
  /** Trims soft drop-shadow the background flood-fill kept as "vehicle". */
  bodyClip?: Poly,
): Omit<DiagramView, "bodyType"> {
  const art = VAN_OUTLINES[view];
  const outline = bodyClip ? clipConvex(art.outline, bodyClip) : art.outline;
  const sil = (convex: Poly) => clipConvex(outline, convex);
  const panels = spec(sil)
    .map(([id, material, polys]) => panel(id, polys, material))
    .filter((p): p is PanelShape => !!p);
  for (const w of wheels) {
    const p = panel(w.id, [ellipse(w.cx, w.cy, w.r, w.r, 64)], "tyre");
    if (p) panels.push(p);
  }
  return {
    view,
    viewBox: { x: 0, y: 0, w: art.w, h: art.h },
    under: [],
    base: [],
    panels,
    over: [],
    outline: toPath(outline),
    holes: wheels.map((w) => ellipse(w.cx, w.cy, w.arch, w.arch, 72)),
    image: { href: URLS[view], w: art.w, h: art.h },
  };
}

// ── LEFT (front at viewer's left) ─────────────────────────────────────
const left = () =>
  build(
    "left",
    (sil) => [
      ["roof", "paint", [sil(rect(-BIG, -BIG, BIG, 58))]],
      ["front_bumper", "paint", [sil([[-10, 310], [128, 305], [178, 378], [205, 600], [-10, 600]])]],
      ["bonnet", "paint", [sil([[0, 150], [212, 150], [212, 222], [180, 253], [30, 300], [0, 300]])]],
      ["front_left_wing", "paint", [[[128, 312], [160, 282], [180, 253], [212, 224], [214, 274], [292, 264], [294, 300], [300, 360], [285, 358], [246, 358], [205, 366], [178, 378]]]],
      ["front_left_door", "paint", [[[293, 185], [400, 96], [445, 76], [597, 66], [597, 335], [567, 358], [567, 472], [355, 472], [352, 440], [345, 410], [330, 385], [310, 368], [300, 360], [294, 270]]]],
      ["left_sliding_door", "paint", [[[597, 66], [893, 62], [893, 474], [567, 474], [567, 358], [597, 335]]]],
      ["left_load_side", "paint", [sil(rect(893, -BIG, 1180, 472)), sil([[1180, -BIG], [1238, -BIG], [1272, 215], [1285, 400], [1180, 410]])]],
      ["left_rear_cargo_door", "paint", [sil([[1238, -BIG], [BIG, -BIG], [BIG, 400], [1285, 400], [1272, 215]])]],
      ["rear_bumper", "trim", [sil([[1170, 405], [BIG, 395], [BIG, BIG], [1196, BIG]])]],
      ["left_sill", "trim", [sil(rect(355, 472, 990, BIG))]],
      ["windscreen", "glass", [[[212, 224], [392, 90], [404, 92], [262, 200], [236, 222]]]],
      ["front_left_window", "glass", [[[212, 274], [300, 190], [440, 100], [555, 84], [563, 96], [561, 195], [549, 213], [500, 238], [360, 252], [290, 262]]]],
      ["left_headlight", "light", [[[45, 302], [110, 280], [180, 253], [160, 282], [135, 305], [105, 318], [55, 328], [47, 318]]]],
      ["left_taillight", "tail", [[[1270, 215], [1296, 212], [1303, 230], [1303, 350], [1294, 368], [1278, 365], [1272, 330]]]],
      ["left_mirror", "trim", [[[312, 182], [340, 176], [355, 190], [356, 252], [345, 262], [318, 262], [307, 250], [305, 195]]]],
    ],
    [
      { id: "front_left_wheel", cx: 246, cy: 469, r: 89, arch: 109 },
      { id: "rear_left_wheel", cx: 1086, cy: 469, r: 88, arch: 110 },
    ],
  );

// ── RIGHT (front at viewer's right) ───────────────────────────────────
const right = () =>
  build(
    "right",
    (sil) => [
      ["roof", "paint", [sil(rect(-BIG, -BIG, BIG, 50))]],
      ["front_bumper", "paint", [sil([[1150, 356], [1200, 301], [BIG, 290], [BIG, BIG], [1180, BIG]])]],
      ["bonnet", "paint", [sil([[1105, 205], [BIG, 150], [BIG, 295], [1272, 290], [1140, 240]])]],
      ["front_right_wing", "paint", [[[1032, 252], [1107, 260], [1112, 212], [1142, 240], [1170, 282], [1200, 301], [1150, 356], [1120, 345], [1090, 342], [1050, 348], [1027, 355]]]],
      ["front_right_door", "paint", [[[734, 58], [905, 77], [1000, 155], [1032, 178], [1032, 250], [1027, 355], [1008, 368], [992, 392], [985, 430], [983, 452], [765, 452], [765, 340], [734, 315]]]],
      ["right_sliding_door", "paint", [[[445, 50], [734, 58], [734, 315], [765, 340], [765, 452], [445, 452]]]],
      ["right_load_side", "paint", [sil(rect(178, -BIG, 445, 452)), sil([[102, -BIG], [178, -BIG], [178, 383], [64, 346]])]],
      ["right_rear_cargo_door", "paint", [sil([[-BIG, -BIG], [102, -BIG], [64, 346], [-BIG, 346]])]],
      ["rear_bumper", "trim", [sil([[-BIG, 345], [60, 345], [175, 380], [178, BIG], [-BIG, BIG]])]],
      ["right_sill", "trim", [sil(rect(368, 452, 986, BIG))]],
      ["windscreen", "glass", [[[905, 72], [918, 72], [1112, 205], [1100, 208]]]],
      ["front_right_window", "glass", [[[772, 78], [885, 78], [1000, 158], [1035, 190], [1107, 258], [1050, 252], [1000, 245], [820, 226], [790, 205], [776, 180]]]],
      ["right_headlight", "light", [[[1142, 240], [1200, 255], [1268, 282], [1275, 300], [1262, 315], [1200, 300], [1170, 280]]]],
      ["right_taillight", "tail", [[[42, 200], [68, 197], [71, 215], [70, 320], [60, 342], [36, 340], [35, 300], [36, 215]]]],
      ["right_mirror", "trim", [[[980, 172], [1005, 167], [1013, 180], [1012, 238], [1000, 246], [985, 246], [977, 235]]]],
    ],
    [
      { id: "rear_right_wheel", cx: 262, cy: 444, r: 87, arch: 106 },
      { id: "front_right_wheel", cx: 1090, cy: 443, r: 88, arch: 104 },
    ],
  );

// ── TOP (front up, vehicle-left on viewer's left) ─────────────────────
const top = () => {
  const c = 346; // centre line
  const lhl: Pt[] = [[232, 57], [205, 62], [150, 90], [120, 130], [116, 190], [124, 190], [128, 140], [160, 100], [215, 70]];
  return build("top", (sil) => [
    ["front_bumper", "trim", [sil(rect(-BIG, -BIG, BIG, 47))]],
    ["bonnet", "paint", [sil(rect(128, 47, 565, 250))]],
    ["front_left_wing", "paint", [sil(rect(-BIG, 47, 128, 250)), sil(rect(-BIG, 250, 150, 290))]],
    ["front_right_wing", "paint", [sil(rect(565, 47, BIG, 250)), sil(rect(542, 250, BIG, 290))]],
    ["roof", "paint", [sil(rect(150, 250, 542, 1203))]],
    ["front_left_door", "paint", [sil(rect(-BIG, 290, 150, 588))]],
    ["left_sliding_door", "paint", [sil(rect(-BIG, 588, 150, 878))]],
    ["left_load_side", "paint", [sil(rect(-BIG, 878, 150, 1200))]],
    ["front_right_door", "paint", [sil(rect(542, 290, BIG, 588))]],
    ["right_sliding_door", "paint", [sil(rect(542, 588, BIG, 878))]],
    ["right_load_side", "paint", [sil(rect(542, 878, BIG, 1200))]],
    ["left_rear_cargo_door", "paint", [sil(rect(150, 1200, c, 1248))]],
    ["right_rear_cargo_door", "paint", [sil(rect(c, 1200, 545, 1248))]],
    ["rear_bumper", "trim", [sil(rect(-BIG, 1248, BIG, BIG))]],
    ["windscreen", "glass", [[[130, 248], [180, 215], [260, 196], [350, 190], [440, 196], [520, 215], [563, 248], [563, 415], [550, 428], [450, 413], [350, 405], [250, 413], [152, 428], [130, 415]]]],
    ["left_headlight", "light", [lhl]],
    ["right_headlight", "light", [mx(lhl, c)]],
    ["left_taillight", "tail", [[[108, 1198], [140, 1200], [160, 1215], [162, 1245], [140, 1247], [115, 1225]]]],
    ["right_taillight", "tail", [[[585, 1198], [578, 1225], [552, 1247], [531, 1245], [533, 1215], [552, 1200]]]],
    ["left_mirror", "trim", [[[34, 375], [45, 355], [70, 343], [95, 340], [118, 336], [118, 352], [95, 365], [75, 380], [50, 390], [36, 388]]]],
    ["right_mirror", "trim", [[[575, 348], [592, 355], [620, 368], [650, 380], [663, 398], [660, 414], [640, 418], [610, 405], [590, 390], [577, 378]]]],
  ], [], rect(95, -BIG, 597, BIG));
};

// ── FRONT (vehicle-left on viewer's right) ────────────────────────────
const front = () => {
  const c = 519;
  const rhl: Pt[] = [[120, 425], [165, 450], [230, 475], [280, 500], [255, 530], [215, 545], [140, 525], [110, 505], [108, 460]];
  return build("front", (sil) => [
    ["front_right_wheel", "tyre", [sil(rect(70, 845, 210, BIG))]],
    ["front_left_wheel", "tyre", [sil(rect(828, 845, 968, BIG))]],
    ["roof", "paint", [sil(rect(-BIG, -BIG, BIG, 100))]],
    ["front_bumper", "trim", [sil(rect(-BIG, 500, BIG, 845))]],
    ["bonnet", "paint", [sil([[100, 368], [940, 368], [925, 425], [770, 500], [270, 500], [115, 425]])]],
    ["front_right_wing", "paint", [sil([[-BIG, 380], [118, 380], [108, 640], [-BIG, 650]])]],
    ["front_left_wing", "paint", [sil([[920, 380], [BIG, 380], [BIG, 650], [930, 640]])]],
    ["windscreen", "glass", [[[205, 115], [520, 95], [835, 115], [860, 160], [888, 330], [870, 365], [520, 372], [170, 365], [152, 330], [180, 160]]]],
    ["front_grille", "trim", [[[310, 500], [730, 500], [775, 570], [745, 640], [690, 680], [350, 680], [295, 640], [265, 570]]]],
    ["right_headlight", "light", [rhl]],
    ["left_headlight", "light", [mx(rhl, c)]],
    ["right_mirror", "trim", [[[18, 280], [40, 270], [95, 270], [105, 285], [130, 345], [128, 375], [108, 400], [95, 418], [40, 418], [20, 395], [12, 345]]]],
    ["left_mirror", "trim", [[[1020, 345], [1025, 395], [1000, 418], [945, 418], [930, 400], [912, 375], [910, 345], [935, 285], [945, 270], [1000, 270], [1020, 282]]]],
  ]);
};

// ── REAR (vehicle-left on viewer's left) ──────────────────────────────
const rear = () =>
  build("rear", (sil) => [
    ["rear_left_wheel", "tyre", [sil(rect(30, 848, 170, BIG))]],
    ["rear_right_wheel", "tyre", [sil(rect(780, 848, 920, BIG))]],
    ["roof", "paint", [sil(rect(-BIG, -BIG, BIG, 52))]],
    ["left_load_side", "paint", [sil([[-BIG, -BIG], [150, -BIG], [150, 57], [108, 330], [-BIG, 330]]), sil(rect(-BIG, 330, 118, 690))]],
    ["right_load_side", "paint", [sil([[800, -BIG], [BIG, -BIG], [BIG, 330], [840, 330], [800, 57]]), sil(rect(830, 330, BIG, 690))]],
    ["left_rear_cargo_door", "paint", [[[150, 57], [474, 48], [474, 778], [130, 775], [122, 690], [118, 620], [110, 330], [130, 120]]]],
    ["right_rear_cargo_door", "paint", [[[474, 48], [800, 57], [818, 120], [840, 330], [832, 620], [828, 690], [818, 775], [474, 778]]]],
    ["rear_bumper", "trim", [sil(rect(-BIG, 778, BIG, 848)), sil(rect(-BIG, 682, 130, 778)), sil(rect(818, 682, BIG, 778))]],
    ["left_taillight", "tail", [[[62, 340], [80, 330], [118, 330], [124, 370], [122, 600], [110, 618], [70, 618], [55, 600], [52, 380]]]],
    ["right_taillight", "tail", [[[835, 330], [880, 330], [895, 345], [898, 600], [885, 618], [842, 618], [830, 600], [828, 370]]]],
  ]);

const BUILDERS: Record<ViewId, () => Omit<DiagramView, "bodyType">> = { left, right, top, front, rear };

export function buildVanArtView(view: ViewId): Omit<DiagramView, "bodyType"> {
  return BUILDERS[view]();
}
