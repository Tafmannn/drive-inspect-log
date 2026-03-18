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
  if (!url) {
    console.error("[MediaResolver] Empty URL input");
    return null;
  }

  const normalizedUrl = typeof url === "string" ? url.trim() : "";
  if (!normalizedUrl) {
    console.error("[MediaResolver] URL became empty after trim", {
      raw: String(url).slice(0, 120),
    });
    return null;
  }

  if (normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) {
    return normalizedUrl;
  }

  // supabase-sig:// scheme — current canonical format
  if (normalizedUrl.startsWith("supabase-sig://")) {
    const result = await internalStorageService.resolveSignatureUrlStructured(normalizedUrl);
    if (result.url) return result.url;
    console.error("[MediaResolver] supabase-sig resolution failed", {
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      bucket: result.bucket,
      path: result.path?.slice(0, 160) ?? null,
    });
    return null;
  }

  // Supabase URLs containing vehicle-signatures (legacy public/signed URLs)
  if (
    normalizedUrl.includes("/vehicle-signatures/") ||
    normalizedUrl.includes("/object/sign/vehicle-signatures/") ||
    normalizedUrl.includes("/object/public/vehicle-signatures/")
  ) {
    const result = await internalStorageService.resolveSignatureUrlStructured(normalizedUrl);
    if (result.url) return result.url;
    console.error("[MediaResolver] legacy Supabase signature URL resolution failed", {
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      bucket: result.bucket,
      path: result.path?.slice(0, 160) ?? null,
    });
    return null;
  }

  // GCS full URLs — route through authenticated proxy
  if (normalizedUrl.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = normalizedUrl.slice(GCS_PUBLIC_PREFIX.length);
    const proxied = await resolveGcsViaAuthenticatedFetch(objectPath);
    if (!proxied) {
      console.error("[MediaResolver] GCS public URL proxy resolution failed", {
        objectPath: objectPath.slice(0, 160),
      });
    }
    return proxied;
  }

  // Bare paths
  if (isBareObjectPath(normalizedUrl)) {
    // CRITICAL: Signature bare paths are always treated as Supabase vehicle-signatures paths.
    if (isSignatureLikePath(normalizedUrl)) {
      const result = await internalStorageService.resolveSignatureUrlStructured(normalizedUrl);
      if (result.url) return result.url;

      // Supabase bucket miss → fallback to GCS proxy (object may live in GCS)
      if (result.errorCode === 'OBJECT_NOT_FOUND') {
        console.info("[MediaResolver] Supabase OBJECT_NOT_FOUND for signature, falling back to GCS", {
          path: normalizedUrl.slice(0, 180),
        });
        const gcsUrl = await resolveGcsViaAuthenticatedFetch(normalizedUrl);
        if (gcsUrl) return gcsUrl;

        console.error("[MediaResolver] Signature path failed BOTH Supabase and GCS", {
          rawInput: normalizedUrl.slice(0, 180),
          supabaseError: result.errorMessage,
        });
        return null;
      }

      console.error("[MediaResolver] Bare signature path failed Supabase signing (non-recoverable)", {
        rawInput: normalizedUrl.slice(0, 180),
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });
      return null;
    }

    // Non-signature bare path → GCS
    const gcsResolved = await resolveGcsViaAuthenticatedFetch(normalizedUrl);
    if (!gcsResolved) {
      console.error("[MediaResolver] Non-signature bare path failed GCS resolution", {
        rawInput: normalizedUrl.slice(0, 180),
      });
    }
    return gcsResolved;
  }

  return normalizedUrl;
}
