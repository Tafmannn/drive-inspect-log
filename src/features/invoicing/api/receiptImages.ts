/**
 * Receipt files for invoices: resolve a stored receipt to a fetchable URL,
 * and load it as a downscaled image the PDF generator can embed.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveMediaUrlAsync } from "@/lib/mediaResolver";
import type { CachedImage } from "@/lib/invoicePdf";
import type { ReceiptRef } from "../lib/invoiceMath";

const RECEIPT_BUCKET = "expense-receipts";
const SIGNED_URL_TTL_SECONDS = 60 * 10;

/** Longest side of an embedded receipt, px. ~150dpi at the largest slot. */
export const RECEIPT_MAX_PX = 1400;
const RECEIPT_JPEG_QUALITY = 0.72;

/**
 * A fetchable URL for a receipt.
 *
 * Receipts uploaded to Supabase storage have a 1-year signed link saved in
 * `url`, which silently stops working after a year — but invoices and their
 * receipts must stay retrievable for years. `backend_ref` is the permanent
 * object path, so sign a fresh short-lived link from it whenever we can and
 * only fall back to the stored URL for legacy rows.
 */
export async function resolveReceiptUrl(receipt: ReceiptRef): Promise<string | null> {
  if (receipt.backend === "supabase" && receipt.backend_ref) {
    try {
      const { data, error } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .createSignedUrl(receipt.backend_ref, SIGNED_URL_TTL_SECONDS);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {
      /* fall through to the stored URL */
    }
  }
  return resolveMediaUrlAsync(receipt.url);
}

/** Fetch a receipt's bytes. Returns null rather than throwing. */
export async function fetchReceiptBlob(receipt: ReceiptRef): Promise<Blob | null> {
  try {
    const url = await resolveReceiptUrl(receipt);
    if (!url) return null;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await resp.blob();
  } catch {
    return null;
  }
}

/** Target size that fits within maxPx on the longest side, never upscaling. */
export function fitWithin(w: number, h: number, maxPx: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 0, h: 0 };
  const scale = Math.min(1, maxPx / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/**
 * Load a receipt as a JPEG no larger than RECEIPT_MAX_PX on its longest side.
 * A phone photo is 3-5 MB; embedded as-is, twenty receipts make a PDF too
 * big to email. Returns null when the file is missing, unreadable, or not an
 * image (e.g. a PDF receipt) — the caller renders a placeholder instead.
 */
export async function loadReceiptImage(receipt: ReceiptRef): Promise<CachedImage | null> {
  const blob = await fetchReceiptBlob(receipt);
  if (!blob || (blob.type && !blob.type.startsWith("image/"))) return null;

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = objectUrl;
    });
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;

    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, RECEIPT_MAX_PX);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG has no alpha: paint white first so transparent PNGs don't go black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", RECEIPT_JPEG_QUALITY);
    if (!dataUrl.startsWith("data:image/jpeg")) return null;
    return { dataUrl, format: "JPEG", w, h };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
