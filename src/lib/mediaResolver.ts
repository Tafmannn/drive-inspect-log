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

async function resolveGcsViaAuthenticatedFetch(objectPath: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  // Use redirect: "manual" to extract the signed URL from the 302 Location header.
  // redirect: "follow" fails because the browser follows the redirect to GCS which
  // may not return proper CORS headers, causing an opaque redirect error.
  const res = await fetch(`${GCS_PROXY_ENDPOINT}?path=${encodeURIComponent(objectPath)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    redirect: "manual",
  });

  // 302 redirect — extract Location header containing the signed GCS URL
  if (res.status === 302 || res.status === 301) {
    return res.headers.get("Location") || null;
  }

  // Fallback: if proxy returned the data directly (200), build a token-authenticated URL
  // that <img> tags can use
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

  if (url.startsWith("supabase-sig://")) {
    return await internalStorageService.resolveSignatureUrl(url);
  }

  if (
    url.includes("/vehicle-signatures/") ||
    url.includes("/object/sign/vehicle-signatures/") ||
    url.includes("/object/public/vehicle-signatures/")
  ) {
    return await internalStorageService.resolveSignatureUrl(url);
  }

  if (url.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = url.slice(GCS_PUBLIC_PREFIX.length);
    return await resolveGcsViaAuthenticatedFetch(objectPath);
  }

  if (isBareObjectPath(url)) {
    return await resolveGcsViaAuthenticatedFetch(url);
  }

  return url;
}