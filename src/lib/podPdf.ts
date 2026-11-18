import jsPDF from "jspdf";
import type { JobWithRelations } from "./types";
import { resolveImageUrlAsync } from "./gcsProxyUrl";
import { canonicalisePhotos } from "./photoDedupe";
import { PHOTO_TYPES_BY_INSPECTION } from "@/features/inspection/inspectionFormConfig";
import {
  buildPodReportModel,
  collectionOnlyJob,
  formatPodDateTime,
  formatUkPhone,
  toCollectionModel,
} from "./podReportModel";
import { layoutPodPdf, type PdfImage, type PdfImageFormat, type PodOrgDetails } from "./podPdfLayout";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type JSZip from "jszip";

const PHOTO_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  [...PHOTO_TYPES_BY_INSPECTION.pickup, ...PHOTO_TYPES_BY_INSPECTION.delivery].map(
    (p) => [p.key, p.label]
  )
);

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

type ImageFormat = PdfImageFormat;
type CachedImage = PdfImage;

type PhotoLike = {
  url: string;
  label?: string | null;
  type: string;
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

/**
 * The Axentra lockup (mark, wordmark, tagline) as a transparent PNG made for
 * the dark navy PDF banner. Transparency is kept so it sits cleanly on the
 * banner's gradient. Null when it can't be loaded; the layout then draws a
 * text wordmark instead.
 */
async function loadLogo(): Promise<CachedImage | null> {
  try {
    const url = "/brand/axentra-logo-on-dark.png";
    const resolved = (await resolveImageUrlAsync(url)) ?? url;
    const dataUrl = await fetchImageAsDataUrl(resolved);
    if (!dataUrl) return null;
    const baseFormat = detectImageFormat(dataUrl);
    if (!baseFormat) return null;
    const kept = await compressImageDataUrl(dataUrl, {
      maxWidth: 720,
      maxHeight: 520,
      preserveTransparency: true,
    });
    return kept ?? { dataUrl, format: baseFormat };
  } catch (error) {
    debugLog("Logo load failed", error);
    return null;
  }
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

/** Contact details printed in the POD's header and footer when the org has none. */
const FALLBACK_ORG: PodOrgDetails = {
  name: "Axentra Vehicles",
  email: "info@axentravehicles.com",
  phone: "07577 791633",
  address: null,
  companyNumber: null,
  vatNumber: null,
};

/** Best-effort: the operator's name and contact details for the POD. Never throws. */
async function loadPodOrgDetails(job: JobWithRelations): Promise<PodOrgDetails> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const orgId =
      (job as JobWithRelations & { org_id?: string | null }).org_id ?? (await resolveAuthoritativeOrgId(supabase));
    if (!orgId) return FALLBACK_ORG;
    const { data } = await supabase
      .from("organisations")
      .select("name, branding_name, legal_name, main_contact_email, main_contact_phone, trading_address, registered_address, company_number, vat_number, vat_registered")
      .eq("id", orgId)
      .maybeSingle();
    if (!data) return FALLBACK_ORG;
    const t = (v: string | null | undefined) => (v ?? "").trim() || null;
    const companyNumber = t(data.company_number);
    return {
      name: t(data.branding_name) ?? t(data.name) ?? FALLBACK_ORG.name,
      email: t(data.main_contact_email) ?? FALLBACK_ORG.email,
      phone: formatUkPhone(t(data.main_contact_phone)) ?? FALLBACK_ORG.phone,
      address: t(data.trading_address) ?? t(data.registered_address),
      // "00000000" is a placeholder, not a real Companies House number.
      companyNumber: companyNumber && !/^0+$/.test(companyNumber) ? companyNumber : null,
      vatNumber: data.vat_registered ? t(data.vat_number) : null,
    };
  } catch (error) {
    debugLog("POD org details unavailable", error);
    return FALLBACK_ORG;
  }
}

export type ReportKind = "delivery" | "collection";

export async function generatePodPdf(
  fullJob: JobWithRelations,
  expenses?: PodExpense[],
  photosZipUrl?: string | null,
  /** "collection" prints a Proof of Collection: pickup data only. */
  kind: ReportKind = "delivery",
): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const job = kind === "collection" ? collectionOnlyJob(fullJob) : fullJob;

  const pickup = job.inspections.find((i) => i.type === "pickup");
  const delivery = job.inspections.find((i) => i.type === "delivery");
  const photos = getCanonicalPhotoGroups(job);
  const allPhotos = [...photos.pickupPhotos, ...photos.deliveryPhotos, ...photos.damagePhotos];

  const [signatures, thumbs, logo, org] = await Promise.all([
    buildSignatureImageCache(pickup, delivery, { jobId: job.id }),
    buildPhotoThumbnailCache(allPhotos),
    loadLogo(),
    loadPodOrgDetails(job),
  ]);

  const built = buildPodReportModel(job, photos, kind === "collection" ? [] : expenses ?? []);
  const model = kind === "collection" ? toCollectionModel(built) : built;
  layoutPodPdf(doc, model, {
    kind,
    logo,
    thumbs,
    signatures,
    photosZipUrl: photosZipUrl ?? null,
    org,
    generatedAt: formatPodDateTime(new Date().toISOString()) ?? "",
  });
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
  /**
   * The branded email was NOT sent. `message` says why, in plain words.
   * Nothing has been shared: `shareManually()` opens the device share sheet
   * (or the mail app) with a plain-text version only if the user chooses to.
   */
  | { method: "failed"; message: string; shareManually: () => Promise<void> };

export async function emailPodPdf(
  job: JobWithRelations,
  expenses?: PodExpense[],
  /** Admin-confirmed recipient (PodEmailConfirmDialog). Overrides the
   *  job's stored contact email — the whole point of that dialog is to
   *  catch a wrong/stale address before it's used to actually send. */
  recipientOverride?: string
): Promise<EmailPodResult> {
  return emailReportPdf("delivery", job, expenses, recipientOverride);
}

/**
 * Email a Proof of Collection (pickup inspection only) — sent by hand from
 * the POD page, after the admin/driver confirms the recipient.
 */
export async function emailPocPdf(job: JobWithRelations, recipientOverride?: string): Promise<EmailPodResult> {
  return emailReportPdf("collection", job, [], recipientOverride);
}

async function emailReportPdf(
  kind: ReportKind,
  job: JobWithRelations,
  expenses: PodExpense[] | undefined,
  recipientOverride: string | undefined,
): Promise<EmailPodResult> {
  const isCollection = kind === "collection";
  const docName = isCollection ? "Proof of Collection" : "Proof of Delivery";
  const short = isCollection ? "Proof of Collection" : "POD";
  // The photo ZIP covers the whole job, so it is only offered with the POD.
  const photosZipUrl = isCollection ? null : await tryBuildAndUploadPhotosZip(job);
  const blob = await generatePodPdf(job, expenses, photosZipUrl, kind);
  const ref = job.external_job_number || job.id.slice(0, 8).toUpperCase();
  const sanitizedReg = clean(job.vehicle_reg, "UNKNOWN").replace(/\s+/g, "");
  const pickupAt = job.inspections.find((i) => i.type === "pickup")?.inspected_at ?? null;
  const stamp = isCollection ? pickupAt : job.completed_at;
  const dateStr = stamp ? new Date(stamp).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  const fileName = `AXENTRA_${isCollection ? "POC" : "POD"}_${ref}_${sanitizedReg}_${dateStr}.pdf`;

  let downloadLink = "";
  let failureMessage = "The email couldn't be sent. Please try again.";
  const recipient = isCollection
    ? recipientOverride?.trim() || job.pickup_contact_email || job.delivery_contact_email
    : recipientOverride?.trim() || job.delivery_contact_email || job.pickup_contact_email;

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
    if (!recipient) {
      failureMessage = "There's no email address for this customer.";
    } else if (!downloadLink) {
      failureMessage = `The ${short} couldn't be uploaded, so there's no link to send. Check your connection and try again.`;
    } else {
      try {
        // The server builds the whole email (branding, vehicle, route,
        // delivery details) from the database; it only needs the job, the
        // recipient and the signed links.
        const { data, error } = await supabase.functions.invoke("send-pod-email", {
          body: {
            to: recipient,
            jobId: job.id,
            downloadUrl: downloadLink,
            photosZipUrl: photosZipUrl ?? undefined,
            ...(isCollection ? { kind: "collection" } : {}),
          },
        });
        if (!error && data?.sent) {
          return { method: "resend", recipient: String(data.recipient ?? recipient) };
        }
        failureMessage = await functionErrorMessage(error, data);
        debugLog("send-pod-email did not send", error || data);
      } catch (error) {
        failureMessage = "Couldn't reach the email service. Check your connection and try again.";
        debugLog("send-pod-email invoke failed", error);
      }
    }
  } catch (error) {
    failureMessage = `The ${short} couldn't be prepared for sending. Please try again.`;
    debugLog("Supabase upload exception", error);
  }

  // Plain-text version for a MANUAL share only (the user chose it after the
  // branded email failed). Kept short: the links are long.
  const routeLine = [clean(job.pickup_city, ""), clean(job.delivery_city, "")].filter(Boolean).join(" → ");
  const body = [
    `${docName} – ${job.vehicle_reg} (${ref})`,
    "",
    "Hello,",
    "",
    `Your vehicle ${job.vehicle_reg} has been ${isCollection ? "collected" : "delivered"}${routeLine ? ` (${routeLine})` : ""} on ${dateStr}.`,
    "",
    ...(downloadLink ? [`${docName} (PDF):`, downloadLink, ""] : []),
    ...(photosZipUrl ? ["Vehicle photos (ZIP):", photosZipUrl, ""] : []),
    "These links are valid for 30 days.",
    "",
    "Kind regards,",
    "Axentra Vehicle Logistics",
  ].join("\n");
  const shareSubject = `${docName} – ${job.vehicle_reg} (${ref})`;

  const shareManually = async (): Promise<void> => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareSubject, text: body });
        return;
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") return;
        debugLog("navigator.share failed", error);
      }
    }
    const mailtoTo = recipient ? encodeURIComponent(recipient) : "";
    window.open(
      `mailto:${mailtoTo}?subject=${encodeURIComponent(shareSubject)}&body=${encodeURIComponent(body)}`,
      "_blank",
    );
  };

  return { method: "failed", message: failureMessage, shareManually };
}

/** The friendly message an edge function returned, or a sensible default. */
async function functionErrorMessage(error: unknown, data: unknown): Promise<string> {
  const fromBody = (b: unknown) =>
    b && typeof b === "object" && typeof (b as { message?: unknown }).message === "string"
      ? ((b as { message: string }).message)
      : null;
  const direct = fromBody(data);
  if (direct) return direct;
  try {
    const ctx = (error as { context?: Response } | null)?.context;
    if (ctx && typeof ctx.json === "function") {
      const parsed = await ctx.json();
      const msg = fromBody(parsed);
      if (msg) return msg;
    }
  } catch {
    /* fall through */
  }
  return "The email couldn't be sent. Please try again.";
}
