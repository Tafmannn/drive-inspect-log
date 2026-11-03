// Pure, dependency-free rules for which evidence objects a client-portal
// user may be handed a signed URL for. Kept free of Deno/Supabase imports so
// it can be unit-tested under vitest (src/test/portal-evidence.test.ts).
//
// Every rule fails closed: anything that is not provably a delivery-evidence
// object stored under THIS job's own folder returns null and is never signed.

export const PHOTO_BUCKET = "vehicle-photos";
export const SIGNATURE_BUCKET = "vehicle-signatures";

/** True only for a storage path that lives under `jobs/<jobId>/` and can't traverse out of it. */
export function isPathUnderJob(path: string, jobId: string): boolean {
  if (!path || !jobId) return false;
  if (path.includes("..") || path.includes("\\") || path.startsWith("/")) return false;
  return path.startsWith(`jobs/${jobId}/`);
}

// Inspection evidence only. `photos` also holds driver expense receipts
// (type "receipt") and may gain other internal types later — a whitelist, not
// a blacklist, keeps those out by default.
const VISIBLE_PREFIXES = ["pickup_", "delivery_", "damage"];

export function isClientVisiblePhotoType(type: string | null | undefined): boolean {
  if (!type) return false;
  const t = type.toLowerCase();
  return VISIBLE_PREFIXES.some((p) => t.startsWith(p));
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

function extractFromSupabaseUrl(raw: string, bucket: string): string | null {
  const pub = raw.match(new RegExp(`/object/public/${bucket}/(.+?)(?:\\?|$)`));
  if (pub) return safeDecode(pub[1]);
  const signed = raw.match(new RegExp(`/object/sign/${bucket}/(.+?)\\?`));
  if (signed) return safeDecode(signed[1]);
  return null;
}

/**
 * Storage path (in the vehicle-photos bucket) for a photo row, or null if it
 * isn't an internally-stored photo under this job. GCS-backed legacy photos
 * return null — they aren't served to the portal.
 */
export function photoStoragePath(
  photo: { backend?: string | null; backend_ref?: string | null; url?: string | null },
  jobId: string,
): string | null {
  if ((photo.backend ?? "internal") !== "internal") return null;
  const candidate =
    (photo.backend_ref && !/^https?:/i.test(photo.backend_ref) ? photo.backend_ref : null) ??
    (photo.url ? extractFromSupabaseUrl(photo.url, PHOTO_BUCKET) : null);
  if (!candidate) return null;
  return isPathUnderJob(candidate, jobId) ? candidate : null;
}

/**
 * Storage path (in the vehicle-signatures bucket) for a stored signature
 * reference, or null. Handles the three Supabase forms in use:
 * `supabase-sig://vehicle-signatures/<path>`, a legacy public/signed
 * Supabase URL, and a bare `jobs/...` path. GCS URLs return null.
 */
export function signatureStoragePath(raw: string | null | undefined, jobId: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  let path: string | null = null;

  const sig = trimmed.match(/^supabase-sig:\/\/([^/]+)\/(.+)$/);
  if (sig) {
    path = sig[1] === SIGNATURE_BUCKET ? sig[2] : null;
  } else if (/^https?:\/\//i.test(trimmed)) {
    path = extractFromSupabaseUrl(trimmed, SIGNATURE_BUCKET);
  } else if (!trimmed.startsWith("data:") && !trimmed.startsWith("blob:")) {
    path = trimmed;
  }

  if (!path) return null;
  return isPathUnderJob(path, jobId) ? path : null;
}
