/**
 * Prepare a photo straight from the camera for use in the inspection flow.
 *
 * Why: phone cameras hand back very large images (an S23 Ultra in night or
 * high-detail mode easily produces 12–50 MP). The inspection screen used to
 * keep every captured photo at full resolution in memory — the File bytes
 * plus a full-size decoded preview — until submit. By the 6th photo
 * (dashboard) Android could run out of memory while its camera app was open
 * and close the page, so the driver landed back on the home screen.
 *
 * What: copy the bytes off the OS-backed File at once (mobile browsers can
 * neuter a captured File after backgrounding), then downscale to the same
 * maximum dimension the upload pipeline already uses
 * (MAX_PHOTO_DIMENSION in pendingUploads.ts), at a higher JPEG quality so the
 * upload-time re-encode leaves the uploaded evidence effectively unchanged.
 * If anything fails, the full-size detached copy is returned instead — a
 * photo is never lost to this step.
 */

/** Must match MAX_PHOTO_DIMENSION in pendingUploads.ts (upload size). */
export const CAPTURE_MAX_DIMENSION = 1920;
/** Higher than the upload's 0.75 so the second encode adds no visible loss. */
export const CAPTURE_JPEG_QUALITY = 0.9;
/** Small, already-in-range photos are kept as they are. */
const KEEP_AS_IS_BYTES = 1_500_000;

/** Size that fits within max×max, keeping aspect ratio; never upscales. */
export function fitWithin(width: number, height: number, max = CAPTURE_MAX_DIMENSION): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(max / width, max / height, 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function jpegName(name: string | undefined): string {
  const base = (name || "photo").replace(/\.[^./\\]+$/, "");
  return `${base || "photo"}.jpg`;
}

function decode(blob: Blob): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function downscale(source: File): Promise<File | null> {
  const img = await decode(source);
  if (!img) return null;
  const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height);
  if (!width || !height) return null;

  const alreadySmall =
    width === (img.naturalWidth || img.width) &&
    height === (img.naturalHeight || img.height) &&
    source.size <= KEEP_AS_IS_BYTES;
  if (alreadySmall) {
    img.src = "";
    return source;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", CAPTURE_JPEG_QUALITY),
    );
    // Some mobile browsers return a non-null 0-byte Blob under memory
    // pressure; treat that as failure.
    if (!blob || blob.size === 0) return null;
    return new File([blob], jpegName(source.name), { type: "image/jpeg", lastModified: source.lastModified });
  } finally {
    // Release the large decoded image and canvas backing store promptly.
    canvas.width = 0;
    canvas.height = 0;
    img.src = "";
  }
}

/**
 * Detach and downscale a freshly captured photo. Never throws for a
 * readable photo: falls back to the full-size detached copy.
 */
export async function prepareCapturedPhoto(file: File): Promise<File> {
  const buf = await file.arrayBuffer();
  const detached = new File([buf], file.name || "photo.jpg", {
    type: file.type || "image/jpeg",
    lastModified: file.lastModified,
  });
  try {
    return (await downscale(detached)) ?? detached;
  } catch {
    return detached;
  }
}
