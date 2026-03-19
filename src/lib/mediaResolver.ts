import { supabase } from "@/integrations/supabase/client";
import { resolveSignatureUrlSimple } from "@/lib/resolveSignatureUrlSimple";

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
 * Detect values that are signature references.
 * Any of: supabase-sig://, contains /vehicle-signatures/, bare path jobs/.../signatures/...
 */
function isSignatureReference(url: string): boolean {
  if (url.startsWith("supabase-sig://")) return true;
  if (url.includes("/vehicle-signatures/")) return true;
  if (/^jobs\/[^/]+\/signatures\//.test(url)) return true;
  return false;
}

/**
 * Build a tokenized proxy URL that the browser can use directly in <img> tags.
 * No fetch/redirect dance — just a URL the edge function will serve.
 */
async function getTokenizedProxyUrl(objectPath: string): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;
  if (!token) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token ?? null;
  }
  if (!token) {
    console.warn('[MediaResolver] No auth token for GCS proxy', { objectPath: objectPath.slice(0, 50) });
    return null;
  }

  return `${GCS_PROXY_ENDPOINT}?path=${encodeURIComponent(objectPath)}&token=${encodeURIComponent(token)}`;
}

export async function resolveMediaUrlAsync(
  url: string | null | undefined
): Promise<string | null> {
  if (!url) return null;

  const normalizedUrl = typeof url === "string" ? url.trim() : "";
  if (!normalizedUrl) return null;

  if (normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) {
    return normalizedUrl;
  }

  // ─── SIGNATURES: direct Supabase signed URL + GCS proxy fallback ───
  if (isSignatureReference(normalizedUrl)) {
    const resolved = await resolveSignatureUrlSimple(normalizedUrl);
    if (resolved) return resolved;
    console.error("[MediaResolver] Signature resolution failed", {
      raw: normalizedUrl.slice(0, 180),
    });
    return null;
  }

  // ─── GCS full URLs — build tokenized proxy URL directly ───
  if (normalizedUrl.startsWith(GCS_PUBLIC_PREFIX)) {
    const objectPath = normalizedUrl.slice(GCS_PUBLIC_PREFIX.length);
    return getTokenizedProxyUrl(objectPath);
  }

  // ─── Bare non-signature paths → GCS proxy ───
  if (isBareObjectPath(normalizedUrl)) {
    return getTokenizedProxyUrl(normalizedUrl);
  }

  return normalizedUrl;
}
