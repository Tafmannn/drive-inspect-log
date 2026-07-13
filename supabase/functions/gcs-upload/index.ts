import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateCaller, callerCanAccessPath } from "../_shared/auth.ts";
import { createIpRateLimiter } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const rateLimiter = createIpRateLimiter(corsHeaders);

interface UploadRequest {
  fileName: string;
  contentType: string;
  fileBase64: string;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const limited = rateLimiter.check(req);
  if (limited) return limited;

  try {
    // ─── Auth: org comes from user_profiles, never user_metadata ───
    const authResult = await authenticateCaller(req);
    if ("error" in authResult) return authResult.error;
    const { caller, admin } = authResult;
    if (caller.accountStatus === "suspended") {
      return new Response(JSON.stringify({ error: "ACCOUNT_SUSPENDED" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userOrgId = caller.orgId;
    if (!userOrgId) {
      return new Response(JSON.stringify({ error: "NO_ORG" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Service account for GCS ───
    const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_SERVICE_ACCOUNT_JSON not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sa = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(sa);

    let body: UploadRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { fileName, contentType, fileBase64 } = body ?? {};

    if (!fileName || !fileBase64) {
      return new Response(
        JSON.stringify({ error: "fileName and fileBase64 are required", received: { hasFileName: !!fileName, hasBase64: !!fileBase64, base64Length: fileBase64?.length ?? 0 } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate content type
    if (contentType && !ALLOWED_TYPES.includes(contentType.toLowerCase())) {
      return new Response(
        JSON.stringify({ error: `Content type not allowed: ${contentType}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bucket = "axentra_db";
    const fileBytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));

    // Validate file size — reject empty (0-byte) payloads so corrupt/empty
    // evidence never lands in storage with a matching photos row (V7).
    if (fileBytes.length === 0) {
      return new Response(
        JSON.stringify({ error: "File is empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (fileBytes.length > MAX_SIZE) {
      return new Response(
        JSON.stringify({ error: "File too large (max 10 MB)" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deterministic, sanitised object name (V5). The client supplies a unique,
    // namespaced path (jobs/<job>/<type>/<photoType>/<itemId>.<ext> or
    // jobs/<job>/signatures/<type>/<role>.<ext>), so retries OVERWRITE the same
    // object instead of orphaning a new randomly-named one on every failed
    // insert / re-capture. The name is used verbatim as the GCS object key, so
    // reject path traversal / absolute paths defensively.
    const finalName = String(fileName).replace(/^\/+/, "");
    if (finalName.length === 0 || finalName.includes("..") || finalName.includes("//")) {
      return new Response(
        JSON.stringify({ error: "Invalid fileName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Authorize the write against the caller's org (cross-org write guard) ───
    // The jobId is derived from the object path itself — not from a separate
    // client-supplied field — because no real caller ever sends one (the
    // upload wrapper only ever sends fileName/contentType/fileBase64), which
    // previously left every upload unauthorized: any authenticated user could
    // overwrite any job's photos/signatures in any org by naming the object
    // `jobs/<other-job-id>/...`. callerCanAccessPath extracts the jobId from
    // the path itself and fails closed if it can't.
    if (!(await callerCanAccessPath(admin, caller, finalName))) {
      return new Response(JSON.stringify({ error: "FORBIDDEN" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(finalName)}`;
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType || "image/jpeg",
      },
      body: fileBytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("GCS upload failed:", errText);
      return new Response(
        JSON.stringify({ error: "GCS upload failed", details: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await uploadRes.json();
    // Return object path only — client resolves via gcs-proxy for secure access
    const objectPathUrl = finalName;

    return new Response(
      JSON.stringify({
        url: objectPathUrl,
        backend: "googleCloud",
        backendRef: finalName,
        bucket,
        size: result.size,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    console.error("gcs-upload error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Google Auth via Service Account JWT ───────────────────────────

async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.read_write",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const unsigned = `${enc(header)}.${enc(payload)}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${unsigned}.${sigB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error("Failed to get access token: " + JSON.stringify(tokenData));
  return tokenData.access_token;
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