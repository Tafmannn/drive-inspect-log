/**
 * Dimensions (≈ centimetres) for the nine generic body families. Heights are
 * above the ground, x positions are measured from the front of the vehicle.
 * Numbers are drawn from typical vehicles of each class (Golf, 3 Series,
 * Passat Estate, X5, 911, MINI Convertible, Galaxy, Transit, Ranger) but are
 * deliberately generic — these are inspection templates, not schematics.
 */
import type { BodyType } from "../bodyTypes";

export type TailStyle = "notch" | "hatch" | "square" | "bed";
export type Layout = "car4" | "car2" | "van" | "pickup";

export interface BodySpec {
  L: number; W: number; H: number;
  WB: number; FO: number; R: number;
  /** body underside height between the wheels */
  sill: number;
  /** top of the sill strip */
  sillTop: number;
  bumperBottom: number;
  noseH: number;
  bonnetFrontX: number; bonnetFrontH: number;
  cowlX: number; cowlH: number;
  beltF: number; beltR: number;
  roofFrontX: number; roofRearX: number;
  /** roof skin above the window opening */
  roofT: number;
  /** top of the side windows (defaults to H - roofT) */
  dloTopH?: number;
  tail: TailStyle;
  rearGlassBaseX: number;
  deckH: number;
  tailMidH: number;
  bumperTopF: number; bumperTopR: number;
  /** daylight opening (side windows) */
  dloFrontX: number; dloTopFrontX: number; dloTopRearX: number; dloRearX: number;
  layout: Layout;
  /** B-pillar (front door rear edge) at belt height */
  bX: number;
  /** rear door / sliding door rear edge at belt height */
  cX: number;
  /** x of the pillar ahead of rear quarter glass (0 = none) */
  qX: number;
  cabRearX?: number;
  bedH?: number;
  softTop?: boolean;
  /** convertible: where the folded-top fabric meets the rear deck (x) */
  softTopEndX?: number;
  /** plan-view roof width and front/rear-view greenhouse widths, as fractions of W */
  roofW: number; greenW: number; noseW: number; tailW: number;
  /** front/rear elevation: greenhouse base and roof half-widths (fractions of W/2) */
  endGreenW: number; endRoofW: number;
  hlLen: number; hlH: number;
  tlLen: number; tlTopH: number; tlBotH: number;
  /** front grille half-width (fraction of W) and height */
  grilleW: number; grilleH: number;
}

const base = {
  roofT: 6,
  qX: 0,
  hlLen: 34, hlH: 12,
  tlLen: 22,
  grilleW: 0.2, grilleH: 18,
  noseW: 0.8, tailW: 0.86,
};

export const SPECS: Record<BodyType, BodySpec> = {
  saloon: {
    endGreenW: 0.78, endRoofW: 0.62,
    ...base,
    L: 471, W: 182, H: 144, WB: 285, FO: 80, R: 33,
    sill: 17, sillTop: 29, bumperBottom: 19, noseH: 50,
    bonnetFrontX: 12, bonnetFrontH: 71, cowlX: 170, cowlH: 97,
    beltF: 96, beltR: 101,
    roofFrontX: 225, roofRearX: 318, tail: "notch",
    rearGlassBaseX: 392, deckH: 103, tailMidH: 82,
    bumperTopF: 52, bumperTopR: 62,
    dloFrontX: 182, dloTopFrontX: 230, dloTopRearX: 314, dloRearX: 372,
    layout: "car4", bX: 268, cX: 352,
    roofW: 0.72, greenW: 0.84,
    tlTopH: 99, tlBotH: 84, tlLen: 26,
  },
  hatchback: {
    endGreenW: 0.8, endRoofW: 0.66,
    ...base,
    L: 428, W: 179, H: 148, WB: 263, FO: 84, R: 32,
    sill: 17, sillTop: 29, bumperBottom: 19, noseH: 52,
    bonnetFrontX: 12, bonnetFrontH: 74, cowlX: 160, cowlH: 99,
    beltF: 97, beltR: 104,
    roofFrontX: 214, roofRearX: 352, tail: "hatch",
    rearGlassBaseX: 414, deckH: 104, tailMidH: 80,
    bumperTopF: 54, bumperTopR: 60,
    dloFrontX: 172, dloTopFrontX: 219, dloTopRearX: 340, dloRearX: 384,
    layout: "car4", bX: 255, cX: 336, qX: 0,
    roofW: 0.74, greenW: 0.85,
    tlTopH: 103, tlBotH: 86, tlLen: 16,
  },
  estate: {
    endGreenW: 0.8, endRoofW: 0.66,
    ...base,
    L: 477, W: 183, H: 151, WB: 279, FO: 90, R: 33,
    sill: 17, sillTop: 29, bumperBottom: 19, noseH: 51,
    bonnetFrontX: 12, bonnetFrontH: 72, cowlX: 172, cowlH: 98,
    beltF: 97, beltR: 103,
    roofFrontX: 228, roofRearX: 448, tail: "square",
    rearGlassBaseX: 468, deckH: 100, tailMidH: 84,
    bumperTopF: 53, bumperTopR: 58,
    dloFrontX: 184, dloTopFrontX: 233, dloTopRearX: 440, dloRearX: 452,
    layout: "car4", bX: 272, cX: 357, qX: 374,
    roofW: 0.74, greenW: 0.85,
    tlTopH: 100, tlBotH: 80, tlLen: 10,
  },
  suv: {
    endGreenW: 0.82, endRoofW: 0.7,
    ...base,
    L: 492, W: 200, H: 176, WB: 297, FO: 90, R: 39,
    sill: 27, sillTop: 41, bumperBottom: 30, noseH: 68,
    bonnetFrontX: 13, bonnetFrontH: 93, cowlX: 182, cowlH: 117,
    beltF: 116, beltR: 122,
    roofFrontX: 240, roofRearX: 455, tail: "square",
    rearGlassBaseX: 478, deckH: 118, tailMidH: 102,
    bumperTopF: 68, bumperTopR: 74,
    dloFrontX: 194, dloTopFrontX: 245, dloTopRearX: 446, dloRearX: 458,
    layout: "car4", bX: 290, cX: 382, qX: 392,
    roofW: 0.76, greenW: 0.86,
    tlTopH: 122, tlBotH: 100, tlLen: 12,
    hlLen: 38, hlH: 13, grilleH: 24,
  },
  coupe: {
    endGreenW: 0.74, endRoofW: 0.56,
    ...base,
    L: 452, W: 185, H: 130, WB: 250, FO: 98, R: 33,
    sill: 14, sillTop: 25, bumperBottom: 15, noseH: 44,
    bonnetFrontX: 10, bonnetFrontH: 62, cowlX: 178, cowlH: 88,
    beltF: 87, beltR: 93,
    roofFrontX: 236, roofRearX: 278, tail: "notch",
    rearGlassBaseX: 412, deckH: 95, tailMidH: 74,
    bumperTopF: 44, bumperTopR: 56,
    dloFrontX: 190, dloTopFrontX: 242, dloTopRearX: 284, dloRearX: 360,
    layout: "car2", bX: 300, cX: 300, qX: 312,
    roofW: 0.66, greenW: 0.8,
    tlTopH: 93, tlBotH: 82, tlLen: 30,
    hlLen: 40, hlH: 11,
  },
  convertible: {
    endGreenW: 0.78, endRoofW: 0.62,
    ...base,
    L: 387, W: 173, H: 142, WB: 249, FO: 70, R: 31,
    sill: 17, sillTop: 29, bumperBottom: 19, noseH: 55,
    bonnetFrontX: 10, bonnetFrontH: 80, cowlX: 148, cowlH: 100,
    beltF: 99, beltR: 102,
    roofFrontX: 196, roofRearX: 280, tail: "notch",
    rearGlassBaseX: 346, deckH: 103, tailMidH: 84,
    bumperTopF: 56, bumperTopR: 62,
    dloFrontX: 158, dloTopFrontX: 200, dloTopRearX: 276, dloRearX: 306,
    layout: "car2", bX: 256, cX: 256, qX: 266,
    softTop: true, softTopEndX: 330,
    roofW: 0.72, greenW: 0.84,
    tlTopH: 101, tlBotH: 86, tlLen: 12,
    hlLen: 26, hlH: 16,
  },
  mpv: {
    endGreenW: 0.84, endRoofW: 0.74,
    ...base,
    L: 485, W: 188, H: 176, WB: 285, FO: 92, R: 34,
    sill: 19, sillTop: 32, bumperBottom: 21, noseH: 58,
    bonnetFrontX: 12, bonnetFrontH: 84, cowlX: 140, cowlH: 106,
    beltF: 105, beltR: 110,
    roofFrontX: 225, roofRearX: 460, tail: "square",
    rearGlassBaseX: 479, deckH: 112, tailMidH: 92,
    bumperTopF: 58, bumperTopR: 62,
    dloFrontX: 150, dloTopFrontX: 230, dloTopRearX: 452, dloRearX: 462,
    layout: "car4", bX: 262, cX: 364, qX: 380,
    roofW: 0.8, greenW: 0.88,
    tlTopH: 128, tlBotH: 96, tlLen: 8,
  },
  van: {
    endGreenW: 0.94, endRoofW: 0.92,
    ...base,
    L: 553, W: 206, H: 252, WB: 352, FO: 96, R: 37,
    sill: 34, sillTop: 48, bumperBottom: 34, noseH: 70,
    bonnetFrontX: 14, bonnetFrontH: 104, cowlX: 112, cowlH: 130,
    beltF: 130, beltR: 130,
    roofFrontX: 196, roofRearX: 548, tail: "square",
    rearGlassBaseX: 551, deckH: 200, tailMidH: 140,
    bumperTopF: 70, bumperTopR: 62,
    dloFrontX: 124, dloTopFrontX: 196, dloTopRearX: 212, dloRearX: 212,
    roofT: 7, dloTopH: 196,
    layout: "van", bX: 222, cX: 338,
    roofW: 0.94, greenW: 0.92, noseW: 0.86, tailW: 0.97,
    tlTopH: 128, tlBotH: 74, tlLen: 6,
    hlLen: 40, hlH: 18, grilleW: 0.26, grilleH: 26,
  },
  pickup: {
    endGreenW: 0.84, endRoofW: 0.72,
    ...base,
    L: 537, W: 192, H: 182, WB: 327, FO: 92, R: 39,
    sill: 30, sillTop: 44, bumperBottom: 32, noseH: 74,
    bonnetFrontX: 12, bonnetFrontH: 104, cowlX: 182, cowlH: 126,
    beltF: 125, beltR: 128,
    roofFrontX: 236, roofRearX: 336, tail: "bed",
    rearGlassBaseX: 350, deckH: 118, tailMidH: 90,
    bumperTopF: 74, bumperTopR: 58,
    dloFrontX: 194, dloTopFrontX: 240, dloTopRearX: 332, dloRearX: 340,
    layout: "pickup", bX: 270, cX: 346,
    cabRearX: 350, bedH: 120,
    roofW: 0.78, greenW: 0.86, noseW: 0.88, tailW: 0.96,
    tlTopH: 116, tlBotH: 80, tlLen: 6,
    hlLen: 34, hlH: 16, grilleW: 0.28, grilleH: 30,
  },
};
