import { supabase } from "@/integrations/supabase/client";
import { resolveSignatureUrlViaEdge } from "@/lib/resolveSignatureUrlViaEdge";

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
    console.error("[MediaResolver] URL became empty after trim");
    return null;
  }

  if (normalizedUrl.startsWith("data:") || normalizedUrl.startsWith("blob:")) {
    return normalizedUrl;
  }

  // ─── SIGNATURES: ALL signature references route through the Edge Function ───
  if (isSignatureReference(normalizedUrl)) {
    const resolved = await resolveSignatureUrlViaEdge(normalizedUrl);
    if (resolved) return resolved;
    console.error("[MediaResolver] Signature Edge Function resolution failed", {
      raw: normalizedUrl.slice(0, 180),
    });
    return null;
  }

  // ─── GCS full URLs — route through authenticated proxy ───
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

  // ─── Bare non-signature paths → GCS ───
  if (isBareObjectPath(normalizedUrl)) {
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
