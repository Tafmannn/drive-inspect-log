import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateCaller, callerCanAccessPath } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Rate limiter: 30 req/IP/min ───
const ipHits = new Map<string, { count: number; resetAt: number }>();
function rateLimit(req: Request): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  entry.count++;
  if (entry.count > 30) {
    return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
    });
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const limited = rateLimit(req);
  if (limited) return limited;

  try {
    const url = new URL(req.url);
    const rawObjectPath = url.searchParams.get("path");
    const objectPath = (rawObjectPath ?? "").replace(/^\/+/, "");
    if (!objectPath) {
      return new Response(
        JSON.stringify({ error: "Missing ?path= parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Auth: Authorization header OR ?token= query param (for <img> loads) ───
    // NOTE: token-in-URL is retained because <img>/streamed responses cannot send
    // an Authorization header. It carries the caller's OWN JWT. Hardening this to
    // a signed-cookie/signed-path scheme is a Phase 2 follow-up (needs a
    // coordinated client change); the IDOR is closed by the org check below.
    const tokenParam = url.searchParams.get("token");
    const authResult = await authenticateCaller(req, { tokenParam });
    if ("error" in authResult) return authResult.error;
    const { caller, admin } = authResult;

    if (caller.accountStatus === "suspended") {
      return new Response(JSON.stringify({ error: "ACCOUNT_SUSPENDED" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Authorize the requested object against the caller's org (C2 IDOR) ───
    if (!(await callerCanAccessPath(admin, caller, objectPath))) {
      return new Response(JSON.stringify({ error: "FORBIDDEN" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Generate GCS V4 signed URL ───
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sa = JSON.parse(serviceAccountJson);
    const bucket = "axentra_db";
    const signedUrl = await generateV4SignedUrl(sa, bucket, objectPath, 900);

    // ─── Stream content directly instead of 302 redirect ───
    // This avoids cross-origin redirect issues with <img> tags
    const gcsResponse = await fetch(signedUrl);
    if (!gcsResponse.ok) {
      console.error("[gcs-proxy] GCS fetch failed", {
        status: gcsResponse.status,
        path: objectPath.slice(0, 120),
      });
      return new Response(
        JSON.stringify({ error: "GCS_FETCH_FAILED", status: gcsResponse.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contentType = gcsResponse.headers.get("Content-Type") || "application/octet-stream";
    const body = gcsResponse.body;

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch (e: unknown) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── GCS V4 Signed URL Generation ───

async function generateV4SignedUrl(
  sa: { client_email: string; private_key: string },
  bucket: string,
  objectPath: string,
  expiresInSeconds: number
): Promise<string> {
  const now = new Date();
  const datestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 8);
  const timestamp = datestamp + "T" + now.toISOString().replace(/[-:]/g, "").slice(9, 15) + "Z";

  const credentialScope = `${datestamp}/auto/storage/goog4_request`;
  const credential = `${sa.client_email}/${credentialScope}`;

  const host = "storage.googleapis.com";
  const canonicalUri = `/${bucket}/${objectPath.split("/").map(encodeURIComponent).join("/")}`;

  const params = new URLSearchParams();
  params.set("X-Goog-Algorithm", "GOOG4-RSA-SHA256");
  params.set("X-Goog-Credential", credential);
  params.set("X-Goog-Date", timestamp);
  params.set("X-Goog-Expires", String(expiresInSeconds));
  params.set("X-Goog-SignedHeaders", "host");

  const sortedParams = new URLSearchParams([...params.entries()].sort());
  const canonicalQueryString = sortedParams.toString();

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "GOOG4-RSA-SHA256",
    timestamp,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(stringToSign)
  );
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signatureHex}`;
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}
