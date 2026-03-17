/**
 * Resolves image URLs through the gcs-proxy edge function which returns
 * a 302 redirect to a short-lived GCS signed URL.
 *
 * Handles three URL patterns:
 * 1. Legacy full GCS URLs (https://storage.googleapis.com/axentra_db/...)
 * 2. Bare GCS object paths (jobs/xxx/photo.jpg) — from new uploads
 * 3. Other URLs (Supabase, data URIs, http) — pass through unchanged
 *
 * Auth is provided via a `?token=` query param so that <img> tags
 * (which can't set custom headers) can authenticate with the proxy.
 */

import { supabase } from '@/integrations/supabase/client';

const GCS_PUBLIC_PREFIX = 'https://storage.googleapis.com/axentra_db/';
const SUPABASE_FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcs-proxy`;

// ─── Session token cache ─────────────────────────────────────────────
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getSessionToken(): Promise<string | null> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiresAt) return _cachedToken;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      _cachedToken = session.access_token;
      // Refresh 60s before actual expiry
      _tokenExpiresAt = (session.expires_at ?? 0) * 1000 - 60_000;
      return _cachedToken;
    }
  } catch { /* no session */ }
  return null;
}

// Synchronous access to cached token (may be stale, but best-effort for img tags)
function getCachedToken(): string | null {
  if (_cachedToken && Date.now() < _tokenExpiresAt) return _cachedToken;
  return null;
}

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

function buildProxyUrl(objectPath: string, token: string | null): string {
  const base = `${SUPABASE_FUNCTIONS_BASE}?path=${encodeURIComponent(objectPath)}`;
  return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}

/**
 * Synchronous URL resolver for use in JSX (img src, etc.)
 * Uses cached session token. Call preloadAuthToken() on mount.
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  const token = getCachedToken();

  // Legacy full GCS URL → proxy
  if (url.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = url.slice(GCS_PUBLIC_PREFIX.length);
    return buildProxyUrl(objectPath, token);
  }

  // Bare object path from new uploads → proxy
  if (isBareObjectPath(url)) {
    return buildProxyUrl(url, token);
  }

  // Everything else (Supabase public URLs, data URIs, etc.) — pass through
  return url;
}

/**
 * Async URL resolver — fetches fresh token if cached one is stale.
 * Use in PDF generation and other async contexts.
 */
export async function resolveImageUrlAsync(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;

  const token = await getSessionToken();

  if (url.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = url.slice(GCS_PUBLIC_PREFIX.length);
    return buildProxyUrl(objectPath, token);
  }

  if (isBareObjectPath(url)) {
    return buildProxyUrl(url, token);
  }

  return url;
}

/**
 * Pre-load and cache the session token so that subsequent
 * synchronous resolveImageUrl calls can include it.
 * Call this on component mount before rendering images.
 */
export async function preloadAuthToken(): Promise<void> {
  await getSessionToken();
}
