import jsPDF from "jspdf";
import type { JobWithRelations } from "./types";
import { FUEL_PERCENT_TO_LABEL } from "./types";
import { getChecklistItems } from "./inspectionFields";
import { resolveImageUrlAsync } from "./gcsProxyUrl";
import { canonicalisePhotos } from "./photoDedupe";
import { PHOTO_TYPES_BY_INSPECTION } from "@/features/inspection/inspectionFormConfig";
import { getStatusStyle } from "./statusConfig";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type JSZip from "jszip";

const PHOTO_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  [...PHOTO_TYPES_BY_INSPECTION.pickup, ...PHOTO_TYPES_BY_INSPECTION.delivery].map(
    (p) => [p.key, p.label]
  )
);

// =====================================================================
// Layout constants — mirrors the in-app POD viewer (PodReport.tsx): a
// dark header bar, then a stack of bordered white "cards" per section.
// =====================================================================
const MARGIN = 16;
const CARD_PADDING = 5;
const CARD_GAP = 5;
const HEADER_HEIGHT = 34;
const FOOTER_GAP = 8;
const ROW_LINE = 4.0;
const HEADING_H = 6.5;
const EST_BUFFER = 6;

// Design tokens lifted from src/index.css (:root HSL vars, converted to RGB)
// so the PDF reads as the same brand as the app instead of a generic report.
const PDF_THEME = {
  headerBg: [31, 41, 55] as [number, number, number], // --foreground
  text: [31, 41, 55] as [number, number, number], // --foreground
  muted: [102, 115, 133] as [number, number, number], // --muted-foreground
  mutedFill: [241, 245, 249] as [number, number, number], // --muted
  cardBorder: [225, 231, 239] as [number, number, number], // --border
  primary: [13, 70, 150] as [number, number, number], // --primary
  white: [255, 255, 255] as [number, number, number],
  headerSubtext: [190, 197, 214] as [number, number, number],
  headerFaint: [150, 158, 176] as [number, number, number],
};

const IMAGE_LIMITS = {
  maxWidth: 1600,
  maxHeight: 1200,
  jpegQuality: 0.82,
  signatureMaxWidth: 1200,
  signatureMaxHeight: 400,
  signatureQuality: 0.92,
};

// Thumbnails are deliberately much smaller than full photo embeds — real
// images in the PDF were previously removed entirely because full-size
// embeds bloated the file. Bounding these to ~480px keeps a job's worth
// of photos to well under a megabyte while still matching the app's
// photo-grid look, instead of the old text-only caption list.
const THUMB_LIMITS = { size: 480, quality: 0.62 };
const THUMB_COLS = 4;
const THUMB_GAP = 3;
const THUMB_CAPTION_H = 4;
const THUMB_ROW_GAP = 3;
const THUMB_CHUNK = 12; // 3 rows of 4 — keeps each photo card within one page

const DEBUG_POD =
  typeof window !== "undefined" &&
  (window as Window & { __AXENTRA_POD_DEBUG__?: boolean }).__AXENTRA_POD_DEBUG__ === true;

export interface PodExpense {
  id: string;
  category: string;
  label: string | null;
  amount: number;
  billable_on_pod: boolean;
}

type ImageFormat = "PNG" | "JPEG" | "WEBP";

type CachedImage = {
  dataUrl: string;
  format: ImageFormat;
  width?: number;
  height?: number;
};

type PhotoLike = {
  url: string;
  label?: string | null;
  type: string;
};

type SignatureLike = {
  label: string;
  name: string;
  url?: string | null;
};

function debugLog(message: string, meta?: unknown): void {
  if (!DEBUG_POD) return;
  console.log(`[POD PDF] ${message}`, meta ?? "");
}

function clean(value: unknown, fallback = "—"): string {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function joinParts(parts: Array<string | null | undefined>, separator = ", "): string {
  const filtered = parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean);
  return filtered.length ? filtered.join(separator) : "—";
}

function fuelLabel(pct: number | null | undefined): string {
  if (pct == null) return "N/A";
  return FUEL_PERCENT_TO_LABEL[pct] ?? `${pct}%`;
}

function safeDate(iso: string | null | undefined): string {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hexToRgb(hex: string): [number, number, number] {
  const clean6 = hex.replace("#", "");
  const value = parseInt(clean6, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function getPageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

function getPageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

function getContentWidth(doc: jsPDF): number {
  return getPageWidth(doc) - MARGIN * 2;
}

function getFooterY(doc: jsPDF): number {
  return getPageHeight(doc) - FOOTER_GAP;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const usableBottom = getFooterY(doc) - 6;
  if (y + needed > usableBottom) {
    doc.addPage();
    return MARGIN + 4;
  }
  return y;
}

function setTextStyle(
  doc: jsPDF,
  options?: {
    size?: number;
    style?: "normal" | "bold" | "italic" | "bolditalic";
    color?: [number, number, number];
  }
): void {
  doc.setFont("helvetica", options?.style ?? "normal");
  doc.setFontSize(options?.size ?? 8);
  const color = options?.color ?? PDF_THEME.text;
  doc.setTextColor(...color);
}

// =====================================================================
// Card primitive — the app renders every section as its own bordered,
// rounded Card. jsPDF has no z-order, so content is drawn first and the
// border is stroked around it afterwards (a stroke never covers inset
// text). Height is estimated up front purely so `ensureSpace` can decide
// whether the whole card needs to start on a fresh page — a generous
// over-estimate just leaves a little extra whitespace, never overflow.
// =====================================================================
function renderCard(
  doc: jsPDF,
  y: number,
  estimatedHeight: number,
  render: (contentX: number, contentY: number, contentWidth: number) => number
): number {
  y = ensureSpace(doc, y, estimatedHeight);
  const boxTop = y;
  const contentX = MARGIN + CARD_PADDING;
  const contentWidth = getContentWidth(doc) - CARD_PADDING * 2;
  const contentBottom = render(contentX, boxTop + CARD_PADDING, contentWidth);
  const boxHeight = contentBottom - boxTop + CARD_PADDING;

  doc.setDrawColor(...PDF_THEME.cardBorder);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, boxTop, getContentWidth(doc), boxHeight, 2, 2, "S");

  return boxTop + boxHeight + CARD_GAP;
}

function drawDetailRow(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string
): number {
  const labelWidth = width * 0.36;
  const valueWidth = width * 0.6;

  setTextStyle(doc, { size: 8.3, style: "normal", color: PDF_THEME.muted });
  doc.text(doc.splitTextToSize(label, labelWidth)[0], x, y);

  setTextStyle(doc, { size: 8.3, style: "bold", color: PDF_THEME.text });
  const valueLines: string[] = doc.splitTextToSize(value, valueWidth);
  valueLines.forEach((line, i) => {
    doc.text(line, x + width, y + i * ROW_LINE, { align: "right" });
  });

  return y + Math.max(1, valueLines.length) * ROW_LINE + 0.8;
}

function renderDetailRows(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  rows: Array<[string, string]>
): number {
  let cy = y;
  for (const [label, value] of rows) {
    cy = drawDetailRow(doc, x, cy, width, label, value);
  }
  return cy;
}

function estimateDetailCardHeight(rowCount: number, extraTop = 0): number {
  return extraTop + HEADING_H + rowCount * 5.4 + EST_BUFFER;
}

function renderChecklistGrid(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  items: Array<[string, string]>,
  cols = 3
): number {
  const colWidth = width / cols;
  let maxRow = 0;
  items.forEach(([label, value], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = x + col * colWidth;
    const cy = y + row * 4.8;

    setTextStyle(doc, { size: 7.6, style: "normal", color: PDF_THEME.muted });
    doc.text(doc.splitTextToSize(label, colWidth - 16)[0], cx, cy);
    setTextStyle(doc, { size: 7.6, style: "bold", color: PDF_THEME.text });
    doc.text(clean(value), cx + colWidth - 2, cy, { align: "right" });

    maxRow = Math.max(maxRow, row);
  });
  return y + (maxRow + 1) * 4.8;
}

function estimateChecklistCardHeight(itemCount: number, cols = 3, hasNotes = false): number {
  const rows = Math.max(1, Math.ceil(itemCount / cols));
  return HEADING_H + rows * 4.8 + (hasNotes ? 10 : 0) + EST_BUFFER;
}

function drawUkPlate(doc: jsPDF, x: number, yTop: number, reg: string): number {
  const h = 9;
  const barW = 7;
  const padX = 3;

  setTextStyle(doc, { size: 11, style: "bold", color: [0, 0, 0] });
  const regText = clean(reg).toUpperCase();
  const regWidth = doc.getTextWidth(regText);
  const totalW = barW + regWidth + padX * 2;

  doc.setFillColor(252, 209, 22); // #FCD116 — UK rear-plate yellow
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, yTop, totalW, h, 1, 1, "FD");

  doc.setFillColor(0, 51, 153); // #003399 — UK plate blue
  doc.rect(x, yTop, barW, h, "F");
  setTextStyle(doc, { size: 4.3, style: "bold", color: PDF_THEME.white });
  doc.text("UK", x + barW / 2, yTop + h / 2 + 1, { align: "center" });

  setTextStyle(doc, { size: 11, style: "bold", color: [0, 0, 0] });
  doc.text(regText, x + barW + padX, yTop + h / 2 + 1.6);

  return totalW;
}

function drawStatusPill(
  doc: jsPDF,
  rightX: number,
  yTop: number,
  label: string,
  bgHex: string
): number {
  const [r, g, b] = hexToRgb(bgHex);
  setTextStyle(doc, { size: 7.3, style: "bold", color: PDF_THEME.white });
  const textW = doc.getTextWidth(label);
  const padX = 3;
  const h = 6;
  const w = textW + padX * 2;
  const x = rightX - w;

  doc.setFillColor(r, g, b);
  doc.roundedRect(x, yTop, w, h, h / 2, h / 2, "F");
  doc.text(label, x + w / 2, yTop + h / 2 + 1.3, { align: "center" });

  return w;
}

function addWrappedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  options?: {
    fontSize?: number;
    fontStyle?: "normal" | "bold" | "italic" | "bolditalic";
    textColor?: [number, number, number];
    lineHeight?: number;
    align?: "left" | "right";
  }
): number {
  const {
    fontSize = 8,
    fontStyle = "normal",
    textColor = PDF_THEME.text,
    lineHeight = 4,
    align = "left",
  } = options ?? {};

  setTextStyle(doc, { size: fontSize, style: fontStyle, color: textColor });

  const lines: string[] = doc.splitTextToSize(text, width);
  const drawX = align === "right" ? x + width : x;
  doc.text(lines, drawX, y, { align });

  return y + lines.length * lineHeight;
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function detectImageFormat(dataUrl: string): ImageFormat | null {
  if (dataUrl.startsWith("data:image/png")) return "PNG";
  if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
  if (dataUrl.startsWith("data:image/jpg")) return "JPEG";
  if (dataUrl.startsWith("data:image/webp")) return "WEBP";
  return null;
}

async function loadHtmlImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function compressImageDataUrl(
  dataUrl: string,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    preserveTransparency?: boolean;
  }
): Promise<CachedImage | null> {
  try {
    const img = await loadHtmlImage(dataUrl);
    if (!img) return null;

    const preserveTransparency = options?.preserveTransparency ?? false;
    const maxWidth = options?.maxWidth ?? IMAGE_LIMITS.maxWidth;
    const maxHeight = options?.maxHeight ?? IMAGE_LIMITS.maxHeight;
    const quality = options?.quality ?? IMAGE_LIMITS.jpegQuality;

    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    const targetWidth = Math.max(1, Math.round(img.width * scale));
    const targetHeight = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    if (!preserveTransparency) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const outputType = preserveTransparency ? "image/png" : "image/jpeg";
    const outputDataUrl = canvas.toDataURL(
      outputType,
      preserveTransparency ? undefined : quality
    );

    const format = detectImageFormat(outputDataUrl);
    if (!format) return null;

    return {
      dataUrl: outputDataUrl,
      format,
      width: targetWidth,
      height: targetHeight,
    };
  } catch {
    return null;
  }
}

/** Center-crop to a square (matches the app's aspect-square thumbnail tiles). */
async function compressImageDataUrlSquare(
  dataUrl: string,
  size: number,
  quality: number
): Promise<CachedImage | null> {
  try {
    const img = await loadHtmlImage(dataUrl);
    if (!img) return null;

    const srcSize = Math.min(img.width, img.height);
    const sx = (img.width - srcSize) / 2;
    const sy = (img.height - srcSize) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);

    const outputDataUrl = canvas.toDataURL("image/jpeg", quality);
    const format = detectImageFormat(outputDataUrl);
    if (!format) return null;

    return { dataUrl: outputDataUrl, format, width: size, height: size };
  } catch {
    return null;
  }
}

const FETCH_TIMEOUT_MS = 15_000; // 15 second timeout per image

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, { mode: "cors", signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      debugLog("Image fetch failed", { url, status: response.status });
      return null;
    }
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === "AbortError";
    debugLog(isTimeout ? "Image fetch timeout" : "Image fetch error", { url, error });
    return null;
  }
}

async function loadImage(
  url: string,
  options?: {
    isSignature?: boolean;
  }
): Promise<CachedImage | null> {
  try {
    const resolvedUrl = (await resolveImageUrlAsync(url)) ?? url;
    const tryUrls = resolvedUrl === url ? [url] : [resolvedUrl, url];

    for (const candidate of tryUrls) {
      const dataUrl = await fetchImageAsDataUrl(candidate);
      if (!dataUrl) continue;

      const baseFormat = detectImageFormat(dataUrl);
      if (!baseFormat) {
        debugLog("Unsupported image format", { candidate });
        continue;
      }

      const compressed = await compressImageDataUrl(dataUrl, {
        maxWidth: options?.isSignature ? IMAGE_LIMITS.signatureMaxWidth : IMAGE_LIMITS.maxWidth,
        maxHeight: options?.isSignature ? IMAGE_LIMITS.signatureMaxHeight : IMAGE_LIMITS.maxHeight,
        quality: options?.isSignature ? IMAGE_LIMITS.signatureQuality : IMAGE_LIMITS.jpegQuality,
        preserveTransparency: options?.isSignature ?? false,
      });

      if (compressed) return compressed;
      return { dataUrl, format: baseFormat };
    }

    return null;
  } catch (error) {
    debugLog("Image load failed", { url, error });
    return null;
  }
}

async function loadThumbnail(url: string): Promise<CachedImage | null> {
  try {
    const resolvedUrl = (await resolveImageUrlAsync(url)) ?? url;
    const tryUrls = resolvedUrl === url ? [url] : [resolvedUrl, url];

    for (const candidate of tryUrls) {
      const dataUrl = await fetchImageAsDataUrl(candidate);
      if (!dataUrl) continue;
      const compressed = await compressImageDataUrlSquare(
        dataUrl,
        THUMB_LIMITS.size,
        THUMB_LIMITS.quality
      );
      if (compressed) return compressed;
    }
    return null;
  } catch (error) {
    debugLog("Thumbnail load failed", { url, error });
    return null;
  }
}

async function buildPhotoThumbnailCache(
  photos: PhotoLike[]
): Promise<Map<string, CachedImage | null>> {
  const cache = new Map<string, CachedImage | null>();

  await Promise.allSettled(
    photos.map(async (p) => {
      cache.set(p.url, await loadThumbnail(p.url));
    })
  );

  // One short retry pass — mirrors buildSignatureImageCache's handling of a
  // transient network blip dropping an image from the burst above.
  const failed = photos.filter((p) => !cache.get(p.url));
  if (failed.length > 0) {
    debugLog("Retrying failed POD photo thumbnails", { count: failed.length });
    await new Promise((r) => setTimeout(r, 700));
    await Promise.allSettled(
      failed.map(async (p) => {
        const image = await loadThumbnail(p.url);
        if (image) cache.set(p.url, image);
      })
    );
  }

  return cache;
}

async function loadLogo(): Promise<CachedImage | null> {
  return loadImage("/axentra-logo-lockup.webp");
}

function drawImageContain(
  doc: jsPDF,
  image: CachedImage,
  x: number,
  y: number,
  boxWidth: number,
  boxHeight: number
): boolean {
  try {
    const iw = image.width ?? boxWidth;
    const ih = image.height ?? boxHeight;
    const scale = Math.min(boxWidth / iw, boxHeight / ih);
    const renderWidth = iw * scale;
    const renderHeight = ih * scale;
    const renderX = x + (boxWidth - renderWidth) / 2;
    const renderY = y + (boxHeight - renderHeight) / 2;

    doc.addImage(image.dataUrl, image.format, renderX, renderY, renderWidth, renderHeight);
    return true;
  } catch (error) {
    debugLog("addImage failed", { error, format: image.format });
    return false;
  }
}

// =====================================================================
// Header — dark bar with a white logo chip (strong, unmissable branding)
// plus the same two-line title block and job/date block the in-app POD
// viewer's Card header uses.
// =====================================================================
function renderHeader(
  doc: jsPDF,
  job: JobWithRelations,
  ref: string,
  logo: CachedImage | null
): void {
  const pageWidth = getPageWidth(doc);

  doc.setFillColor(...PDF_THEME.headerBg);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, "F");

  const chipW = 34;
  const chipH = 24;
  const chipX = MARGIN;
  const chipY = (HEADER_HEIGHT - chipH) / 2;

  doc.setFillColor(...PDF_THEME.white);
  doc.roundedRect(chipX, chipY, chipW, chipH, 2, 2, "F");
  if (logo) {
    drawImageContain(doc, logo, chipX + 2, chipY + 2, chipW - 4, chipH - 4);
  }

  const textX = chipX + chipW + 8;
  setTextStyle(doc, { size: 7.3, style: "bold", color: PDF_THEME.white });
  doc.text("AXENTRA VEHICLE LOGISTICS", textX, HEADER_HEIGHT / 2 - 4);
  setTextStyle(doc, { size: 14, style: "bold", color: PDF_THEME.white });
  doc.text("Proof of Delivery", textX, HEADER_HEIGHT / 2 + 4.5);

  setTextStyle(doc, { size: 8, style: "bold", color: PDF_THEME.white });
  doc.text("AXENTRA", pageWidth - MARGIN, HEADER_HEIGHT / 2 - 6, { align: "right" });
  setTextStyle(doc, { size: 7.3, style: "normal", color: PDF_THEME.headerSubtext });
  doc.text(`Job ${ref}`, pageWidth - MARGIN, HEADER_HEIGHT / 2, { align: "right" });
  setTextStyle(doc, { size: 6.3, style: "normal", color: PDF_THEME.headerFaint });
  doc.text(
    safeDate(job.completed_at || new Date().toISOString()),
    pageWidth - MARGIN,
    HEADER_HEIGHT / 2 + 5.5,
    { align: "right" }
  );
}

function renderFooter(doc: jsPDF, ref: string): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = getPageWidth(doc);
  const footerY = getFooterY(doc);
  const generatedAt = new Date().toLocaleString("en-GB");

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setTextStyle(doc, { size: 7, style: "normal", color: PDF_THEME.muted });
    doc.text("Generated by Axentra Vehicle Logistics", MARGIN, footerY);
    doc.text(`Job ${ref} • ${generatedAt} • Page ${p}/${totalPages}`, pageWidth - MARGIN, footerY, {
      align: "right",
    });
  }
}

function renderPhotoGrid(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
  photos: PhotoLike[],
  cache: Map<string, CachedImage | null>
): number {
  setTextStyle(doc, { size: 9.5, style: "bold", color: PDF_THEME.text });
  doc.text(title, x, y);
  const gridY = y + 6;

  const tileSize = (width - THUMB_GAP * (THUMB_COLS - 1)) / THUMB_COLS;

  photos.forEach((photo, i) => {
    const col = i % THUMB_COLS;
    const row = Math.floor(i / THUMB_COLS);
    const tileX = x + col * (tileSize + THUMB_GAP);
    const tileY = gridY + row * (tileSize + THUMB_CAPTION_H + THUMB_ROW_GAP);

    const image = cache.get(photo.url) ?? null;
    if (image && drawImageContain(doc, image, tileX, tileY, tileSize, tileSize)) {
      // drawn
    } else {
      doc.setFillColor(...PDF_THEME.mutedFill);
      doc.rect(tileX, tileY, tileSize, tileSize, "F");
      setTextStyle(doc, { size: 6, style: "normal", color: PDF_THEME.muted });
      doc.text("Image unavailable", tileX + tileSize / 2, tileY + tileSize / 2, {
        align: "center",
      });
    }
    doc.setDrawColor(...PDF_THEME.cardBorder);
    doc.setLineWidth(0.25);
    doc.roundedRect(tileX, tileY, tileSize, tileSize, 1, 1, "S");

    const caption = clean(photo.label || PHOTO_TYPE_LABELS[photo.type] || photo.type);
    setTextStyle(doc, { size: 6.3, style: "normal", color: PDF_THEME.muted });
    const truncated = doc.splitTextToSize(caption, tileSize)[0];
    doc.text(truncated, tileX + tileSize / 2, tileY + tileSize + 3.2, { align: "center" });
  });

  const rows = Math.ceil(photos.length / THUMB_COLS);
  return gridY + rows * (tileSize + THUMB_CAPTION_H + THUMB_ROW_GAP) - THUMB_ROW_GAP;
}

function estimatePhotoGridCardHeight(contentWidth: number, count: number): number {
  const tileSize = (contentWidth - THUMB_GAP * (THUMB_COLS - 1)) / THUMB_COLS;
  const rows = Math.max(1, Math.ceil(count / THUMB_COLS));
  return (
    HEADING_H +
    rows * (tileSize + THUMB_CAPTION_H + THUMB_ROW_GAP) -
    THUMB_ROW_GAP +
    EST_BUFFER
  );
}

/** Renders a photo group as one or more cards, chunked so each card fits a page. */
function renderPhotoSection(
  doc: jsPDF,
  y: number,
  title: string,
  photos: PhotoLike[],
  cache: Map<string, CachedImage | null>
): number {
  if (!photos.length) return y;

  const innerWidth = getContentWidth(doc) - CARD_PADDING * 2;

  for (let i = 0; i < photos.length; i += THUMB_CHUNK) {
    const chunk = photos.slice(i, i + THUMB_CHUNK);
    const chunkTitle = i === 0 ? `${title} (${photos.length})` : `${title} (cont.)`;
    const estHeight = estimatePhotoGridCardHeight(innerWidth, chunk.length);
    y = renderCard(doc, y, estHeight, (cx, cy, cw) =>
      renderPhotoGrid(doc, cx, cy, cw, chunkTitle, chunk, cache)
    );
  }

  return y;
}

/** Real clickable link (not just link-colored text) to the photos zip. */
function renderPhotosDownloadCard(doc: jsPDF, y: number, url: string | null): number {
  return renderCard(doc, y, 22, (x, cy, width) => {
    let ny = addWrappedText(
      doc,
      "Full-resolution images are stored securely within Axentra and can be supplied on request.",
      x,
      cy,
      width,
      { fontSize: 7.5, textColor: PDF_THEME.muted, lineHeight: 3.6 }
    );

    if (!url) return ny;

    ny += 3;
    const label = "Download all photos (ZIP)";
    const paddingX = 4;
    const boxHeight = 8;

    setTextStyle(doc, { size: 9, style: "bold", color: PDF_THEME.white });
    const textWidth = doc.getTextWidth(label);
    const boxWidth = textWidth + paddingX * 2;

    doc.setFillColor(...PDF_THEME.headerBg);
    doc.roundedRect(x, ny, boxWidth, boxHeight, 1.5, 1.5, "F");
    doc.text(label, x + paddingX, ny + boxHeight / 2 + 1.2);
    doc.link(x, ny, boxWidth, boxHeight, { url });

    return ny + boxHeight;
  });
}

function renderSignaturesCard(
  doc: jsPDF,
  y: number,
  signatures: SignatureLike[],
  imageCache: Map<string, CachedImage | null>
): number {
  const estHeight = HEADING_H + 26 + EST_BUFFER;

  return renderCard(doc, y, estHeight, (x, cy, width) => {
    setTextStyle(doc, { size: 10, style: "bold", color: PDF_THEME.text });
    doc.text("Signatures", x, cy);
    const rowY = cy + 6;

    const sigWidth = (width - 9) / 4;
    const sigHeight = 18;
    let sigX = x;

    for (const sig of signatures) {
      setTextStyle(doc, { size: 7, style: "bold", color: PDF_THEME.muted });
      doc.text(sig.label.toUpperCase(), sigX, rowY);

      setTextStyle(doc, { size: 7.5, style: "normal", color: PDF_THEME.text });
      doc.text(clean(sig.name), sigX, rowY + 4);

      doc.setDrawColor(...PDF_THEME.cardBorder);
      doc.setLineWidth(0.3);
      doc.setFillColor(...PDF_THEME.mutedFill);
      doc.roundedRect(sigX, rowY + 6, sigWidth, sigHeight, 1, 1, "FD");

      if (sig.url) {
        const image = imageCache.get(sig.url) ?? null;
        const ok = image && drawImageContain(doc, image, sigX + 1, rowY + 7, sigWidth - 2, sigHeight - 2);
        if (!ok) {
          setTextStyle(doc, { size: 7, style: "normal", color: PDF_THEME.muted });
          doc.text("Image unavailable", sigX + sigWidth / 2, rowY + 16, { align: "center" });
        }
      } else {
        setTextStyle(doc, { size: 7, style: "normal", color: PDF_THEME.muted });
        doc.text("Not signed", sigX + sigWidth / 2, rowY + 16, { align: "center" });
      }

      sigX += sigWidth + 3;
    }

    return rowY + sigHeight + 6;
  });
}

/**
 * Resolve a signature URL via the simple direct helper (no edge function).
 */
async function resolveSignatureForPdf(
  url: string,
  meta?: { jobId?: string; orgId?: string }
): Promise<string> {
  try {
    const { resolveSignatureUrlSimple } = await import("./resolveSignatureUrlSimple");
    const resolved = await resolveSignatureUrlSimple(url);
    if (!resolved) {
      const { logClientEvent } = await import("./logger");
      void logClientEvent("signature_resolve_failed", "warn", {
        jobId: meta?.jobId,
        message: `Could not resolve signature URL`,
        source: "storage",
        type: "upload",
        context: { originalUrl: url.slice(0, 120), orgId: meta?.orgId },
      });
    }
    return resolved ?? url;
  } catch {
    return url;
  }
}

async function buildSignatureImageCache(
  pickup: JobWithRelations["inspections"][number] | undefined,
  delivery: JobWithRelations["inspections"][number] | undefined,
  meta?: { jobId?: string; orgId?: string }
): Promise<Map<string, CachedImage | null>> {
  const imageCache = new Map<string, CachedImage | null>();

  const rawSignatureUrls = [
    pickup?.driver_signature_url,
    pickup?.customer_signature_url,
    delivery?.driver_signature_url,
    delivery?.customer_signature_url,
  ].filter(Boolean) as string[];

  // Re-sign signature URLs so they aren't expired
  const sigUrlMap = new Map<string, string>(); // original → resolved
  await Promise.allSettled(
    rawSignatureUrls.map(async (origUrl) => {
      const resolved = await resolveSignatureForPdf(origUrl, meta);
      sigUrlMap.set(origUrl, resolved);
    })
  );

  await Promise.allSettled(
    Array.from(sigUrlMap.entries()).map(async ([origUrl, resolvedUrl]) => {
      const image = await loadImage(resolvedUrl, { isSignature: true });
      imageCache.set(origUrl, image); // cache under original URL for lookup
    })
  );

  // Retry pass: a transient network blip during the burst above can silently
  // drop a signature from the POD (rendered as "Image unavailable"). One
  // short pause and one final attempt, bounded to the URLs that failed.
  const failedSigEntries = Array.from(sigUrlMap.entries()).filter(
    ([origUrl]) => !imageCache.get(origUrl)
  );

  if (failedSigEntries.length > 0) {
    debugLog("Retrying failed POD signatures", { signatures: failedSigEntries.length });
    await new Promise((r) => setTimeout(r, 800));
    await Promise.allSettled(
      failedSigEntries.map(async ([origUrl, resolvedUrl]) => {
        const image = await loadImage(resolvedUrl, { isSignature: true });
        if (image) imageCache.set(origUrl, image);
      })
    );
  }

  return imageCache;
}

/**
 * Canonicalise once: drop archived, isolate to current_run_id, dedupe by
 * strongest identity. Shared by generatePodPdf and the photos-zip builder so
 * both agree on exactly which photos count for a job. Mirrors PodReport.tsx's
 * three groups exactly — damage close-ups are a distinct type, not a
 * pickup_/delivery_ prefix, so they need their own filter or they silently
 * never appear anywhere in the document.
 */
function getCanonicalPhotoGroups(
  job: JobWithRelations
): { pickupPhotos: PhotoLike[]; deliveryPhotos: PhotoLike[]; damagePhotos: PhotoLike[] } {
  // current_run_id exists on the DB row but isn't declared on JobWithRelations
  // (pre-existing gap, also worked around the same way in PodReport.tsx).
  const currentRunId = (job as JobWithRelations & { current_run_id?: string | null }).current_run_id ?? null;
  const canonicalPhotos = canonicalisePhotos(job.photos, currentRunId);
  return {
    pickupPhotos: canonicalPhotos.filter((p) => p.type.startsWith("pickup_")),
    deliveryPhotos: canonicalPhotos.filter((p) => p.type.startsWith("delivery_")),
    damagePhotos: canonicalPhotos.filter((p) => p.type === "damage_close_up"),
  };
}

function extensionForMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("heic")) return "heic";
  return "jpg";
}

/** Fetches a photo group's original (uncompressed) bytes into a zip folder. */
async function addPhotosToZip(
  zip: JSZip,
  folderName: string,
  photos: PhotoLike[]
): Promise<number> {
  const folder = zip.folder(folderName);
  if (!folder) return 0;

  let added = 0;
  await Promise.allSettled(
    photos.map(async (photo, index) => {
      try {
        const resolvedUrl = (await resolveImageUrlAsync(photo.url)) ?? photo.url;
        const response = await fetch(resolvedUrl, { mode: "cors" });
        if (!response.ok) return;
        const blob = await response.blob();
        if (blob.size === 0) return;

        const label = clean(photo.label || PHOTO_TYPE_LABELS[photo.type] || photo.type, "photo");
        const ext = extensionForMime(blob.type);
        folder.file(`${String(index + 1).padStart(2, "0")} ${label}.${ext}`, blob);
        added += 1;
      } catch (error) {
        debugLog("Photo zip fetch failed", { url: photo.url, error });
      }
    })
  );
  return added;
}

/**
 * Zips a job's collection/delivery/damage photos at original quality (no
 * recompression — this is a "download the originals" bundle, separate from
 * the small in-PDF thumbnails). Returns null when there are no photos, or
 * every fetch failed.
 */
async function buildPhotosZipBlob(
  pickupPhotos: PhotoLike[],
  deliveryPhotos: PhotoLike[],
  damagePhotos: PhotoLike[]
): Promise<Blob | null> {
  if (pickupPhotos.length === 0 && deliveryPhotos.length === 0 && damagePhotos.length === 0) {
    return null;
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const [pickupAdded, deliveryAdded, damageAdded] = await Promise.all([
    addPhotosToZip(zip, "Collection Photos", pickupPhotos),
    addPhotosToZip(zip, "Delivery Photos", deliveryPhotos),
    addPhotosToZip(zip, "Damage Close-ups", damagePhotos),
  ]);

  if (pickupAdded + deliveryAdded + damageAdded === 0) return null;

  return zip.generateAsync({ type: "blob" });
}

/** Authoritative org — from user_profiles ONLY, never self-writable user_metadata. */
async function resolveAuthoritativeOrgId(
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("org_id")
    .eq("auth_user_id", session.user.id)
    .maybeSingle();
  return (profile as { org_id?: string | null } | null)?.org_id ?? null;
}

/**
 * Best-effort: builds the photos zip and uploads it next to the POD PDF
 * (same private, org-scoped, signed-URL pattern). Never throws — a failure
 * here should never block generating or sending the POD itself, it just
 * means the optional photos link is omitted.
 */
async function tryBuildAndUploadPhotosZip(job: JobWithRelations): Promise<string | null> {
  try {
    const { pickupPhotos, deliveryPhotos, damagePhotos } = getCanonicalPhotoGroups(job);
    const zipBlob = await buildPhotosZipBlob(pickupPhotos, deliveryPhotos, damagePhotos);
    if (!zipBlob) return null;

    const { supabase } = await import("@/integrations/supabase/client");
    const orgId = await resolveAuthoritativeOrgId(supabase);
    if (!orgId) {
      debugLog("POD photos zip: no authoritative org_id — skipping upload");
      return null;
    }

    const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
    const sanitizedReg = clean(job.vehicle_reg, "UNKNOWN").replace(/\s+/g, "");
    const path = `${orgId}/AXENTRA_POD_${ref}_${sanitizedReg}_photos.zip`;

    const { error: uploadError } = await supabase.storage
      .from("pod-photos")
      .upload(path, zipBlob, { contentType: "application/zip", upsert: true });

    if (uploadError) {
      debugLog("POD photos zip upload failed", uploadError);
      return null;
    }

    const { data: signed } = await supabase.storage
      .from("pod-photos")
      .createSignedUrl(path, 60 * 60 * 24 * 30);

    return signed?.signedUrl ?? null;
  } catch (error) {
    debugLog("POD photos zip exception", error);
    return null;
  }
}

export async function generatePodPdf(
  job: JobWithRelations,
  expenses?: PodExpense[],
  photosZipUrl?: string | null
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();

  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");

  const pickupDamages = job.damage_items.filter((d) => pickup && d.inspection_id === pickup.id);
  const deliveryDamages = job.damage_items.filter((d) => delivery && d.inspection_id === delivery.id);
  const allDamages = [...pickupDamages, ...deliveryDamages];

  const { pickupPhotos, deliveryPhotos, damagePhotos } = getCanonicalPhotoGroups(job);
  const allPhotos = [...pickupPhotos, ...deliveryPhotos, ...damagePhotos];

  const [imageCache, photoThumbCache, logo] = await Promise.all([
    buildSignatureImageCache(pickup, delivery, { jobId: job.id }),
    buildPhotoThumbnailCache(allPhotos),
    loadLogo(),
  ]);

  renderHeader(doc, job, ref, logo);
  let y = HEADER_HEIGHT + 8;

  // ── Vehicle Details — plate + status pill, then the same field order
  // as the app's Vehicle Details card. ──────────────────────────────
  const statusStyle = getStatusStyle(job.status);
  const vehicleRows: Array<[string, string]> = [
    ["Registration", clean(job.vehicle_reg)],
    ["Make / Model", joinParts([job.vehicle_make, job.vehicle_model], " ")],
    ["Colour", clean(job.vehicle_colour)],
    ...(job.vehicle_year ? [["Year", String(job.vehicle_year)] as [string, string]] : []),
    ["Job ID", `Job ${ref}`],
    ["Route", `${clean(job.pickup_city)} to ${clean(job.delivery_city)}`],
    ["Collection Status", pickup ? "Collected" : "Not collected"],
    ["Delivery Status", delivery ? "Delivered" : "Not delivered"],
    ["Assigned Driver", clean(job.resolvedDriverName ?? job.driver_name)],
  ];
  y = renderCard(doc, y, estimateDetailCardHeight(vehicleRows.length, 14), (x, cy, width) => {
    drawUkPlate(doc, x, cy, job.vehicle_reg);
    drawStatusPill(doc, x + width, cy - 1.5, statusStyle.label, statusStyle.backgroundColor);

    let ny = cy + 14;
    setTextStyle(doc, { size: 10, style: "bold", color: PDF_THEME.text });
    doc.text("Vehicle Details", x, ny);
    ny += HEADING_H;

    return renderDetailRows(doc, x, ny, width, vehicleRows);
  });

  // ── Pickup Details ────────────────────────────────────────────────
  const pickupRows: Array<[string, string]> = [
    ["Contact", joinParts([job.pickup_contact_name, job.pickup_contact_phone], " ")],
    ["Address", joinParts([job.pickup_address_line1, job.pickup_city, job.pickup_postcode])],
    ...(job.pickup_company ? [["Company", clean(job.pickup_company)] as [string, string]] : []),
    ["Date / Time", pickup ? safeDate(pickup.inspected_at) : "—"],
    ["Odometer", pickup?.odometer != null ? pickup.odometer.toLocaleString("en-GB") : "—"],
    ["Fuel", fuelLabel(pickup?.fuel_level_percent ?? null)],
    [
      "Driver",
      clean(
        pickup?.inspected_by_name && !/^\s*driver\s*$/i.test(pickup.inspected_by_name)
          ? pickup.inspected_by_name
          : job.resolvedDriverName || job.driver_name
      ),
    ],
    ["Customer", clean(pickup?.customer_name)],
    ["Damages", String(pickupDamages.length)],
    ["Photos", String(pickupPhotos.length)],
  ];
  y = renderCard(doc, y, estimateDetailCardHeight(pickupRows.length), (x, cy, width) => {
    setTextStyle(doc, { size: 10, style: "bold", color: PDF_THEME.text });
    doc.text("Pickup Details", x, cy);
    return renderDetailRows(doc, x, cy + HEADING_H, width, pickupRows);
  });

  // ── Pickup Checklist ──────────────────────────────────────────────
  if (pickup) {
    const items = getChecklistItems(pickup).map(
      (f) => [f.label, String(pickup[f.key])] as [string, string]
    );
    if (items.length || pickup.notes?.trim()) {
      y = renderCard(
        doc,
        y,
        estimateChecklistCardHeight(items.length, 3, !!pickup.notes?.trim()),
        (x, cy, width) => {
          setTextStyle(doc, { size: 10, style: "bold", color: PDF_THEME.text });
          doc.text("Pickup Checklist", x, cy);
          let ny = cy + HEADING_H;
          if (items.length) ny = renderChecklistGrid(doc, x, ny, width, items);
          if (pickup.notes?.trim()) {
            ny += 2;
            ny = addWrappedText(doc, `Notes: ${pickup.notes}`, x, ny, width, {
              fontSize: 7.5,
              fontStyle: "italic",
              textColor: PDF_THEME.muted,
              lineHeight: 3.8,
            });
          }
          return ny;
        }
      );
    }
  }

  // ── Delivery Details ──────────────────────────────────────────────
  const deliveryRows: Array<[string, string]> = [
    ["Contact", joinParts([job.delivery_contact_name, job.delivery_contact_phone], " ")],
    ["Address", joinParts([job.delivery_address_line1, job.delivery_city, job.delivery_postcode])],
    ...(job.delivery_company ? [["Company", clean(job.delivery_company)] as [string, string]] : []),
    ["Date / Time", delivery ? safeDate(delivery.inspected_at) : "—"],
    ["Odometer", delivery?.odometer != null ? delivery.odometer.toLocaleString("en-GB") : "—"],
    ["Fuel", fuelLabel(delivery?.fuel_level_percent ?? null)],
    [
      "Driver",
      clean(
        delivery?.inspected_by_name && !/^\s*driver\s*$/i.test(delivery.inspected_by_name)
          ? delivery.inspected_by_name
          : job.resolvedDriverName || job.driver_name
      ),
    ],
    ["Customer", clean(delivery?.customer_name)],
    ["Damages", String(deliveryDamages.length)],
    ["Photos", String(deliveryPhotos.length)],
  ];
  y = renderCard(doc, y, estimateDetailCardHeight(deliveryRows.length), (x, cy, width) => {
    setTextStyle(doc, { size: 10, style: "bold", color: PDF_THEME.text });
    doc.text("Delivery Details", x, cy);
    return renderDetailRows(doc, x, cy + HEADING_H, width, deliveryRows);
  });

  // ── Delivery Checklist ────────────────────────────────────────────
  if (delivery) {
    const items = getChecklistItems(delivery).map(
      (f) => [f.label, String(delivery[f.key])] as [string, string]
    );
    if (items.length || delivery.notes?.trim()) {
      y = renderCard(
        doc,
        y,
        estimateChecklistCardHeight(items.length, 3, !!delivery.notes?.trim()),
        (x, cy, width) => {
          setTextStyle(doc, { size: 10, style: "bold", color: PDF_THEME.text });
          doc.text("Delivery Checklist", x, cy);
          let ny = cy + HEADING_H;
          if (items.length) ny = renderChecklistGrid(doc, x, ny, width, items);
          if (delivery.notes?.trim()) {
            ny += 2;
            ny = addWrappedText(doc, `Notes: ${delivery.notes}`, x, ny, width, {
              fontSize: 7.5,
              fontStyle: "italic",
              textColor: PDF_THEME.muted,
              lineHeight: 3.8,
            });
          }
          return ny;
        }
      );
    }
  }

  // ── Damage Summary ────────────────────────────────────────────────
  if (allDamages.length > 0) {
    const estHeight = HEADING_H + allDamages.length * 8.5 + EST_BUFFER;
    y = renderCard(doc, y, estHeight, (x, cy, width) => {
      setTextStyle(doc, { size: 10, style: "bold", color: PDF_THEME.text });
      doc.text("Damage Summary", x, cy);
      let ny = cy + HEADING_H;

      for (const d of allDamages) {
        const left = `${clean(d.area)} – ${clean(d.item)}: ${
          d.damage_types?.length ? d.damage_types.join(", ") : "—"
        }`;
        const hasNotes = !!d.notes?.trim();
        setTextStyle(doc, { size: 8, style: "normal", color: PDF_THEME.muted });
        const leftLines: string[] = doc.splitTextToSize(left, width * (hasNotes ? 0.58 : 1));
        leftLines.forEach((line, i) => doc.text(line, x, ny + i * ROW_LINE));

        let rightLineCount = 0;
        if (hasNotes) {
          setTextStyle(doc, { size: 7.5, style: "italic", color: PDF_THEME.muted });
          const rightLines: string[] = doc.splitTextToSize(d.notes as string, width * 0.38);
          rightLines.forEach((line, i) =>
            doc.text(line, x + width, ny + i * ROW_LINE, { align: "right" })
          );
          rightLineCount = rightLines.length;
        }

        ny += Math.max(leftLines.length, rightLineCount, 1) * ROW_LINE + 1.2;
      }

      return ny;
    });
  }

  // ── Photos — real thumbnail grids, matching the app's PhotoViewer tiles
  // instead of a plain caption list. ────────────────────────────────
  y = renderPhotoSection(doc, y, "Collection Photos", pickupPhotos, photoThumbCache);
  y = renderPhotoSection(doc, y, "Delivery Photos", deliveryPhotos, photoThumbCache);
  y = renderPhotoSection(doc, y, "Damage Close-ups", damagePhotos, photoThumbCache);
  if (allPhotos.length > 0) {
    y = renderPhotosDownloadCard(doc, y, photosZipUrl ?? null);
  }

  // ── Signatures ─────────────────────────────────────────────────────
  y = renderSignaturesCard(
    doc,
    y,
    [
      {
        label: "Pickup Driver",
        name: clean(
          pickup?.inspected_by_name && !/^\s*driver\s*$/i.test(pickup.inspected_by_name)
            ? pickup.inspected_by_name
            : job.resolvedDriverName || job.driver_name
        ),
        url: pickup?.driver_signature_url,
      },
      {
        label: "Pickup Customer",
        name: clean(pickup?.customer_name),
        url: pickup?.customer_signature_url,
      },
      {
        label: "Delivery Driver",
        name: clean(
          delivery?.inspected_by_name && !/^\s*driver\s*$/i.test(delivery.inspected_by_name)
            ? delivery.inspected_by_name
            : job.resolvedDriverName || job.driver_name
        ),
        url: delivery?.driver_signature_url,
      },
      {
        label: "Delivery Customer",
        name: clean(delivery?.customer_name),
        url: delivery?.customer_signature_url,
      },
    ],
    imageCache
  );

  // ── Billable Expenses — matches the app's simple list (no amounts
  // shown), positioned after Signatures like the in-app card order. ──
  const billableExpenses = (expenses ?? []).filter((e) => e.billable_on_pod !== false);
  if (billableExpenses.length > 0) {
    const estHeight = HEADING_H + billableExpenses.length * 4.8 + EST_BUFFER;
    y = renderCard(doc, y, estHeight, (x, cy, width) => {
      setTextStyle(doc, { size: 10, style: "bold", color: PDF_THEME.text });
      doc.text("Billable Expenses", x, cy);
      setTextStyle(doc, { size: 8, style: "normal", color: PDF_THEME.text });
      doc.text(
        `${billableExpenses.length} expense${billableExpenses.length === 1 ? "" : "s"}`,
        x + width,
        cy,
        { align: "right" }
      );

      let ny = cy + HEADING_H;
      for (const e of billableExpenses) {
        const text = `${clean(e.category)}${e.label ? ` – ${e.label}` : ""}`;
        setTextStyle(doc, { size: 8, style: "normal", color: PDF_THEME.muted });
        const lines: string[] = doc.splitTextToSize(text, width);
        lines.forEach((line, i) => doc.text(line, x, ny + i * ROW_LINE));
        ny += lines.length * ROW_LINE + 0.6;
      }
      return ny;
    });
  }

  // ── Customer Declaration ──────────────────────────────────────────
  y = renderCard(doc, y, 24, (x, cy, width) => {
    setTextStyle(doc, { size: 9.5, style: "bold", color: PDF_THEME.text });
    doc.text("Customer Declaration", x, cy);
    return addWrappedText(
      doc,
      "The customer confirms that the above vehicle has been inspected at the point of delivery and any noted damage or exceptions have been recorded on this POD and accompanying imagery.",
      x,
      cy + 5,
      width,
      { fontSize: 8, textColor: PDF_THEME.text, lineHeight: 3.8 }
    );
  });

  // ── Closing note — matches the app's final "generated by" card ──────
  y = renderCard(doc, y, 24, (x, cy, width) => {
    let ny = addWrappedText(
      doc,
      "This Proof of Delivery report was generated by the Axentra Vehicle Logistics system.",
      x,
      cy,
      width,
      { fontSize: 7.5, textColor: PDF_THEME.muted, lineHeight: 3.6 }
    );
    ny += 1.5;
    ny = addWrappedText(doc, `Report reference: ${ref} • Generated: ${safeDate(new Date().toISOString())}`, x, ny, width, {
      fontSize: 7.5,
      textColor: PDF_THEME.muted,
      lineHeight: 3.6,
    });
    ny += 1.5;
    return addWrappedText(
      doc,
      "All images and data are stored securely. Unauthorised reproduction is prohibited.",
      x,
      ny,
      width,
      { fontSize: 6.5, textColor: PDF_THEME.muted, lineHeight: 3.2 }
    );
  });

  renderFooter(doc, ref);
  return doc.output("blob");
}

export async function sharePodPdf(
  job: JobWithRelations,
  expenses?: PodExpense[]
): Promise<void> {
  const photosZipUrl = await tryBuildAndUploadPhotosZip(job);
  const blob = await generatePodPdf(job, expenses, photosZipUrl);
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
  const sanitizedReg = clean(job.vehicle_reg, "UNKNOWN").replace(/\s+/g, "");
  const dateStr = job.completed_at
    ? new Date(job.completed_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const fileName = `AXENTRA_POD_${ref}_${sanitizedReg}_${dateStr}.pdf`;
  const file = new File([blob], fileName, { type: "application/pdf" });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: `AXENTRA POD – ${ref} – ${job.vehicle_reg}`,
      files: [file],
    });
    return;
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type EmailPodResult =
  | { method: "resend"; recipient: string }
  | { method: "share" }
  | { method: "mailto" };

export async function emailPodPdf(
  job: JobWithRelations,
  expenses?: PodExpense[],
  /** Admin-confirmed recipient (PodEmailConfirmDialog). Overrides the
   *  job's stored contact email — the whole point of that dialog is to
   *  catch a wrong/stale address before it's used to actually send. */
  recipientOverride?: string
): Promise<EmailPodResult> {
  const photosZipUrl = await tryBuildAndUploadPhotosZip(job);
  const blob = await generatePodPdf(job, expenses, photosZipUrl);
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
  const sanitizedReg = clean(job.vehicle_reg, "UNKNOWN").replace(/\s+/g, "");
  const dateStr = job.completed_at
    ? new Date(job.completed_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const fileName = `AXENTRA_POD_${ref}_${sanitizedReg}_${dateStr}.pdf`;
  const subject = `Axentra POD – ${ref} – ${job.vehicle_reg}`;

  let downloadLink = "";
  const recipient = recipientOverride?.trim() || job.delivery_contact_email || job.pickup_contact_email;

  try {
    const { supabase } = await import("@/integrations/supabase/client");

    // Org MUST come from user_profiles (authoritative), never user_metadata
    // (self-writable and no longer populated). If it can't be resolved we skip
    // the upload rather than write to a shared cross-tenant prefix — the email
    // still goes out, just without a download link.
    const orgId = await resolveAuthoritativeOrgId(supabase);

    if (!orgId) {
      debugLog("POD email: no authoritative org_id — skipping upload");
    } else {
      const path = `${orgId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("pod-pdfs")
        .upload(path, blob, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (!uploadError) {
        const { data: signed } = await supabase.storage
          .from("pod-pdfs")
          .createSignedUrl(path, 60 * 60 * 24 * 30);

        if (signed?.signedUrl) {
          downloadLink = signed.signedUrl;
        }
      } else {
        debugLog("Supabase upload failed", uploadError);
      }
    }

    // Prefer sending a real HTML email with a clean "Download POD" link
    // directly via the send-pod-email edge function (Resend) when we have
    // both a recipient on file and a download link. Falls through to the
    // navigator.share/mailto flow below on any failure — missing recipient,
    // RESEND_API_KEY not configured yet, network error, etc. — so the
    // feature never appears broken while that setup is pending.
    if (recipient && downloadLink) {
      try {
        const { data, error } = await supabase.functions.invoke("send-pod-email", {
          body: {
            to: recipient,
            jobId: job.id,
            jobRef: ref,
            vehicleReg: job.vehicle_reg,
            pickupCity: job.pickup_city,
            deliveryCity: job.delivery_city,
            dateStr,
            downloadUrl: downloadLink,
            photosZipUrl: photosZipUrl ?? undefined,
          },
        });
        if (!error && data?.sent) {
          return { method: "resend", recipient };
        }
        debugLog("send-pod-email did not confirm sent — falling back", error || data);
      } catch (error) {
        debugLog("send-pod-email invoke failed — falling back", error);
      }
    }
  } catch (error) {
    debugLog("Supabase upload exception", error);
  }

  const body = [
    "Dear Customer,",
    "",
    `Please find your Proof of Delivery for job ${ref} (${job.vehicle_reg}) at the link below.`,
    "",
    `Route: ${clean(job.pickup_city)} → ${clean(job.delivery_city)}`,
    `Date: ${dateStr}`,
    "",
    downloadLink ? `Download POD: ${downloadLink}` : "(PDF link unavailable - attach manually if required)",
    ...(photosZipUrl ? ["", `Download photos (optional): ${photosZipUrl}`] : []),
    "",
    "Link expires in 30 days.",
    "",
    "If you have any queries, please do not hesitate to contact us.",
    "",
    "Kind regards,",
    "Axentra Vehicle Logistics",
    "info@axentravehicles.com",
  ].join("\n");

  if (navigator.share) {
    try {
      await navigator.share({ title: subject, text: body });
      return { method: "share" };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return { method: "share" };
      debugLog("navigator.share failed", error);
    }
  }

  // Pre-fill the confirmed recipient — previously left blank, forcing the
  // admin to retype it in their mail app and reopening the exact mistake
  // this confirmation step exists to prevent.
  const mailtoTo = recipient ? encodeURIComponent(recipient) : "";
  const mailto = `mailto:${mailtoTo}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailto, "_blank");
  return { method: "mailto" };
}
