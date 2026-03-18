/**
 * Simple signature URL resolver.
 * Tries Supabase signed URL first; falls back to GCS proxy for
 * files uploaded via gcsStorageService.
 *
 * No edge function dependency. Single active resolution path.
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

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return data.session.access_token;

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed.session?.access_token ?? null;
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

  console.info('[SigSimple] resolving', { path: path.slice(0, 120) });

  // 1) Try Supabase storage signed URL
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

  // 2) GCS proxy fallback — file was uploaded via gcsStorageService
  try {
    const token = await getToken();
    if (!token) {
      console.error('[SigSimple] no auth token for GCS proxy');
      return null;
    }

    const proxyUrl = `${GCS_PROXY}?path=${encodeURIComponent(path)}`;
    const res = await fetch(proxyUrl, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'manual',
    });

    if (res.status === 302 || res.status === 301) {
      const location = res.headers.get('Location');
      if (location) {
        console.info('[SigSimple] GCS proxy redirect OK', { path: path.slice(0, 80) });
        return location;
      }
    }

    if (res.ok) {
      const url = `${proxyUrl}&token=${encodeURIComponent(token)}`;
      console.info('[SigSimple] GCS proxy direct OK', { path: path.slice(0, 80) });
      return url;
    }

    console.error('[SigSimple] GCS proxy failed', { status: res.status, path: path.slice(0, 80) });
    return null;
  } catch (err) {
    console.error('[SigSimple] GCS proxy threw', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
