import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SIGNATURE_BUCKET = 'vehicle-signatures';
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

    if (error || !data?.signedUrl) {
      const errMsg = error?.message ?? 'No signed URL returned';
      console.error('[resolve-signature-url] createSignedUrl failed', {
        bucket: normalized.bucket,
        path: normalized.path?.slice(0, 160),
        error: errMsg,
      });
      return jsonResponse({
        success: false,
        finalUrl: null,
        normalized,
        error: `SIGN_FAILED: ${errMsg}`,
      }, 500);
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString();

    return jsonResponse({
      success: true,
      finalUrl: data.signedUrl,
      normalized,
      expiresAt,
    }, 200);

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
