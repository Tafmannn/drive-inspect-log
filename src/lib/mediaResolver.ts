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
 * Detect bare paths that belong to Supabase vehicle-signatures bucket
 * rather than GCS. These follow the pattern: jobs/{id}/signatures/...
 */
function isSupabaseSignaturePath(url: string): boolean {
  return /^jobs\/[^/]+\/signatures\//.test(url);
}

async function resolveGcsViaAuthenticatedFetch(objectPath: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

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

  // Bare paths: distinguish Supabase signatures from GCS objects
  if (isBareObjectPath(url)) {
    if (isSupabaseSignaturePath(url)) {
      // This is a Supabase Storage path in vehicle-signatures bucket
      return await internalStorageService.resolveSignatureUrl(url);
    }
    // Otherwise treat as GCS object path
    return await resolveGcsViaAuthenticatedFetch(url);
  }

  return url;
}