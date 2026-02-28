/**
 * Rewrites direct GCS URLs to go through the gcs-proxy edge function,
 * which authenticates via the service account. This is required because
 * the axentra_db bucket uses Uniform bucket-level access (no public reads).
 *
 * Supabase internal storage URLs are returned as-is (already public).
 */

const GCS_PUBLIC_PREFIX = 'https://storage.googleapis.com/axentra_db/';
const SUPABASE_FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcs-proxy`;

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Direct GCS URL → proxy through edge function
  if (url.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = url.slice(GCS_PUBLIC_PREFIX.length);
    return `${SUPABASE_FUNCTIONS_BASE}?path=${encodeURIComponent(objectPath)}`;
  }

  // Everything else (Supabase public URLs, data URIs, etc.) — pass through
  return url;
}
