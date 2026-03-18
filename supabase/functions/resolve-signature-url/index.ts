import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SIGNATURE_BUCKET = 'vehicle-signatures';
const GCS_BUCKET = 'axentra_db';
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

interface ResolveResult {
  success: boolean;
  finalUrl: string | null;
  normalized: {
    format: string;
    backend: string;
    bucket: string | null;
    path: string | null;
  };
  expiresAt?: string;
  error?: string;
}

function normalizeSignatureInput(rawUrl: string): {
  format: string;
  backend: string;
  bucket: string | null;
  path: string | null;
} {
  const trimmed = rawUrl.trim();

  // 1. supabase-sig://bucket/path
  const sigMatch = trimmed.match(/^supabase-sig:\/\/([^/]+)\/(.+)$/);
  if (sigMatch) {
    return { format: 'supabase-sig', backend: 'supabase', bucket: sigMatch[1], path: sigMatch[2] };
  }

  // 2. Legacy Supabase URL with vehicle-signatures
  if (trimmed.includes('/vehicle-signatures/')) {
    const publicMatch = trimmed.match(/\/object\/public\/vehicle-signatures\/(.+?)(?:\?|$)/);
    const signedMatch = trimmed.match(/\/object\/sign\/vehicle-signatures\/(.+?)\?/);
    const extracted = publicMatch?.[1] ?? signedMatch?.[1];
    if (extracted) {
      return {
        format: publicMatch ? 'legacy-public-url' : 'legacy-signed-url',
        backend: 'supabase',
        bucket: SIGNATURE_BUCKET,
        path: decodeURIComponent(extracted),
      };
    }
  }

  // 3. Bare signature path: jobs/<id>/signatures/...
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('data:') &&
    !trimmed.startsWith('blob:') &&
    /^jobs\/[^/]+\/signatures\//.test(trimmed)
  ) {
    return { format: 'bare-path', backend: 'supabase', bucket: SIGNATURE_BUCKET, path: trimmed };
  }

  return { format: 'unknown', backend: 'unknown', bucket: null, path: null };
}

// ─── GCS V4 Signed URL Generation (same as gcs-proxy) ───

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
    "GET", canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "GOOG4-RSA-SHA256", timestamp, credentialScope, await sha256Hex(canonicalRequest),
  ].join("\n");

  const key = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(stringToSign)
  );
  const signatureHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Goog-Signature=${signatureHex}`;
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", binaryDer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ success: false, finalUrl: null, normalized: { format: 'none', backend: 'none', bucket: null, path: null }, error: 'UNAUTHENTICATED' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse({ success: false, finalUrl: null, normalized: { format: 'none', backend: 'none', bucket: null, path: null }, error: 'UNAUTHENTICATED' }, 401);
    }

    // Parse input
    const body = await req.json().catch(() => ({}));
    const rawUrl = typeof body.rawUrl === 'string' ? body.rawUrl.trim() : '';
    if (!rawUrl) {
      return jsonResponse({ success: false, finalUrl: null, normalized: { format: 'empty', backend: 'none', bucket: null, path: null }, error: 'MISSING_RAW_URL' }, 400);
    }

    const normalized = normalizeSignatureInput(rawUrl);

    if (!normalized.bucket || !normalized.path) {
      return jsonResponse({ success: false, finalUrl: null, normalized, error: `UNRECOGNIZED_FORMAT: ${normalized.format}` }, 400);
    }

    // Use service role to create signed URL (bypasses RLS)
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await adminClient.storage
      .from(normalized.bucket)
      .createSignedUrl(normalized.path, SIGNED_URL_EXPIRY_SECONDS);

    if (!error && data?.signedUrl) {
      const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();
      return jsonResponse({
        success: true,
        finalUrl: data.signedUrl,
        normalized,
        expiresAt,
      }, 200);
    }

    // ─── Supabase signing failed — try GCS fallback for bare paths ───
    const errMsg = error?.message ?? 'No signed URL returned';
    console.warn('[resolve-signature-url] Supabase sign failed, trying GCS fallback', {
      bucket: normalized.bucket,
      path: normalized.path?.slice(0, 160),
      error: errMsg,
    });

    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      console.error('[resolve-signature-url] No GOOGLE_SERVICE_ACCOUNT_JSON for GCS fallback');
      return jsonResponse({
        success: false,
        finalUrl: null,
        normalized,
        error: `SIGN_FAILED: ${errMsg} (no GCS fallback available)`,
      }, 500);
    }

    try {
      const sa = JSON.parse(serviceAccountJson);
      const gcsSignedUrl = await generateV4SignedUrl(sa, GCS_BUCKET, normalized.path, SIGNED_URL_EXPIRY_SECONDS);
      const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();

      console.info('[resolve-signature-url] GCS fallback succeeded', {
        path: normalized.path?.slice(0, 160),
      });

      return jsonResponse({
        success: true,
        finalUrl: gcsSignedUrl,
        normalized: { ...normalized, backend: 'gcs-fallback' },
        expiresAt,
      }, 200);
    } catch (gcsErr: unknown) {
      console.error('[resolve-signature-url] GCS fallback also failed', {
        path: normalized.path?.slice(0, 160),
        gcsError: gcsErr instanceof Error ? gcsErr.message : String(gcsErr),
      });
      return jsonResponse({
        success: false,
        finalUrl: null,
        normalized,
        error: `SIGN_FAILED: Supabase: ${errMsg}; GCS fallback also failed`,
      }, 500);
    }

  } catch (e: unknown) {
    console.error('[resolve-signature-url] unhandled', e);
    return jsonResponse({
      success: false,
      finalUrl: null,
      normalized: { format: 'error', backend: 'none', bucket: null, path: null },
      error: e instanceof Error ? e.message : String(e),
    }, 500);
  }
});

function jsonResponse(body: ResolveResult, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
