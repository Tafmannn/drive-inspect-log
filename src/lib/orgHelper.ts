// Helper to get the current user's org_id for insert operations
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

const AUTH_ENABLED =
  typeof import.meta !== 'undefined' &&
  (import.meta.env.VITE_ENABLE_AUTH as string | undefined) !== 'false';

export async function getOrgId(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      // app_metadata is service-set (not user-writable) and mirrors the
      // authoritative user_profiles.org_id, so it's a safe fast path.
      // user_metadata is deliberately NOT trusted — it is self-writable via
      // auth.updateUser() and RLS (user_org_id()) ignores it, so relying on
      // it here would let a client send an org_id the server then rejects.
      const metaOrgId = session.user.app_metadata?.org_id;
      if (metaOrgId) return metaOrgId;

      // Fall back to the authoritative source: the user's own profile row.
      // Covers legacy accounts whose org lived only in user_metadata before
      // the Phase 1 backfill moved it into user_profiles.
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      if (profile?.org_id) return profile.org_id;

      // Authenticated but no org_id anywhere — misconfigured account
      throw new Error(
        'No org_id in session — user account is misconfigured. Contact your administrator.'
      );
    }

    // No session — only allow fallback if auth is disabled (dev mode)
    if (!AUTH_ENABLED) {
      return DEFAULT_ORG_ID;
    }

    // Auth is enabled but no session — user should be redirected to login
    throw new Error('No active session. Please log in.');
  } catch (e) {
    // Re-throw explicit org_id / session errors
    if (e instanceof Error && (e.message.includes('org_id') || e.message.includes('session'))) throw e;
    // Auth fetch failed — only fall back in dev mode
    if (!AUTH_ENABLED) return DEFAULT_ORG_ID;
    throw e;
  }
}

export function getOrgIdSync(): string {
  // For synchronous contexts in dev mode only; prefer async version
  return DEFAULT_ORG_ID;
}
