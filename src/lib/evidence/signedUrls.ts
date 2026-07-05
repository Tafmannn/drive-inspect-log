/**
 * Evidence signed-URL resolver (read path).
 *
 * Produces a short-lived, browser-usable URL for a unified EvidenceView,
 * whatever its source:
 *   • "evidence" → sign the private object via the existing Supabase client
 *     (RLS on the bucket still gates access; this adds no new privilege).
 *   • "legacy"   → delegate to the existing media resolver so old URL formats
 *     (GCS proxy, private vehicle-photos, supabase-sig://) keep working exactly
 *     as they do today. We do NOT re-implement or weaken that logic.
 *
 * Thumbnail-first by default so an Admin/POD grid never pulls full-size images
 * until one is opened. Returns null on failure — a single bad URL must never
 * break the whole view.
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveMediaUrlAsync } from "@/lib/mediaResolver";
import type { EvidenceView } from "./types";

const SIGNED_TTL_SECONDS = 3600;

async function signPath(bucket: string, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Resolve a full-size viewing URL for one item. */
export async function resolveEvidenceUrl(view: EvidenceView): Promise<string | null> {
  if (view.source === "legacy") {
    return view.legacyUrl ? resolveMediaUrlAsync(view.legacyUrl) : null;
  }
  if (view.storageBucket && view.storagePath) {
    return signPath(view.storageBucket, view.storagePath);
  }
  return null;
}

/** Resolve a thumbnail URL, falling back to the full image when no thumb exists. */
export async function resolveEvidenceThumbnailUrl(view: EvidenceView): Promise<string | null> {
  if (view.source === "evidence" && view.storageBucket && view.thumbnailPath) {
    const thumb = await signPath(view.storageBucket, view.thumbnailPath);
    if (thumb) return thumb;
  }
  return resolveEvidenceUrl(view);
}
