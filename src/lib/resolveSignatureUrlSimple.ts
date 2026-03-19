/**
 * Simple signature URL resolver.
 * GCS bare paths (jobs/.../signatures/...) go directly to tokenized proxy URL.
 * Supabase-sig:// references try Supabase signed URL first, then GCS proxy fallback.
 *
 * No edge function dependency for resolution. Returns a URL the browser
 * can use directly (no redirect: manual fetch).
 */
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'vehicle-signatures';
const GCS_PROXY = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcs-proxy`;

/**
 * Extract the storage path from various signature reference formats:
 * - bare path: jobs/.../signatures/...
 * - supabase-sig://vehicle-signatures/...
 * - legacy Supabase URL containing /vehicle-signatures/
 */
function extractPath(raw: string): string | null {
  const trimmed = raw.trim();

  // supabase-sig://vehicle-signatures/path
  const sigMatch = trimmed.match(/^supabase-sig:\/\/[^/]+\/(.+)$/);
  if (sigMatch) return sigMatch[1];

  // Legacy Supabase public/signed URL
  const publicMatch = trimmed.match(/\/object\/public\/vehicle-signatures\/(.+?)(?:\?|$)/);
  if (publicMatch) return decodeURIComponent(publicMatch[1]);

  const signedMatch = trimmed.match(/\/object\/sign\/vehicle-signatures\/(.+?)\?/);
  if (signedMatch) return decodeURIComponent(signedMatch[1]);

  // Bare path: jobs/<id>/signatures/...
  if (/^jobs\/[^/]+\/signatures\//.test(trimmed)) return trimmed;

  return null;
}

/**
 * Detect if this is a bare GCS path (not a supabase-sig:// or legacy URL).
 * These should skip Supabase storage entirely and go straight to GCS proxy.
 */
function isBarePath(raw: string): boolean {
  const trimmed = raw.trim();
  return /^jobs\/[^/]+\/signatures\//.test(trimmed);
}

async function getToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;

    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? null;
  } catch {
    return null;
  }
}

function buildProxyUrl(path: string, token: string): string {
  return `${GCS_PROXY}?path=${encodeURIComponent(path)}&token=${encodeURIComponent(token)}`;
}

export async function resolveSignatureUrlSimple(
  raw: string | null | undefined
): Promise<string | null> {
  if (!raw || typeof raw !== 'string') return null;

  const path = extractPath(raw);
  if (!path) {
    console.warn('[SigSimple] unrecognized format', { raw: raw.slice(0, 120) });
    return null;
  }

  // ─── FAST PATH: bare GCS paths skip Supabase entirely ───
  if (isBarePath(raw.trim())) {
    try {
      const token = await getToken();
      if (!token) {
        console.error('[SigSimple] no auth token for GCS proxy');
        return null;
      }
      const url = buildProxyUrl(path, token);
      console.info('[SigSimple] GCS direct proxy URL', { path: path.slice(0, 80) });
      return url;
    } catch (err) {
      console.error('[SigSimple] GCS proxy URL build failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  // ─── LEGACY PATH: supabase-sig:// or Supabase URLs — try Supabase first ───
  console.info('[SigSimple] resolving via Supabase', { path: path.slice(0, 120) });

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);

    if (!error && data?.signedUrl) {
      console.info('[SigSimple] Supabase signed URL OK', { path: path.slice(0, 80) });
      return data.signedUrl;
    }

    console.info('[SigSimple] Supabase sign failed, trying GCS proxy', {
      path: path.slice(0, 80),
      error: error?.message,
    });
  } catch (err) {
    console.warn('[SigSimple] Supabase sign threw', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback to GCS proxy
  try {
    const token = await getToken();
    if (!token) {
      console.error('[SigSimple] no auth token for GCS proxy fallback');
      return null;
    }
    const url = buildProxyUrl(path, token);
    console.info('[SigSimple] GCS proxy fallback URL built', { path: path.slice(0, 80) });
    return url;
  } catch (err) {
    console.error('[SigSimple] GCS proxy fallback threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
