/**
 * Resolves image URLs through the gcs-proxy edge function which returns
 * a 302 redirect to a short-lived GCS signed URL.
 *
 * Handles three URL patterns:
 * 1. Legacy full GCS URLs (https://storage.googleapis.com/axentra_db/...)
 * 2. Bare GCS object paths (jobs/xxx/photo.jpg) — from new uploads
 * 3. Other URLs (Supabase, data URIs, http) — pass through unchanged
 *
 * No JWT tokens are placed in URLs. The proxy authenticates via the
 * Authorization header (called from supabase.functions.invoke or fetch).
 * For <img> tags, the proxy URL itself is used and the browser follows
 * the 302 redirect to the signed URL.
 */

const GCS_PUBLIC_PREFIX = 'https://storage.googleapis.com/axentra_db/';
const SUPABASE_FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcs-proxy`;

/**
 * Determine if a string looks like a bare GCS object path
 * (not a full URL, not a data URI, not empty).
 */
function isBareObjectPath(url: string): boolean {
  return (
    !url.startsWith('http://') &&
    !url.startsWith('https://') &&
    !url.startsWith('data:') &&
    !url.startsWith('blob:') &&
    !url.startsWith('supabase-sig://') &&
    url.length > 0
  );
}

/**
 * Synchronous URL resolver for use in JSX (img src, etc.)
 * The proxy returns a 302 redirect to a signed URL, so <img> tags
 * follow the redirect automatically.
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Legacy full GCS URL → proxy
  if (url.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = url.slice(GCS_PUBLIC_PREFIX.length);
    return `${SUPABASE_FUNCTIONS_BASE}?path=${encodeURIComponent(objectPath)}`;
  }

  // Bare object path from new uploads → proxy
  if (isBareObjectPath(url)) {
    return `${SUPABASE_FUNCTIONS_BASE}?path=${encodeURIComponent(url)}`;
  }

  // Everything else (Supabase public URLs, data URIs, etc.) — pass through
  return url;
}

/**
 * Async URL resolver — identical logic but available for contexts
 * that need an async interface (e.g., PDF generation).
 */
export async function resolveImageUrlAsync(url: string | null | undefined): Promise<string | null> {
  return resolveImageUrl(url);
}

/**
 * No-op kept for backward compatibility — token caching is no longer needed
 * since JWTs are no longer placed in URLs.
 */
export async function preloadAuthToken(): Promise<void> {
  // Intentionally empty — auth is handled by Authorization header on fetch,
  // and <img> tags use the proxy redirect (no token needed in URL).
}
