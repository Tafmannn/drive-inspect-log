/**
 * Read-path resolver for photos stored in the PRIVATE `vehicle-photos`
 * Supabase bucket (the "internal" storage backend + legacy objects).
 *
 * Historically these were served via permanent `/object/public/vehicle-photos/`
 * URLs. The bucket is now private (org-scoped RLS on storage.objects), so those
 * public URLs no longer resolve. We re-sign them at read time with a short-lived
 * signed URL. `createSignedUrl` runs under the caller's own client, so the
 * org-scoped SELECT policy gates it: a cross-org caller gets an RLS error and we
 * return null (no leak), while a same-org member (or super-admin) gets a URL.
 *
 * GCS-backed photos are NOT handled here — they are bare paths / GCS URLs routed
 * through the gcs-proxy edge function elsewhere.
 */
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "vehicle-photos";
const SIGNED_URL_TTL_SECONDS = 3600;

/** True for any Supabase storage URL that points at the vehicle-photos bucket. */
export function isVehiclePhotoRef(raw: string): boolean {
  return raw.includes("/vehicle-photos/");
}

/**
 * Extract the storage object path from a Supabase vehicle-photos URL, covering
 * both the legacy `/object/public/` and any `/object/sign/` form.
 */
export function extractVehiclePhotoPath(raw: string): string | null {
  const pub = raw.match(/\/object\/public\/vehicle-photos\/(.+?)(?:\?|$)/);
  if (pub) return decodeURIComponent(pub[1]);
  const signed = raw.match(/\/object\/sign\/vehicle-photos\/(.+?)\?/);
  if (signed) return decodeURIComponent(signed[1]);
  return null;
}

/**
 * Resolve a Supabase vehicle-photos reference to a short-lived signed URL.
 * Returns null when the ref isn't a vehicle-photos URL, or when RLS/signing
 * fails (e.g. cross-org access is denied) — callers render "unavailable".
 */
export async function resolveVehiclePhotoUrl(
  raw: string | null | undefined,
): Promise<string | null> {
  if (!raw || typeof raw !== "string") return null;
  const path = extractVehiclePhotoPath(raw);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
