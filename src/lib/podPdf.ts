import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { JobWithRelations } from "./types";
import { FUEL_PERCENT_TO_LABEL } from "./types";
import { CHECKLIST_FIELDS } from "./inspectionFields";
import { resolveImageUrlAsync } from "./gcsProxyUrl";
import { canonicalisePhotos } from "./photoDedupe";

const MARGIN = 20;
const HEADER_HEIGHT = 30;
const FOOTER_GAP = 8;

const PDF_THEME = {
  dark: [33, 37, 41] as [number, number, number],
  text: [80, 80, 80] as [number, number, number],
  muted: [150, 150, 150] as [number, number, number],
  lightBorder: [200, 200, 200] as [number, number, number],
  lightFill: [245, 245, 245] as [number, number, number],
  link: [59, 130, 246] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const IMAGE_LIMITS = {
  maxWidth: 1600,
  maxHeight: 1200,
  jpegQuality: 0.82,
  signatureMaxWidth: 1200,
  signatureMaxHeight: 400,
  signatureQuality: 0.92,
};

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

function lastAutoTableY(doc: jsPDF, fallback = MARGIN): number {
  const table = (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return table?.finalY ?? fallback;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const usableBottom = getFooterY(doc) - 6;
  if (y + needed > usableBottom) {
    doc.addPage();
    return MARGIN;
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

function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  y = ensureSpace(doc, y, 14);

  setTextStyle(doc, {
    size: 11,
    style: "bold",
    color: PDF_THEME.dark,
  });
  doc.text(title, MARGIN, y);

  const tw = doc.getTextWidth(title);
  doc.setDrawColor(...PDF_THEME.dark);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + 1, MARGIN + tw, y + 1);

  return y + 7;
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
  }
): number {
  const {
    fontSize = 8,
    fontStyle = "normal",
    textColor = PDF_THEME.text,
    lineHeight = 4,
  } = options ?? {};

  setTextStyle(doc, {
    size: fontSize,
    style: fontStyle,
    color: textColor,
  });

  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);

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
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
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
        maxWidth: options?.isSignature
          ? IMAGE_LIMITS.signatureMaxWidth
          : IMAGE_LIMITS.maxWidth,
        maxHeight: options?.isSignature
          ? IMAGE_LIMITS.signatureMaxHeight
          : IMAGE_LIMITS.maxHeight,
        quality: options?.isSignature
          ? IMAGE_LIMITS.signatureQuality
          : IMAGE_LIMITS.jpegQuality,
        preserveTransparency: options?.isSignature ?? false,
      });

      if (compressed) {
        debugLog("Image loaded/compressed", {
          url: candidate,
          format: compressed.format,
          width: compressed.width,
          height: compressed.height,
        });
        return compressed;
      }

      return {
        dataUrl,
        format: baseFormat,
      };
    }

    return null;
  } catch (error) {
    debugLog("Image load failed", { url, error });
    return null;
  }
}

async function loadLogo(): Promise<CachedImage | null> {
  return loadImage("/axentra-logo.png");
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

function renderHeader(
  doc: jsPDF,
  job: JobWithRelations,
  ref: string,
  logo: CachedImage | null
): void {
  const pageWidth = getPageWidth(doc);

  doc.setFillColor(...PDF_THEME.dark);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, "F");

  if (logo) {
    drawImageContain(doc, logo, MARGIN, 4, 36, 22);
  }

  setTextStyle(doc, { size: 13, style: "bold", color: PDF_THEME.white });
  doc.text("AXENTRA VEHICLE LOGISTICS", pageWidth / 2, 12, { align: "center" });

  setTextStyle(doc, { size: 10, style: "normal", color: PDF_THEME.white });
  doc.text("Proof of Delivery", pageWidth / 2, 19, { align: "center" });

  setTextStyle(doc, { size: 8, style: "normal", color: PDF_THEME.white });
  doc.text(`Job ${ref}`, pageWidth - MARGIN, 12, { align: "right" });
  doc.text(safeDate(job.completed_at || new Date().toISOString()), pageWidth - MARGIN, 18, {
    align: "right",
  });
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

function addPlainKeyValueTable(
  doc: jsPDF,
  y: number,
  rows: Array<[string, string]>
): number {
  const contentWidth = getContentWidth(doc);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 },
      overflow: "linebreak",
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 48, textColor: PDF_THEME.text },
      1: { cellWidth: contentWidth - 48 },
    },
    body: rows,
  });

  return lastAutoTableY(doc) + 8;
}

function addStripedTable(
  doc: jsPDF,
  y: number,
  head: string[][],
  body: string[][],
  columnStyles?: Record<number, unknown>
): number {
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "striped",
    styles: {
      fontSize: 8,
      cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: PDF_THEME.dark,
      textColor: PDF_THEME.white,
    },
    head,
    body,
    columnStyles,
  });

  return lastAutoTableY(doc) + 8;
}

function renderChecklistSection(
  doc: jsPDF,
  y: number,
  title: string,
  inspection: Record<string, unknown> | undefined,
  notes?: string | null
): number {
  if (!inspection) return y;

  const contentWidth = getContentWidth(doc);

  const items = CHECKLIST_FIELDS
    .filter((f) => {
      const value = inspection[f.key];
      return value != null && value !== "";
    })
    .map((f) => [f.label, String(inspection[f.key])]);

  if (!items.length && !notes?.trim()) return y;

  y = addSectionTitle(doc, title, y);

  if (items.length) {
    y = ensureSpace(doc, y, 20);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: "striped",
      styles: {
        fontSize: 8,
        cellPadding: { top: 1.5, bottom: 1.5, left: 3, right: 3 },
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: PDF_THEME.dark,
        textColor: PDF_THEME.white,
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: contentWidth - 60 },
      },
      head: [["Item", "Value"]],
      body: items,
    });

    y = lastAutoTableY(doc) + 4;
  }

  if (notes?.trim()) {
    y = ensureSpace(doc, y, 10);
    y = addWrappedText(doc, `Notes: ${notes}`, MARGIN, y, contentWidth, {
      fontSize: 8,
      fontStyle: "italic",
      textColor: [100, 100, 100],
      lineHeight: 4,
    });
    y += 4;
  }

  return y + 2;
}

function renderPlaceholderBox(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  centerText: string,
  label?: string
): void {
  doc.setDrawColor(...PDF_THEME.lightBorder);
  doc.setFillColor(...PDF_THEME.lightFill);
  doc.rect(x, y, width, height, "FD");

  setTextStyle(doc, { size: 7, style: "normal", color: [160, 160, 160] });
  doc.text(centerText, x + width / 2, y + height / 2, { align: "center" });

  if (label) {
    setTextStyle(doc, { size: 6, style: "normal", color: [100, 100, 100] });
    doc.text(label, x, y + height + 3);
  }
}

function renderPhotosGrid(
  doc: jsPDF,
  y: number,
  title: string,
  photos: PhotoLike[],
  imageCache: Map<string, CachedImage | null>
): number {
  if (!photos.length) return y;

  const contentWidth = getContentWidth(doc);
  const photoWidth = (contentWidth - 6) / 3;
  const photoHeight = photoWidth * 0.75;

  y = addSectionTitle(doc, title, y);
  y = ensureSpace(doc, y, 14);

  setTextStyle(doc, { size: 9, style: "bold", color: PDF_THEME.dark });
  doc.text(`${title} (${photos.length})`, MARGIN, y);
  y += 6;

  let col = 0;

  for (const photo of photos) {
    if (col === 0) {
      y = ensureSpace(doc, y, photoHeight + 10);
    }

    const x = MARGIN + col * (photoWidth + 3);
    const label = clean(photo.label || photo.type);
    const image = imageCache.get(photo.url) ?? null;

    if (image) {
      const ok = drawImageContain(doc, image, x, y, photoWidth, photoHeight);
      if (ok) {
        setTextStyle(doc, { size: 6, style: "normal", color: [100, 100, 100] });
        doc.text(label, x, y + photoHeight + 3);
      } else {
        renderPlaceholderBox(doc, x, y, photoWidth, photoHeight, "Photo unavailable", label);
      }
    } else {
      renderPlaceholderBox(doc, x, y, photoWidth, photoHeight, "Photo unavailable", label);
    }

    col += 1;
    if (col >= 3) {
      col = 0;
      y += photoHeight + 8;
    }
  }

  if (col > 0) y += photoHeight + 8;

  return y;
}

function renderSignatures(
  doc: jsPDF,
  y: number,
  signatures: SignatureLike[],
  imageCache: Map<string, CachedImage | null>
): number {
  const contentWidth = getContentWidth(doc);

  y = addSectionTitle(doc, "Signatures", y);
  y = ensureSpace(doc, y, 40);

  const sigWidth = (contentWidth - 9) / 4;
  const sigHeight = 18;
  const sigStartY = y;
  let sigX = MARGIN;

  for (const sig of signatures) {
    setTextStyle(doc, { size: 7, style: "bold", color: PDF_THEME.text });
    doc.text(sig.label, sigX, sigStartY);

    setTextStyle(doc, { size: 7, style: "normal", color: PDF_THEME.text });
    doc.text(clean(sig.name), sigX, sigStartY + 4);

    doc.setDrawColor(...PDF_THEME.lightBorder);
    doc.setLineWidth(0.3);
    doc.rect(sigX, sigStartY + 6, sigWidth, sigHeight);

    if (sig.url) {
      const image = imageCache.get(sig.url) ?? null;
      if (image) {
        const ok = drawImageContain(doc, image, sigX + 1, sigStartY + 7, sigWidth - 2, sigHeight - 2);
        if (!ok) {
          setTextStyle(doc, { size: 7, style: "normal", color: [180, 180, 180] });
          doc.text("Image unavailable", sigX + sigWidth / 2, sigStartY + 16, { align: "center" });
        }
      } else {
        setTextStyle(doc, { size: 7, style: "normal", color: [180, 180, 180] });
        doc.text("Image unavailable", sigX + sigWidth / 2, sigStartY + 16, { align: "center" });
      }
    } else {
      setTextStyle(doc, { size: 7, style: "normal", color: [180, 180, 180] });
      doc.text("Not signed", sigX + sigWidth / 2, sigStartY + 16, { align: "center" });
    }

    sigX += sigWidth + 3;
  }

  return sigStartY + 30;
}

/**
 * Resolve a signature URL via the simple direct helper (no edge function).
 */
async function resolveSignatureForPdf(
  url: string,
  meta?: { jobId?: string; orgId?: string }
): Promise<string> {
  try {
    const { resolveSignatureUrlSimple } = await import('./resolveSignatureUrlSimple');
    const resolved = await resolveSignatureUrlSimple(url);
    if (!resolved) {
      const { logClientEvent } = await import('./logger');
      void logClientEvent('signature_resolve_failed', 'warn', {
        jobId: meta?.jobId,
        message: `Could not resolve signature URL`,
        source: 'storage',
        type: 'upload',
        context: { originalUrl: url.slice(0, 120), orgId: meta?.orgId },
      });
    }
    return resolved ?? url;
  } catch {
    return url;
  }
}

async function buildImageCache(
  pickupPhotos: PhotoLike[],
  deliveryPhotos: PhotoLike[],
  pickup: JobWithRelations["inspections"][number] | undefined,
  delivery: JobWithRelations["inspections"][number] | undefined,
  meta?: { jobId?: string; orgId?: string }
): Promise<Map<string, CachedImage | null>> {
  const imageCache = new Map<string, CachedImage | null>();

  const photoUrls = [...pickupPhotos, ...deliveryPhotos].map((p) => p.url);
  const rawSignatureUrls = [
    pickup?.driver_signature_url,
    pickup?.customer_signature_url,
    delivery?.driver_signature_url,
    delivery?.customer_signature_url,
  ].filter(Boolean) as string[];

  const uniquePhotoUrls = [...new Set(photoUrls)];

  // Re-sign signature URLs so they aren't expired
  const sigUrlMap = new Map<string, string>(); // original → resolved
  await Promise.allSettled(
    rawSignatureUrls.map(async (origUrl) => {
      const resolved = await resolveSignatureForPdf(origUrl, meta);
      sigUrlMap.set(origUrl, resolved);
    })
  );

  await Promise.allSettled([
    ...uniquePhotoUrls.map(async (url) => {
      const image = await loadImage(url, { isSignature: false });
      imageCache.set(url, image);
    }),
    ...Array.from(sigUrlMap.entries()).map(async ([origUrl, resolvedUrl]) => {
      const image = await loadImage(resolvedUrl, { isSignature: true });
      imageCache.set(origUrl, image); // cache under original URL for lookup
    }),
  ]);

  // Retry pass: a transient network blip during the burst above can silently
  // drop photos from the POD (rendered as "Photo unavailable"). Mirror the
  // JobDetail gallery behaviour and try failed images again, with one short
  // pause and one final attempt. This is bounded to the URLs we already
  // failed, so cost is proportional to the failure rate, not the photo count.
  const failedPhotoUrls = uniquePhotoUrls.filter((u) => !imageCache.get(u));
  const failedSigEntries = Array.from(sigUrlMap.entries()).filter(
    ([origUrl]) => !imageCache.get(origUrl),
  );

  if (failedPhotoUrls.length > 0 || failedSigEntries.length > 0) {
    debugLog("Retrying failed POD images", {
      photos: failedPhotoUrls.length,
      signatures: failedSigEntries.length,
    });
    await new Promise((r) => setTimeout(r, 800));
    await Promise.allSettled([
      ...failedPhotoUrls.map(async (url) => {
        const image = await loadImage(url, { isSignature: false });
        if (image) imageCache.set(url, image);
      }),
      ...failedSigEntries.map(async ([origUrl, resolvedUrl]) => {
        const image = await loadImage(resolvedUrl, { isSignature: true });
        if (image) imageCache.set(origUrl, image);
      }),
    ]);

    // Final attempt for anything still missing — re-resolve the URL in case
    // the original signed URL has expired between attempts.
    const stillFailed = uniquePhotoUrls.filter((u) => !imageCache.get(u));
    if (stillFailed.length > 0) {
      await new Promise((r) => setTimeout(r, 1500));
      await Promise.allSettled(
        stillFailed.map(async (url) => {
          const image = await loadImage(url, { isSignature: false });
          if (image) imageCache.set(url, image);
        }),
      );
      const finalMissing = uniquePhotoUrls.filter((u) => !imageCache.get(u));
      if (finalMissing.length > 0) {
        try {
          const { logClientEvent } = await import("./logger");
          void logClientEvent("pod_pdf_photo_missing", "warn", {
            jobId: meta?.jobId,
            message: `${finalMissing.length}/${uniquePhotoUrls.length} POD photos failed to load after retries`,
            source: "storage",
            type: "upload",
            context: {
              orgId: meta?.orgId,
              missingCount: finalMissing.length,
              totalCount: uniquePhotoUrls.length,
            },
          });
        } catch {
          // best-effort logging
        }
      }
    }
  }

  return imageCache;
}

export async function generatePodPdf(
  job: JobWithRelations,
  expenses?: PodExpense[]
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const contentWidth = getContentWidth(doc);
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();

  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");

  const pickupDamages = job.damage_items.filter((d) => pickup && d.inspection_id === pickup.id);
  const deliveryDamages = job.damage_items.filter((d) => delivery && d.inspection_id === delivery.id);

  // Canonicalise once: drop archived, isolate to current_run_id, dedupe by
  // strongest identity. This stops the PDF from rendering repeated
  // "Photo unavailable" placeholders for the same physical asset and
  // prevents stale-run leakage on reopened jobs.
  const canonicalPhotos = canonicalisePhotos(
    job.photos,
    (job as any).current_run_id ?? null,
  );
  const pickupPhotos = canonicalPhotos.filter((p) => p.type.startsWith("pickup_"));
  const deliveryPhotos = canonicalPhotos.filter((p) => p.type.startsWith("delivery_"));

  const imageCache = await buildImageCache(pickupPhotos, deliveryPhotos, pickup, delivery, { jobId: job.id });
  const logo = await loadLogo();

  renderHeader(doc, job, ref, logo);

  let y = 38;

  y = addSectionTitle(doc, "Vehicle Details", y);
  y = addPlainKeyValueTable(doc, y, [
    ["Registration", clean(job.vehicle_reg)],
    ["Make / Model", joinParts([job.vehicle_make, job.vehicle_model], " ")],
    ["Colour", clean(job.vehicle_colour)],
    ...(job.vehicle_year ? [["Year", String(job.vehicle_year)] as [string, string]] : []),
    ["Job ID", `Job ${ref}`],
    ["Route", `${clean(job.pickup_city)} → ${clean(job.delivery_city)}`],
    ["Assigned Driver", clean(job.resolvedDriverName ?? job.driver_name)],
    ["Collection Status", pickup ? "✓ Collected" : "Not collected"],
    ["Delivery Status", delivery ? "✓ Delivered" : "Not delivered"],
  ]);

  const billableExpenses = (expenses ?? []).filter((e) => e.billable_on_pod !== false);
  if (billableExpenses.length > 0) {
    y = addSectionTitle(doc, `Billable Expenses (${billableExpenses.length} items)`, y);
    y = ensureSpace(doc, y, 20);
    y = addStripedTable(
      doc,
      y,
      [["Category", "Label"]],
      billableExpenses.map((e) => [clean(e.category), clean(e.label)])
    );
  }

  y = addSectionTitle(doc, "Pickup Details", y);
  y = addPlainKeyValueTable(doc, y, [
    ["Contact", joinParts([job.pickup_contact_name, job.pickup_contact_phone], " ")],
    ["Address", joinParts([job.pickup_address_line1, job.pickup_city, job.pickup_postcode])],
    ...(job.pickup_company ? [["Company", clean(job.pickup_company)] as [string, string]] : []),
    ["Date / Time", pickup ? safeDate(pickup.inspected_at) : "—"],
    ["Odometer", pickup?.odometer != null ? pickup.odometer.toLocaleString("en-GB") : "—"],
    ["Fuel", fuelLabel(pickup?.fuel_level_percent ?? null)],
    ["Driver", clean(pickup?.inspected_by_name && !/^\s*driver\s*$/i.test(pickup.inspected_by_name) ? pickup.inspected_by_name : (job.resolvedDriverName || job.driver_name))],
    ["Customer", clean(pickup?.customer_name)],
    ["Damages", String(pickupDamages.length)],
    ["Photos", String(pickupPhotos.length)],
  ]);

  y = renderChecklistSection(doc, y, "Pickup Checklist", pickup as unknown as Record<string, unknown> | undefined, pickup?.notes);

  y = addSectionTitle(doc, "Delivery Details", y);
  y = addPlainKeyValueTable(doc, y, [
    ["Contact", joinParts([job.delivery_contact_name, job.delivery_contact_phone], " ")],
    ["Address", joinParts([job.delivery_address_line1, job.delivery_city, job.delivery_postcode])],
    ...(job.delivery_company ? [["Company", clean(job.delivery_company)] as [string, string]] : []),
    ["Date / Time", delivery ? safeDate(delivery.inspected_at) : "—"],
    ["Odometer", delivery?.odometer != null ? delivery.odometer.toLocaleString("en-GB") : "—"],
    ["Fuel", fuelLabel(delivery?.fuel_level_percent ?? null)],
    ["Driver", clean(delivery?.inspected_by_name && !/^\s*driver\s*$/i.test(delivery.inspected_by_name) ? delivery.inspected_by_name : (job.resolvedDriverName || job.driver_name))],
    ["Customer", clean(delivery?.customer_name)],
    ["Damages", String(deliveryDamages.length)],
    ["Photos", String(deliveryPhotos.length)],
  ]);

  y = renderChecklistSection(doc, y, "Delivery Checklist", delivery as unknown as Record<string, unknown> | undefined, delivery?.notes);

  const allDamages = [...pickupDamages, ...deliveryDamages];
  if (allDamages.length > 0) {
    y = addSectionTitle(doc, "Damage Summary", y);
    y = ensureSpace(doc, y, 20);
    y = addStripedTable(
      doc,
      y,
      [["Area", "Item", "Type", "Notes"]],
      allDamages.map((d) => [
        clean(d.area),
        clean(d.item),
        d.damage_types?.length ? d.damage_types.join(", ") : "—",
        clean(d.notes),
      ]),
      {
        0: { cellWidth: 28 },
        1: { cellWidth: 34 },
        2: { cellWidth: 42 },
        3: { cellWidth: contentWidth - 28 - 34 - 42 },
      }
    );
  }

  const allPhotos = [...pickupPhotos, ...deliveryPhotos];
  if (allPhotos.length > 0) {
    y = addSectionTitle(doc, "Photos", y);
    y = ensureSpace(doc, y, 16);

    setTextStyle(doc, { size: 8, style: "normal", color: PDF_THEME.text });
    doc.text(
      `${pickupPhotos.length} collection photo(s) · ${deliveryPhotos.length} delivery photo(s) embedded below.`,
      MARGIN,
      y
    );
    y += 5;

    y = addWrappedText(
      doc,
      "To download individual images, view this job in the Axentra app and use the Collection / Delivery download buttons on the POD page.",
      MARGIN,
      y,
      contentWidth,
      {
        fontSize: 7.5,
        fontStyle: "normal",
        textColor: PDF_THEME.link,
        lineHeight: 4,
      }
    );
    y += 4;

    y = renderPhotosGrid(doc, y, "Collection Photos", pickupPhotos, imageCache);
    y = renderPhotosGrid(doc, y, "Delivery Photos", deliveryPhotos, imageCache);
  }

  y = renderSignatures(
    doc,
    y,
    [
      {
        label: "Pickup Driver",
        name: clean(pickup?.inspected_by_name && !/^\s*driver\s*$/i.test(pickup.inspected_by_name) ? pickup.inspected_by_name : (job.resolvedDriverName || job.driver_name)),
        url: pickup?.driver_signature_url,
      },
      {
        label: "Pickup Customer",
        name: clean(pickup?.customer_name),
        url: pickup?.customer_signature_url,
      },
      {
        label: "Delivery Driver",
        name: clean(delivery?.inspected_by_name && !/^\s*driver\s*$/i.test(delivery.inspected_by_name) ? delivery.inspected_by_name : (job.resolvedDriverName || job.driver_name)),
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

  y = ensureSpace(doc, y, 25);
  y += 4;

  setTextStyle(doc, { size: 9, style: "bold", color: PDF_THEME.dark });
  doc.text("Customer Declaration", MARGIN, y);
  y += 5;

  y = addWrappedText(
    doc,
    "The customer confirms that the above vehicle has been inspected at the point of delivery and any noted damage or exceptions have been recorded on this POD and accompanying imagery.",
    MARGIN,
    y,
    contentWidth,
    {
      fontSize: 8,
      fontStyle: "normal",
      textColor: PDF_THEME.text,
      lineHeight: 4,
    }
  );

  renderFooter(doc, ref);
  return doc.output("blob");
}

export async function sharePodPdf(
  job: JobWithRelations,
  expenses?: PodExpense[]
): Promise<void> {
  const blob = await generatePodPdf(job, expenses);
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

export async function emailPodPdf(
  job: JobWithRelations,
  expenses?: PodExpense[]
): Promise<void> {
  const blob = await generatePodPdf(job, expenses);
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
  const sanitizedReg = clean(job.vehicle_reg, "UNKNOWN").replace(/\s+/g, "");
  const dateStr = job.completed_at
    ? new Date(job.completed_at).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const fileName = `AXENTRA_POD_${ref}_${sanitizedReg}_${dateStr}.pdf`;
  const subject = `Axentra POD – ${ref} – ${job.vehicle_reg}`;

  let downloadLink = "";

  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const orgId = session?.user?.user_metadata?.org_id ?? "shared";
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
      return;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return;
      debugLog("navigator.share failed", error);
    }
  }

  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailto, "_blank");
}