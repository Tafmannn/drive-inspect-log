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
      const orgId =
        session.user.app_metadata?.org_id ??
        session.user.user_metadata?.org_id;
      if (orgId) return orgId;

      // Authenticated but no org_id — misconfigured account
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
