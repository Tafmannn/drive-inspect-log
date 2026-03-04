/**
 * Rewrites direct GCS URLs to go through the gcs-proxy edge function,
 * which authenticates via the service account. This is required because
 * the axentra_db bucket uses Uniform bucket-level access (no public reads).
 *
 * Supabase internal storage URLs are returned as-is (already public).
 *
 * The current Supabase session JWT is appended as a query param so that
 * <img src="…"> tags (which cannot send Authorization headers) still
 * authenticate successfully with the proxy.
 */

import { supabase } from '@/integrations/supabase/client';

const GCS_PUBLIC_PREFIX = 'https://storage.googleapis.com/axentra_db/';
const SUPABASE_FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcs-proxy`;

// Cache the token so we don't call getSession() on every single image
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getSessionToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session?.access_token) return null;

  cachedToken = session.access_token;
  // Refresh 60s before expiry
  tokenExpiresAt = (session.expires_at ?? 0) * 1000 - 60_000;
  return cachedToken;
}

// Synchronous version using last-known token (best-effort for JSX rendering)
function getLastKnownToken(): string | null {
  return cachedToken;
}

/**
 * Synchronous URL resolver for use in JSX (img src, etc.)
 * Uses the last-known cached token. Call `preloadAuthToken()` once
 * on mount to ensure the cache is warm.
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  // Direct GCS URL → proxy through edge function with token
  if (url.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = url.slice(GCS_PUBLIC_PREFIX.length);
    const token = getLastKnownToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${SUPABASE_FUNCTIONS_BASE}?path=${encodeURIComponent(objectPath)}${tokenParam}`;
  }

  // Everything else (Supabase public URLs, data URIs, etc.) — pass through
  return url;
}

/**
 * Async URL resolver — guarantees fresh token. Use in non-JSX contexts
 * like PDF generation where you can await.
 */
export async function resolveImageUrlAsync(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;

  if (url.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = url.slice(GCS_PUBLIC_PREFIX.length);
    const token = await getSessionToken();
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
    return `${SUPABASE_FUNCTIONS_BASE}?path=${encodeURIComponent(objectPath)}${tokenParam}`;
  }

  return url;
}

/**
 * Call once on component mount to warm the token cache so that
 * synchronous resolveImageUrl() calls have a token available.
 */
export async function preloadAuthToken(): Promise<void> {
  await getSessionToken();
}
