import { supabase } from "@/integrations/supabase/client";
import { internalStorageService } from "@/lib/internalStorageService";

const GCS_PUBLIC_PREFIX = "https://storage.googleapis.com/axentra_db/";
const GCS_PROXY_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gcs-proxy`;

function isBareObjectPath(url: string): boolean {
  return (
    !url.startsWith("http://") &&
    !url.startsWith("https://") &&
    !url.startsWith("data:") &&
    !url.startsWith("blob:") &&
    !url.startsWith("supabase-sig://") &&
    url.length > 0
  );
}

/**
 * Detect bare paths that look like signature paths.
 * Pattern: jobs/{id}/signatures/...
 */
function isSignatureLikePath(url: string): boolean {
  return /^jobs\/[^/]+\/signatures\//.test(url);
}

async function resolveGcsViaAuthenticatedFetch(objectPath: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    console.warn('[MediaResolver] No auth token for GCS proxy', { objectPath: objectPath.slice(0, 50) });
    return null;
  }

  const res = await fetch(`${GCS_PROXY_ENDPOINT}?path=${encodeURIComponent(objectPath)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    redirect: "manual",
  });

  if (res.status === 302 || res.status === 301) {
    return res.headers.get("Location") || null;
  }

  if (res.ok) {
    return `${GCS_PROXY_ENDPOINT}?path=${encodeURIComponent(objectPath)}&token=${encodeURIComponent(token)}`;
  }

  console.warn('[MediaResolver] GCS proxy failed', { objectPath: objectPath.slice(0, 50), status: res.status });
  return null;
}

export async function resolveMediaUrlAsync(
  url: string | null | undefined
): Promise<string | null> {
  if (!url) return null;

  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  // supabase-sig:// scheme — current canonical format
  if (url.startsWith("supabase-sig://")) {
    return await internalStorageService.resolveSignatureUrl(url);
  }

  // Supabase URLs containing vehicle-signatures (legacy public/signed URLs)
  if (
    url.includes("/vehicle-signatures/") ||
    url.includes("/object/sign/vehicle-signatures/") ||
    url.includes("/object/public/vehicle-signatures/")
  ) {
    return await internalStorageService.resolveSignatureUrl(url);
  }

  // GCS full URLs — route through authenticated proxy
  if (url.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = url.slice(GCS_PUBLIC_PREFIX.length);
    return await resolveGcsViaAuthenticatedFetch(objectPath);
  }

  // Bare paths
  if (isBareObjectPath(url)) {
    // Signature-like paths: try Supabase first, fallback to GCS if object not found
    if (isSignatureLikePath(url)) {
      const result = await internalStorageService.resolveSignatureUrlStructured(url);
      if (result.errorCode === 'OK' && result.url) {
        return result.url;
      }
      // Object not in Supabase — likely uploaded to GCS when CLOUD_STORAGE_ENABLED was true
      if (result.errorCode === 'OBJECT_NOT_FOUND') {
        console.info('[MediaResolver] Signature not in Supabase, trying GCS fallback', { path: url.slice(0, 60) });
        const gcsUrl = await resolveGcsViaAuthenticatedFetch(url);
        if (gcsUrl) return gcsUrl;
        console.error('[MediaResolver] Signature not found in Supabase OR GCS', { path: url.slice(0, 60) });
        return null;
      }
      // Other errors (permission, malformed) — don't fallback
      console.error('[MediaResolver] Signature resolve failed', { path: url.slice(0, 60), errorCode: result.errorCode });
      return null;
    }
    // Non-signature bare path → GCS
    return await resolveGcsViaAuthenticatedFetch(url);
  }

  return url;
}
