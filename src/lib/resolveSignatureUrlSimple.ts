/**
 * Simple signature URL resolver.
 * Tries Supabase signed URL first; falls back to fetching from GCS proxy
 * and returning a browser-safe blob URL for rendering in <img>.
 *
 * This avoids handing the browser unstable proxy/redirect URLs.
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

  // Legacy Supabase public URL
  const publicMatch = trimmed.match(
    /\/object\/public\/vehicle-signatures\/(.+?)(?:\?|$)/
  );
  if (publicMatch) return decodeURIComponent(publicMatch[1]);

  // Legacy Supabase signed URL
  const signedMatch = trimmed.match(
    /\/object\/sign\/vehicle-signatures\/(.+?)(?:\?|$)/
  );
  if (signedMatch) return decodeURIComponent(signedMatch[1]);

  // Bare path: jobs/<id>/signatures/...
  if (/^jobs\/[^/]+\/signatures\//.test(trimmed)) return trimmed;

  return null;
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) return data.session.access_token;

  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (error) {
    console.error('[SigSimple] token refresh failed', error.message);
    return null;
  }

  return refreshed.session?.access_token ?? null;
}

async function fetchGcsAsBlobUrl(path: string): Promise<string | null> {
  const token = await getToken();
  if (!token) {
    console.error('[SigSimple] no auth token for GCS proxy');
    return null;
  }

  const proxyUrl = `${GCS_PROXY}?path=${encodeURIComponent(path)}`;

  try {
    const res = await fetch(proxyUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error('[SigSimple] GCS proxy fetch failed', {
        status: res.status,
        path: path.slice(0, 120),
      });
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('image')) {
      console.error('[SigSimple] GCS proxy returned non-image content', {
        contentType,
        path: path.slice(0, 120),
      });
      return null;
    }

    const blob = await res.blob();
    if (!blob.size) {
      console.error('[SigSimple] GCS blob empty', {
        path: path.slice(0, 120),
      });
      return null;
    }

    const blobUrl = URL.createObjectURL(blob);
    console.info('[SigSimple] GCS blob URL OK', {
      path: path.slice(0, 120),
      size: blob.size,
      type: blob.type,
    });

    return blobUrl;
  } catch (err) {
    console.error('[SigSimple] GCS proxy threw', {
      error: err instanceof Error ? err.message : String(err),
      path: path.slice(0, 120),
    });
    return null;
  }
}

export async function resolveSignatureUrlSimple(
  raw: string | null | undefined
): Promise<string | null> {
  if (!raw || typeof raw !== 'string') return null;

  const path = extractPath(raw);
  if (!path) {
    console.warn('[SigSimple] unrecognized format', {
      raw: raw.slice(0, 120),
    });
    return null;
  }

  console.info('[SigSimple] resolving', { path: path.slice(0, 120) });

  // 1) Try Supabase storage signed URL
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600);

    if (!error && data?.signedUrl) {
      console.info('[SigSimple] Supabase signed URL OK', {
        path: path.slice(0, 120),
      });
      return data.signedUrl;
    }

    console.info('[SigSimple] Supabase sign failed, trying GCS blob fallback', {
      path: path.slice(0, 120),
      error: error?.message ?? null,
    });
  } catch (err) {
    console.warn('[SigSimple] Supabase sign threw', {
      error: err instanceof Error ? err.message : String(err),
      path: path.slice(0, 120),
    });
  }

  // 2) GCS fallback as blob URL
  return await fetchGcsAsBlobUrl(path);
}