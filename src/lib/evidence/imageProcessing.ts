/**
 * Evidence image processing — compress, thumbnail, hash, measure.
 *
 * Deterministic and defensive. Reuses the hard-won lessons from the existing
 * upload pipeline:
 *   • canvas.toBlob can return a non-null 0-byte Blob under iOS memory pressure
 *     → treat as failure, retry, then fall back to the original bytes.
 *   • Persisted bytes are ArrayBuffers, never Blobs (WebKit IDB reclaim bug).
 *
 * Pure with respect to app state; only touches the DOM canvas + WebCrypto.
 */

import { EVIDENCE_BUDGETS, type ProcessedImage } from "./types";

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Decoded {
  width: number;
  height: number;
  draw: (canvas: HTMLCanvasElement, w: number, h: number) => boolean;
}

/** Decode a File into an image we can redraw. Returns null on decode failure. */
function decode(file: File): Promise<Decoded | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (canvas, w, h) => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return false;
          ctx.drawImage(img, 0, 0, w, h);
          return true;
        },
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function scaleToBox(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(maxEdge / w, maxEdge / h, 1);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** One canvas→JPEG attempt. Resolves null on any failure OR a 0-byte result. */
function encodeOnce(decoded: Decoded, maxEdge: number, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      const { w, h } = scaleToBox(decoded.width, decoded.height, maxEdge);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      if (!decoded.draw(canvas, w, h)) return resolve(null);
      canvas.toBlob(
        (blob) => resolve(blob && blob.size > 0 ? blob : null),
        "image/jpeg",
        quality,
      );
    } catch {
      resolve(null);
    }
  });
}

async function encodeWithRetry(
  decoded: Decoded,
  maxEdge: number,
  quality: number,
): Promise<Blob | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const blob = await encodeOnce(decoded, maxEdge, quality);
    if (blob) return blob;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
  }
  return null;
}

/**
 * Process a captured File into upload-ready evidence bytes + thumbnail + hash.
 *
 * Guarantees:
 *   • Never returns 0-byte `bytes`. If compression cannot produce real bytes it
 *     falls back to the original file's bytes (which we know are non-empty).
 *   • `thumbBytes` is best-effort; null on failure never blocks the full image.
 *   • `hash` is the sha-256 of the returned `bytes` (integrity + dedupe key).
 *
 * Throws only if the input file itself is empty (0 bytes) — nothing to store.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  if (!file || file.size === 0) {
    throw new Error("processImage: input file is empty (0 bytes)");
  }

  const decoded = await decode(file);

  // Full image: compress, else fall back to the original bytes.
  let bytes: ArrayBuffer;
  let mimeType = "image/jpeg";
  let width: number | null = decoded?.width ?? null;
  let height: number | null = decoded?.height ?? null;

  if (decoded) {
    const compressed = await encodeWithRetry(
      decoded,
      EVIDENCE_BUDGETS.MAX_IMAGE_DIMENSION,
      EVIDENCE_BUDGETS.JPEG_QUALITY,
    );
    if (compressed) {
      bytes = await compressed.arrayBuffer();
      const box = scaleToBox(decoded.width, decoded.height, EVIDENCE_BUDGETS.MAX_IMAGE_DIMENSION);
      width = box.w;
      height = box.h;
    } else {
      bytes = await file.arrayBuffer();
      mimeType = file.type || "image/jpeg";
    }
  } else {
    // Undecodable (or non-image) — keep the raw bytes verbatim; never lose evidence.
    bytes = await file.arrayBuffer();
    mimeType = file.type || "application/octet-stream";
  }

  if (bytes.byteLength === 0) {
    // Fallback also empty → the source was neutered. Surface, do not persist junk.
    throw new Error("processImage: produced 0 bytes (source likely neutered)");
  }

  // Thumbnail: best-effort only.
  let thumbBytes: ArrayBuffer | null = null;
  if (decoded) {
    const thumb = await encodeWithRetry(
      decoded,
      EVIDENCE_BUDGETS.THUMBNAIL_DIMENSION,
      EVIDENCE_BUDGETS.THUMBNAIL_QUALITY,
    );
    if (thumb) thumbBytes = await thumb.arrayBuffer();
  }

  const hash = await sha256Hex(bytes);

  return {
    bytes,
    thumbBytes,
    mimeType,
    fileSize: bytes.byteLength,
    width,
    height,
    hash,
  };
}
