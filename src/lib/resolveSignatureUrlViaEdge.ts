/**
 * Canonical frontend helper for resolving signature URLs through the
 * server-side resolve-signature-url Edge Function.
 *
 * All signature consumers MUST use this function (or resolveMediaUrlAsync
 * which delegates here for signatures). No browser-side createSignedUrl
 * for signatures is permitted in active app flows.
 */

import { supabase } from '@/integrations/supabase/client';

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

// Simple in-memory cache to avoid redundant Edge Function calls
const cache = new Map<string, { url: string; expiresAt: number }>();

export async function resolveSignatureUrlViaEdge(
  rawUrl: string | null | undefined
): Promise<string | null> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    console.warn('[SigEdge] empty input');
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Check cache (with 5-min safety margin)
  const cached = cache.get(trimmed);
  if (cached && Date.now() < cached.expiresAt - 300_000) {
    return cached.url;
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      console.error('[SigEdge] no auth token');
      return null;
    }

    const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resolve-signature-url`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rawUrl: trimmed }),
    });

    const result: ResolveResult = await res.json();

    console.info('[SigEdge] result', {
      raw: trimmed.slice(0, 120),
      format: result.normalized?.format,
      backend: result.normalized?.backend,
      bucket: result.normalized?.bucket,
      path: result.normalized?.path?.slice(0, 120) ?? null,
      success: result.success,
      finalUrlPrefix: result.finalUrl?.slice(0, 80) ?? null,
      error: result.error ?? null,
    });

    if (!result.success || !result.finalUrl) {
      console.error('[SigEdge] resolution failed', {
        raw: trimmed.slice(0, 120),
        error: result.error,
      });
      return null;
    }

    // Cache the result
    const expiresAt = result.expiresAt
      ? new Date(result.expiresAt).getTime()
      : Date.now() + 3600_000;
    cache.set(trimmed, { url: result.finalUrl, expiresAt });

    return result.finalUrl;
  } catch (err) {
    console.error('[SigEdge] fetch error', {
      raw: trimmed.slice(0, 120),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
