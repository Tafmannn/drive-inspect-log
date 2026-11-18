/**
 * Draws the Proof of Delivery PDF from a PodReportModel (see podReportModel.ts).
 *
 * A4 portrait, millimetres. Page 1 opens with the brand header and a vehicle
 * summary; later pages carry a slim running header. Every page gets a footer
 * with the operator's contact details and "Page x of y". Blocks are measured
 * before they are drawn so nothing is split awkwardly across a page break.
 *
 * Only jsPDF's built-in Helvetica is used, so text sticks to characters it can
 * encode (no arrows or tick glyphs: those are drawn as lines).
 */
import type jsPDF from "jspdf";
import {
  photoCaption,
  type PodChecklist,
  type PodDamage,
  type PodPhotoGroup,
  type PodReportModel,
  type PodSignoff,
  type PodStop,
} from "./podReportModel";

export type PdfImageFormat = "PNG" | "JPEG" | "WEBP";

export interface PdfImage {
  dataUrl: string;
  format: PdfImageFormat;
  width?: number;
  height?: number;
}

export interface PodOrgDetails {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
}

export interface PodLayoutAssets {
  logo: PdfImage | null;
  /** Square photo thumbnails keyed by photo URL. */
  thumbs: Map<string, PdfImage | null>;
  /** Signature images keyed by the inspection's signature URL. */
  signatures: Map<string, PdfImage | null>;
  photosZipUrl: string | null;
  org: PodOrgDetails;
  /** Already formatted, e.g. "16 Nov 2026, 18:02". */
  generatedAt: string;
  /** "collection" prints a Proof of Collection (default: Proof of Delivery). */
  kind?: "delivery" | "collection";
}

function docTitle(assets: PodLayoutAssets): string {
  return assets.kind === "collection" ? "PROOF OF COLLECTION" : "PROOF OF DELIVERY";
}

// ── Design tokens ────────────────────────────────────────────────────────────

type RGB = readonly [number, number, number];

const C = {
  ink: [15, 23, 42],
  body: [51, 65, 85],
  muted: [100, 116, 139],
  faint: [148, 163, 184],
  line: [226, 232, 240],
  soft: [248, 250, 252],
  soft2: [241, 245, 249],
  brand: [0, 82, 204], // #0052CC
  brandSoft: [235, 242, 255],
  white: [255, 255, 255],
  // Header palette: very dark navy with the logo's blue as the accent.
  navyDeep: [4, 11, 26], //   #040B1A
  navy: [8, 21, 46], //        #08152E
  navyLift: [12, 33, 72], //   #0C2148
  navyLine: [26, 52, 98], //   #1A3462
  logoBlue: [20, 120, 212], // #1478D4 (the mark)
  headerMuted: [143, 165, 201], // #8FA5C9
  headerLabel: [96, 122, 168], //  #607AA8
  green: [21, 128, 61],
  greenSoft: [240, 253, 244],
  greenLine: [187, 247, 208],
  red: [185, 28, 28],
  redSoft: [254, 242, 242],
  plateYellow: [252, 209, 22],
  plateBlue: [0, 51, 153],
} satisfies Record<string, RGB>;

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CW = PAGE_W - 2 * M;
const FIRST_HEADER_H = 44;
const CONT_HEADER_H = 12;
const BRAND_BAR_H = 1.2;
const CONTENT_TOP = CONT_HEADER_H + BRAND_BAR_H + 9;
const CONTENT_BOTTOM = PAGE_H - 22;
const SECTION_GAP = 8;
const COL_GAP = 6;

// ── Primitives ───────────────────────────────────────────────────────────────

function font(doc: jsPDF, size: number, style: "normal" | "bold" | "italic" | "bolditalic", color: RGB): void {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  doc.setTextColor(color[0], color[1], color[2]);
}

function fill(doc: jsPDF, c: RGB): void {
  doc.setFillColor(c[0], c[1], c[2]);
}

function stroke(doc: jsPDF, c: RGB, width = 0.25): void {
  doc.setDrawColor(c[0], c[1], c[2]);
  doc.setLineWidth(width);
}

/** Small upper-case label ("ODOMETER"). */
function label(doc: jsPDF, text: string, x: number, y: number, color: RGB = C.muted): void {
  font(doc, 6.3, "bold", color);
  doc.text(text.toUpperCase(), x, y, { charSpace: 0.3 });
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  return doc.splitTextToSize(text, width) as string[];
}

/** Single line, shortened with an ellipsis to fit. Font must already be set. */
function fit(doc: jsPDF, text: string, width: number): string {
  if (doc.getTextWidth(text) <= width) return text;
  let s = text;
  while (s.length > 1 && doc.getTextWidth(`${s}…`) > width) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** At most `max` wrapped lines, the last one ellipsised if text was cut. */
function clampLines(doc: jsPDF, text: string, width: number, max: number): string[] {
  const lines = wrap(doc, text, width);
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  kept[max - 1] = fit(doc, `${kept[max - 1]} ${lines.slice(max).join(" ")}`, width);
  return kept;
}

function tick(doc: jsPDF, cx: number, cy: number, size: number, color: RGB, width = 0.45): void {
  stroke(doc, color, width);
  doc.line(cx - size * 0.5, cy, cx - size * 0.15, cy + size * 0.35);
  doc.line(cx - size * 0.15, cy + size * 0.35, cx + size * 0.55, cy - size * 0.4);
}

function drawImageContain(doc: jsPDF, img: PdfImage, x: number, y: number, w: number, h: number): boolean {
  try {
    const iw = img.width ?? w;
    const ih = img.height ?? h;
    const s = Math.min(w / iw, h / ih);
    const rw = iw * s;
    const rh = ih * s;
    // PNGs (signatures) are otherwise embedded uncompressed, ~1 MB each.
    doc.addImage(img.dataUrl, img.format, x + (w - rw) / 2, y + (h - rh) / 2, rw, rh, undefined, "FAST");
    return true;
  } catch {
    return false;
  }
}

function drawImageCover(doc: jsPDF, img: PdfImage, x: number, y: number, size: number): boolean {
  try {
    doc.addImage(img.dataUrl, img.format, x, y, size, size);
    return true;
  } catch {
    return false;
  }
}

// ── Page flow ────────────────────────────────────────────────────────────────

/** Measure-then-draw block: called with draw=false to get its height. */
type Block = (y: number, draw: boolean) => number;

class Flow {
  y: number;
  constructor(private readonly doc: jsPDF, startY: number) {
    this.y = startY;
  }

  newPage(): void {
    this.doc.addPage();
    this.y = CONTENT_TOP;
  }

  fits(h: number): boolean {
    return this.y + h <= CONTENT_BOTTOM;
  }

  /** Places a block, moving to a new page first if it doesn't fit. */
  place(block: Block, gapAfter = 0): void {
    const h = block(this.y, false);
    if (!this.fits(h) && this.y > CONTENT_TOP) this.newPage();
    block(this.y, true);
    this.y += h + gapAfter;
  }

  /** A section heading kept on the same page as the block that follows it. */
  section(title: string, right: string | null, first: Block, gapAfter = 0): void {
    const h = HEADING_H + first(this.y + HEADING_H, false);
    if (!this.fits(h) && this.y > CONTENT_TOP) this.newPage();
    drawHeading(this.doc, this.y, title, right);
    this.y += HEADING_H;
    first(this.y, true);
    this.y += first(this.y, false) + gapAfter;
  }
}

const HEADING_H = 9;

function drawHeading(doc: jsPDF, y: number, title: string, right: string | null): void {
  font(doc, 7.5, "bold", C.brand);
  doc.text(title.toUpperCase(), M, y + 3.2, { charSpace: 0.55 });
  if (right) {
    font(doc, 7.5, "normal", C.muted);
    doc.text(right, M + CW, y + 3.2, { align: "right" });
  }
  stroke(doc, C.line, 0.3);
  doc.line(M, y + 5.4, M + CW, y + 5.4);
}

// ── Header & footer (drawn on every page once the page count is known) ──────

function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as unknown as RGB;
}

/**
 * A left-to-right colour sweep drawn as overlapping 1 mm strips (smooth in
 * every viewer, unlike PDF shading patterns which some print paths flatten).
 */
function sweep(doc: jsPDF, y: number, h: number, from: RGB, to: RGB): void {
  const STEP = 1;
  for (let x = 0; x < PAGE_W; x += STEP) {
    fill(doc, mix(from, to, x / PAGE_W));
    doc.rect(x, y, STEP + 0.6, h, "F");
  }
}

/** Dark navy banner with the logo-blue accent rule under it. */
function drawBanner(doc: jsPDF, height: number, accent: number): void {
  sweep(doc, 0, height, C.navyDeep, C.navyLift);
  // Hairline of lifted navy along the bottom edge, then the accent rule that
  // fades from the logo blue into the navy.
  stroke(doc, C.navyLine, 0.2);
  doc.line(0, height - 0.1, PAGE_W, height - 0.1);
  sweep(doc, height, accent, C.logoBlue, C.navyLift);
}

/** Letter-spaced text, right-aligned (jsPDF ignores charSpace when aligning). */
function textRight(doc: jsPDF, str: string, rightX: number, y: number, charSpace: number): void {
  doc.text(str, rightX - doc.getTextWidth(str) - charSpace * (str.length - 1), y, { charSpace });
}

function drawFirstHeader(doc: jsPDF, model: PodReportModel, assets: PodLayoutAssets): void {
  drawBanner(doc, FIRST_HEADER_H, BRAND_BAR_H);

  // Brand lockup (mark, wordmark, tagline) on the left, vertically centred.
  const LOGO_H = 32;
  const logoY = (FIRST_HEADER_H - LOGO_H) / 2;
  const logoRatio = assets.logo?.width && assets.logo?.height ? assets.logo.width / assets.logo.height : 1.465;
  const drewLogo = assets.logo ? drawImageContain(doc, assets.logo, M - 2, logoY, LOGO_H * logoRatio, LOGO_H) : false;
  if (!drewLogo) {
    // Text-only fallback when the logo image can't be loaded.
    font(doc, 21, "bold", C.white);
    doc.text("AXENTRA", M, FIRST_HEADER_H / 2 + 2.5, { charSpace: 2.2 });
    font(doc, 6.5, "normal", C.headerMuted);
    doc.text("PRECISION IN EVERY MOVE", M, FIRST_HEADER_H / 2 + 8, { charSpace: 1.1 });
  }

  const rx = PAGE_W - M;
  font(doc, 6.8, "bold", C.headerLabel);
  textRight(doc, "VEHICLE LOGISTICS", rx, 12.5, 1.4);

  font(doc, 17, "bold", C.white);
  textRight(doc, docTitle(assets), rx, 21.5, 0.9);

  // Short logo-blue rule under the title.
  fill(doc, C.logoBlue);
  doc.rect(rx - 22, 25, 22, 0.6, "F");

  const stage = assets.kind === "collection" ? "Collected" : "Delivered";
  const dated = model.stats.find((s) => s.label === stage)?.value;
  const rows: [string, string][] = [
    ["REFERENCE", model.ref],
    [dated && dated !== "—" ? stage.toUpperCase() : "ISSUED", dated && dated !== "—" ? dated : assets.generatedAt],
  ];
  rows.forEach(([label, value], i) => {
    const y = 31.5 + i * 5;
    font(doc, 8.5, "bold", C.white);
    doc.text(value, rx, y, { align: "right" });
    const vw = doc.getTextWidth(value);
    font(doc, 6.3, "bold", C.headerLabel);
    textRight(doc, label, rx - vw - 3, y, 0.9);
  });
}

function drawContinuationHeader(doc: jsPDF, model: PodReportModel, assets: PodLayoutAssets): void {
  drawBanner(doc, CONT_HEADER_H, 0.8);
  font(doc, 8, "bold", C.white);
  doc.text("AXENTRA", M, 7.6, { charSpace: 1.4 });
  const w = doc.getTextWidth("AXENTRA") + 1.4 * 6;
  font(doc, 6.8, "normal", C.headerMuted);
  doc.text(`|   ${docTitle(assets)}`, M + w + 2.5, 7.6, { charSpace: 0.7 });
  font(doc, 7.2, "normal", C.headerMuted);
  doc.text(`${model.ref}  ·  ${model.reg}`, PAGE_W - M, 7.6, { align: "right" });
}

function drawFooter(doc: jsPDF, model: PodReportModel, assets: PodLayoutAssets, page: number, pages: number): void {
  const y = PAGE_H - 15;
  stroke(doc, C.line, 0.3);
  doc.line(M, y, PAGE_W - M, y);

  const { org } = assets;
  const contact = [org.name, org.email, org.phone].filter(Boolean).join("   ·   ");
  const legal = [
    org.address,
    org.companyNumber ? `Company no. ${org.companyNumber}` : null,
    org.vatNumber ? `VAT no. ${org.vatNumber}` : null,
  ]
    .filter(Boolean)
    .join("   ·   ");

  font(doc, 7, "bold", C.body);
  doc.text(fit(doc, contact, CW * 0.68), M, y + 5);
  font(doc, 6.5, "normal", C.muted);
  if (legal) doc.text(fit(doc, legal, CW * 0.68), M, y + 9);

  font(doc, 7, "bold", C.body);
  doc.text(`${model.ref}   ·   Page ${page} of ${pages}`, PAGE_W - M, y + 5, { align: "right" });
  font(doc, 6.5, "normal", C.muted);
  doc.text(`Generated ${assets.generatedAt}`, PAGE_W - M, y + 9, { align: "right" });
}

// ── Vehicle summary ──────────────────────────────────────────────────────────

function drawPlate(doc: jsPDF, x: number, y: number, reg: string): number {
  const h = 12;
  const band = 7;
  font(doc, 17, "bold", C.ink);
  const w = Math.max(44, doc.getTextWidth(reg) + band + 10);
  fill(doc, C.plateYellow);
  stroke(doc, [30, 30, 30], 0.35);
  doc.roundedRect(x, y, w, h, 1.4, 1.4, "FD");
  fill(doc, C.plateBlue);
  doc.roundedRect(x + 0.35, y + 0.35, band, h - 0.7, 1.1, 1.1, "F");
  doc.rect(x + band - 1.2, y + 0.35, 1.5, h - 0.7, "F");
  font(doc, 5.5, "bold", C.white);
  doc.text("UK", x + 0.35 + band / 2, y + h - 2.4, { align: "center" });
  font(doc, 17, "bold", [10, 10, 10]);
  doc.text(reg, x + band + (w - band) / 2, y + h / 2 + 2.2, { align: "center" });
  return w;
}

const TONES: Record<PodReportModel["status"]["tone"], { fg: RGB; bg: RGB; line: RGB }> = {
  success: { fg: C.green, bg: C.greenSoft, line: C.greenLine },
  info: { fg: C.brand, bg: C.brandSoft, line: [191, 213, 255] },
  neutral: { fg: C.muted, bg: C.soft2, line: C.line },
  danger: { fg: C.red, bg: C.redSoft, line: [254, 202, 202] },
};

function drawStatusPill(doc: jsPDF, rightX: number, y: number, status: PodReportModel["status"]): void {
  const tone = TONES[status.tone];
  const text = status.label.toUpperCase();
  font(doc, 7.5, "bold", tone.fg);
  const tw = doc.getTextWidth(text) + text.length * 0.35;
  const icon = status.tone === "success" ? 4.5 : 0;
  const w = tw + icon + 7;
  const h = 7;
  const x = rightX - w;
  fill(doc, tone.bg);
  stroke(doc, tone.line, 0.3);
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "FD");
  if (icon) tick(doc, x + 5, y + h / 2 - 0.1, 2.6, tone.fg, 0.5);
  font(doc, 7.5, "bold", tone.fg);
  doc.text(text, x + 3.5 + icon, y + h / 2 + 1.25, { charSpace: 0.35 });
}

const vehicleSummary =
  (doc: jsPDF, model: PodReportModel): Block =>
  (y, draw) => {
    const tilesY = y + 18;
    const tileH = 19;
    if (!draw) return tilesY + tileH - y;

    const plateW = drawPlate(doc, M, y, model.reg);
    const tx = M + plateW + 6;
    const pillSpace = 34;
    font(doc, 15, "bold", C.ink);
    doc.text(fit(doc, model.vehicleTitle, CW - plateW - 6 - pillSpace), tx, y + 5.6);
    if (model.vehicleSubtitle) {
      font(doc, 8.5, "normal", C.muted);
      doc.text(model.vehicleSubtitle, tx, y + 11);
    }
    drawStatusPill(doc, M + CW, y + 2.5, model.status);

    const n = model.stats.length;
    const tw = (CW - (n - 1) * 4) / n;
    model.stats.forEach((s, i) => {
      const x = M + i * (tw + 4);
      fill(doc, C.soft);
      stroke(doc, C.line, 0.3);
      doc.roundedRect(x, tilesY, tw, tileH, 1.8, 1.8, "FD");
      label(doc, s.label, x + 4, tilesY + 5.5);
      let size = 10.5;
      font(doc, size, "bold", C.ink);
      while (size > 7.5 && doc.getTextWidth(s.value) > tw - 8) {
        size -= 0.5;
        font(doc, size, "bold", C.ink);
      }
      doc.text(s.value, x + 4, tilesY + 11.5);
      if (s.detail) {
        font(doc, 7, "normal", C.muted);
        doc.text(fit(doc, s.detail, tw - 8), x + 4, tilesY + 15.8);
      }
    });
    return tilesY + tileH - y;
  };

// ── Journey (collection / delivery side by side) ────────────────────────────

const PANEL_W = (CW - COL_GAP) / 2;
const PANEL_PAD = 5;

function stopFields(stop: PodStop): [string, string][] {
  const handover = stop.title === "Collection" ? "Released by" : "Received by";
  return [
    ["Company", stop.company ?? "—"],
    ["Contact", stop.contact ?? "—"],
    ["Phone", stop.phone ?? "—"],
    ["Driver", stop.driver ?? "—"],
    ["Odometer", stop.odometer ?? "—"],
    ["Fuel", stop.fuel ?? "—"],
    [handover, stop.customer ?? "—"],
    ["Damage", !stop.done ? "—" : stop.damages === 0 ? "None recorded" : `${stop.damages} item${stop.damages === 1 ? "" : "s"}`],
  ];
}

/** Draws (or measures) one stop panel's body; returns its height. */
function stopPanel(doc: jsPDF, stop: PodStop, index: number, x: number, y: number, h: number | null, draw: boolean): number {
  const innerW = PANEL_W - PANEL_PAD * 2;
  const colW = (innerW - 4) / 2;

  font(doc, 8.5, "normal", C.body);
  const addr = clampLines(doc, stop.address, innerW, 3);
  const fields = stopFields(stop);
  const rows: { cells: { k: string; lines: string[] }[]; h: number }[] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const cells = fields.slice(i, i + 2).map(([k, v]) => {
      font(doc, 8.5, "normal", C.ink);
      return { k, lines: clampLines(doc, v, colW, 2) };
    });
    rows.push({ cells, h: 4 + Math.max(...cells.map((c) => c.lines.length)) * 3.7 + 3 });
  }

  const headH = 12;
  const addrH = 4 + addr.length * 3.9 + 3.5;
  const natural = headH + 4 + addrH + rows.reduce((a, r) => a + r.h, 0) + 1;
  if (!draw) return natural;

  const panelH = h ?? natural;
  fill(doc, C.white);
  stroke(doc, C.line, 0.3);
  doc.roundedRect(x, y, PANEL_W, panelH, 2, 2, "FD");

  // Header: numbered badge, title, time.
  const badgeColor = stop.done ? C.brand : C.faint;
  fill(doc, badgeColor);
  doc.circle(x + PANEL_PAD + 2.6, y + 6.2, 2.6, "F");
  font(doc, 7, "bold", C.white);
  doc.text(String(index), x + PANEL_PAD + 2.6, y + 7.2, { align: "center" });
  font(doc, 10, "bold", C.ink);
  doc.text(stop.title, x + PANEL_PAD + 7, y + 7.4);
  font(doc, 7.5, stop.done ? "normal" : "italic", stop.done ? C.body : C.muted);
  doc.text(stop.when ?? (stop.done ? "—" : "Not yet completed"), x + PANEL_W - PANEL_PAD, y + 7.4, { align: "right" });
  stroke(doc, C.line, 0.3);
  doc.line(x, y + headH, x + PANEL_W, y + headH);

  let cy = y + headH + 4;
  label(doc, "Address", x + PANEL_PAD, cy + 1.5);
  font(doc, 8.5, "normal", C.ink);
  addr.forEach((l, i) => doc.text(l, x + PANEL_PAD, cy + 5.6 + i * 3.9));
  cy += addrH;

  for (const row of rows) {
    row.cells.forEach((c, i) => {
      const cx = x + PANEL_PAD + i * (colW + 4);
      label(doc, c.k, cx, cy + 1.5);
      font(doc, 8.5, "normal", c.lines[0] === "—" ? C.faint : C.ink);
      c.lines.forEach((l, li) => doc.text(l, cx, cy + 5.4 + li * 3.7));
    });
    cy += row.h;
  }
  return panelH;
}

const journey =
  (doc: jsPDF, model: PodReportModel): Block =>
  (y, draw) => {
    const h = Math.max(
      stopPanel(doc, model.collection, 1, M, y, null, false),
      stopPanel(doc, model.delivery, 2, M + PANEL_W + COL_GAP, y, null, false),
    );
    if (!draw) return h;
    stopPanel(doc, model.collection, 1, M, y, h, true);
    stopPanel(doc, model.delivery, 2, M + PANEL_W + COL_GAP, y, h, true);

    // Connector between the two panels.
    const cx = M + PANEL_W + COL_GAP / 2;
    const cy = y + 6.2;
    fill(doc, C.white);
    stroke(doc, C.line, 0.3);
    doc.circle(cx, cy, 2.7, "FD");
    stroke(doc, C.brand, 0.5);
    doc.line(cx - 0.6, cy - 1.2, cx + 0.7, cy);
    doc.line(cx + 0.7, cy, cx - 0.6, cy + 1.2);
    return h;
  };

// ── Tables ───────────────────────────────────────────────────────────────────

interface Column {
  title: string;
  /** Fraction of the content width. */
  w: number;
  bold?: boolean;
}

const TABLE_HEAD_H = 7;
const CELL_PAD_X = 3;
const TABLE_LINE = 3.8;

function tableRowHeight(doc: jsPDF, cols: Column[], cells: string[]): { h: number; lines: string[][] } {
  const lines = cells.map((c, i) => {
    font(doc, 8.3, cols[i].bold ? "bold" : "normal", C.ink);
    return wrap(doc, c, cols[i].w * CW - CELL_PAD_X * 2);
  });
  return { h: Math.max(...lines.map((l) => l.length)) * TABLE_LINE + 3.4, lines };
}

function drawTableHead(doc: jsPDF, cols: Column[], y: number): void {
  fill(doc, C.soft2);
  doc.rect(M, y, CW, TABLE_HEAD_H, "F");
  let x = M;
  for (const c of cols) {
    label(doc, c.title, x + CELL_PAD_X, y + 4.5);
    x += c.w * CW;
  }
}

function drawTableRow(doc: jsPDF, cols: Column[], row: { h: number; lines: string[][] }, y: number, zebra: boolean): void {
  if (zebra) {
    fill(doc, C.soft);
    doc.rect(M, y, CW, row.h, "F");
  }
  let x = M;
  row.lines.forEach((lines, i) => {
    const empty = lines.length === 1 && lines[0] === "—";
    font(doc, 8.3, cols[i].bold ? "bold" : "normal", empty ? C.faint : cols[i].bold ? C.ink : C.body);
    lines.forEach((l, li) => doc.text(l, x + CELL_PAD_X, y + 4.5 + li * TABLE_LINE));
    x += cols[i].w * CW;
  });
  stroke(doc, C.line, 0.25);
  doc.line(M, y + row.h, M + CW, y + row.h);
}

/**
 * A table that may run over pages: the heading stays with the header row and
 * first data row, and the header row repeats on each new page.
 */
function placeTable(flow: Flow, doc: jsPDF, heading: { title: string; right: string | null }, cols: Column[], data: string[][]): void {
  const rows = data.map((r) => tableRowHeight(doc, cols, r));
  const first: Block = (y, draw) => {
    if (draw) {
      drawTableHead(doc, cols, y);
      drawTableRow(doc, cols, rows[0], y + TABLE_HEAD_H, false);
    }
    return TABLE_HEAD_H + rows[0].h;
  };
  flow.section(heading.title, heading.right, first);
  rows.slice(1).forEach((row, i) => {
    if (!flow.fits(row.h)) {
      flow.newPage();
      drawTableHead(doc, cols, flow.y);
      flow.y += TABLE_HEAD_H;
    }
    drawTableRow(doc, cols, row, flow.y, (i + 1) % 2 === 1);
    flow.y += row.h;
  });
}

function notesBlock(doc: jsPDF, notes: PodChecklist["notes"]): Block {
  return (y, draw) => {
    const w = CW - 10;
    font(doc, 8.3, "normal", C.body);
    const blocks = notes.map((n) => ({ n, lines: wrap(doc, n.text, w) }));
    const h = 4 + blocks.reduce((a, b) => a + 4.5 + b.lines.length * TABLE_LINE + 2, 0) + 1;
    if (!draw) return h;
    fill(doc, C.soft);
    stroke(doc, C.line, 0.3);
    doc.roundedRect(M, y, CW, h, 1.8, 1.8, "FD");
    let cy = y + 4;
    for (const b of blocks) {
      label(doc, `${b.n.stage} notes`, M + 5, cy + 2);
      font(doc, 8.3, "normal", C.body);
      b.lines.forEach((l, i) => doc.text(l, M + 5, cy + 6 + i * TABLE_LINE));
      cy += 4.5 + b.lines.length * TABLE_LINE + 2;
    }
    return h;
  };
}

function placeChecklist(flow: Flow, doc: jsPDF, checklist: PodChecklist): void {
  if (checklist.rows.length) {
    const both = checklist.hasCollection && checklist.hasDelivery;
    const cols: Column[] = both
      ? [
          { title: "Item", w: 0.44, bold: true },
          { title: "At collection", w: 0.28 },
          { title: "At delivery", w: 0.28 },
        ]
      : [
          { title: "Item", w: 0.44, bold: true },
          { title: checklist.hasDelivery ? "At delivery" : "At collection", w: 0.56 },
        ];
    const data = checklist.rows.map((r) =>
      both
        ? [r.label, r.collection ?? "—", r.delivery ?? "—"]
        : [r.label, (checklist.hasDelivery ? r.delivery : r.collection) ?? "—"],
    );
    placeTable(flow, doc, { title: "Vehicle checklist", right: null }, cols, data);
    if (checklist.notes.length) {
      flow.y += 4;
      flow.place(notesBlock(doc, checklist.notes));
    }
  } else {
    flow.section("Vehicle checklist", null, notesBlock(doc, checklist.notes));
  }
  flow.y += SECTION_GAP;
}

// ── Damage ───────────────────────────────────────────────────────────────────

const noDamage =
  (doc: jsPDF, delivered: boolean): Block =>
  (y, draw) => {
    const h = 15;
    if (!draw) return h;
    fill(doc, C.greenSoft);
    stroke(doc, C.greenLine, 0.3);
    doc.roundedRect(M, y, CW, h, 1.8, 1.8, "FD");
    fill(doc, C.green);
    doc.circle(M + 8, y + h / 2, 3.2, "F");
    tick(doc, M + 8, y + h / 2 - 0.2, 3, C.white, 0.6);
    font(doc, 9.5, "bold", C.green);
    doc.text("No damage recorded", M + 14.5, y + 6.4);
    font(doc, 7.8, "normal", C.body);
    doc.text(
      delivered
        ? "No damage was noted on the vehicle at collection or at delivery."
        : "No damage has been noted on the vehicle so far.",
      M + 14.5,
      y + 10.8,
    );
    return h;
  };

function placeDamage(flow: Flow, doc: jsPDF, damages: PodDamage[], delivered: boolean): void {
  if (!damages.length) {
    flow.section("Damage report", null, noDamage(doc, delivered), SECTION_GAP);
    return;
  }
  const cols: Column[] = [
    { title: "Recorded at", w: 0.15 },
    { title: "Location", w: 0.19, bold: true },
    { title: "Item", w: 0.19 },
    { title: "Damage", w: 0.2 },
    { title: "Notes", w: 0.27 },
  ];
  placeTable(
    flow,
    doc,
    { title: "Damage report", right: `${damages.length} item${damages.length === 1 ? "" : "s"} recorded` },
    cols,
    damages.map((d) => [d.stage, d.location, d.item, d.damage, d.notes ?? "—"]),
  );
  flow.y += SECTION_GAP;
}

// ── Sign-off ─────────────────────────────────────────────────────────────────

const SIG_BOX_H = 24;

const signoffBlock =
  (doc: jsPDF, s: PodSignoff, images: Map<string, PdfImage | null>): Block =>
  (y, draw) => {
    const h = 7 + SIG_BOX_H + 11;
    if (!draw) return h;
    font(doc, 9.5, "bold", C.ink);
    doc.text(s.stage, M, y + 4);
    if (s.when) {
      font(doc, 7.5, "normal", C.muted);
      doc.text(s.when, M + CW, y + 4, { align: "right" });
    }
    s.signatures.forEach((sig, i) => {
      const x = M + i * (PANEL_W + COL_GAP);
      const by = y + 7;
      fill(doc, C.white);
      stroke(doc, C.line, 0.3);
      doc.roundedRect(x, by, PANEL_W, SIG_BOX_H, 1.8, 1.8, "FD");
      const img = sig.url ? images.get(sig.url) : null;
      const drew = img ? drawImageContain(doc, img, x + 4, by + 2.5, PANEL_W - 8, SIG_BOX_H - 5) : false;
      if (!drew) {
        font(doc, 8, "italic", C.faint);
        doc.text(sig.url ? "Signature image unavailable" : "Not signed", x + PANEL_W / 2, by + SIG_BOX_H / 2 + 1, {
          align: "center",
        });
      }
      font(doc, 8.8, "bold", sig.name ? C.ink : C.faint);
      doc.text(fit(doc, sig.name ?? "Name not recorded", PANEL_W), x, by + SIG_BOX_H + 5);
      font(doc, 7, "normal", C.muted);
      doc.text(sig.role, x, by + SIG_BOX_H + 9);
    });
    return h;
  };

const declaration =
  (doc: jsPDF, orgName: string): Block =>
  (y, draw) => {
    const text =
      "By signing at delivery, the recipient confirms that the vehicle described in this report was received in the " +
      `condition recorded above, including any damage noted and the photographs taken by ${orgName} at collection ` +
      "and delivery.";
    font(doc, 7.6, "normal", C.body);
    const lines = wrap(doc, text, CW - 10);
    const h = 8.5 + lines.length * 3.6 + 2.5;
    if (!draw) return h;
    fill(doc, C.brandSoft);
    doc.roundedRect(M, y, CW, h, 1.8, 1.8, "F");
    fill(doc, C.brand);
    doc.rect(M, y, 1.2, h, "F");
    label(doc, "Declaration", M + 5, y + 5, C.brand);
    font(doc, 7.6, "normal", C.body);
    lines.forEach((l, i) => doc.text(l, M + 5, y + 9.5 + i * 3.6));
    return h;
  };

// ── Photos ───────────────────────────────────────────────────────────────────

const PHOTO_COLS = 4;
const PHOTO_GAP = 4;
const PHOTO_SIZE = (CW - (PHOTO_COLS - 1) * PHOTO_GAP) / PHOTO_COLS;
const PHOTO_ROW_H = PHOTO_SIZE + 7.5;

const zipBlock =
  (doc: jsPDF, url: string, count: number): Block =>
  (y, draw) => {
    const h = 13;
    if (!draw) return h;
    fill(doc, C.brandSoft);
    stroke(doc, [191, 213, 255], 0.3);
    doc.roundedRect(M, y, CW, h, 1.8, 1.8, "FD");
    // Download glyph: arrow into a tray.
    const gx = M + 7.5;
    const gy = y + h / 2;
    stroke(doc, C.brand, 0.55);
    doc.line(gx, gy - 3, gx, gy + 1);
    doc.line(gx - 1.6, gy - 0.6, gx, gy + 1);
    doc.line(gx + 1.6, gy - 0.6, gx, gy + 1);
    doc.line(gx - 2.6, gy + 2.6, gx + 2.6, gy + 2.6);
    font(doc, 9, "bold", C.brand);
    doc.text("Download full-resolution photos", M + 14, y + 5.6);
    font(doc, 7.5, "normal", C.body);
    doc.text(`All ${count} photos from this job as a single ZIP file. The link stays valid for 30 days.`, M + 14, y + 9.7);
    font(doc, 8, "bold", C.brand);
    doc.text("Download ZIP", M + CW - 5, y + h / 2 + 1.2, { align: "right" });
    doc.link(M, y, CW, h, { url });
    return h;
  };

function photoRow(doc: jsPDF, photos: PodPhotoGroup["photos"], thumbs: Map<string, PdfImage | null>, start: number): Block {
  return (y, draw) => {
    if (!draw) return PHOTO_ROW_H;
    photos.slice(start, start + PHOTO_COLS).forEach((p, i) => {
      const x = M + i * (PHOTO_SIZE + PHOTO_GAP);
      const img = thumbs.get(p.url);
      const drew = img ? drawImageCover(doc, img, x, y, PHOTO_SIZE) : false;
      if (!drew) {
        fill(doc, C.soft2);
        doc.rect(x, y, PHOTO_SIZE, PHOTO_SIZE, "F");
        font(doc, 7.5, "italic", C.faint);
        doc.text("Image unavailable", x + PHOTO_SIZE / 2, y + PHOTO_SIZE / 2 + 1, { align: "center" });
      }
      stroke(doc, C.line, 0.3);
      doc.rect(x, y, PHOTO_SIZE, PHOTO_SIZE, "S");
      font(doc, 7, "normal", C.body);
      doc.text(fit(doc, photoCaption(p), PHOTO_SIZE), x, y + PHOTO_SIZE + 4.2);
    });
    return PHOTO_ROW_H;
  };
}

function placePhotoGroup(flow: Flow, doc: jsPDF, group: PodPhotoGroup, thumbs: Map<string, PdfImage | null>): void {
  const count = `${group.photos.length} photo${group.photos.length === 1 ? "" : "s"}`;
  const right = group.subtitle ? `${count}  ·  ${group.subtitle}` : count;
  for (let i = 0; i < group.photos.length; i += PHOTO_COLS) {
    const row = photoRow(doc, group.photos, thumbs, i);
    if (i === 0) flow.section(group.title, right, row, 1.5);
    else flow.place(row, 1.5);
  }
  flow.y += SECTION_GAP - 1.5;
}

// ── Document ─────────────────────────────────────────────────────────────────

export function layoutPodPdf(doc: jsPDF, model: PodReportModel, assets: PodLayoutAssets): void {
  const docName = assets.kind === "collection" ? "Proof of Collection" : "Proof of Delivery";
  doc.setProperties({
    title: `${docName} ${model.ref} – ${model.reg}`,
    subject: `${docName} for ${model.reg}`,
    author: assets.org.name,
    creator: assets.org.name,
  });

  const flow = new Flow(doc, FIRST_HEADER_H + BRAND_BAR_H + 9);
  flow.place(vehicleSummary(doc, model), SECTION_GAP + 2);
  flow.section("Journey", null, journey(doc, model), SECTION_GAP);
  if (model.checklist) placeChecklist(flow, doc, model.checklist);
  placeDamage(flow, doc, model.damages, model.delivery.done);

  if (model.signoffs.length) {
    model.signoffs.forEach((s, i) => {
      const block = signoffBlock(doc, s, assets.signatures);
      if (i === 0) flow.section("Sign-off", null, block, 5);
      else flow.place(block, 5);
    });
    if (model.delivery.done) flow.place(declaration(doc, assets.org.name), SECTION_GAP);
    else flow.y += SECTION_GAP - 5;
  }

  if (model.expenses.length) {
    placeTable(
      flow,
      doc,
      { title: "Expenses", right: `${model.expenses.length} item${model.expenses.length === 1 ? "" : "s"}` },
      [
        { title: "Type", w: 0.3, bold: true },
        { title: "Description", w: 0.7 },
      ],
      model.expenses.map((e) => [e.category, e.description ?? "—"]),
    );
    flow.y += SECTION_GAP;
  }

  const photoCount = model.photoGroups.reduce((a, g) => a + g.photos.length, 0);
  model.photoGroups.forEach((g, i) => {
    if (i === 0 && assets.photosZipUrl) {
      // Keep the download banner with the first group's heading and row.
      const banner = zipBlock(doc, assets.photosZipUrl, photoCount);
      const need = banner(0, false) + 5 + HEADING_H + PHOTO_ROW_H;
      if (!flow.fits(need) && flow.y > CONTENT_TOP) flow.newPage();
      flow.place(banner, 5);
    }
    placePhotoGroup(flow, doc, g, assets.thumbs);
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    if (p === 1) drawFirstHeader(doc, model, assets);
    else drawContinuationHeader(doc, model, assets);
    drawFooter(doc, model, assets, p, pages);
  }
}
