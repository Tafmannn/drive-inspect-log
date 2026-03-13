// Helper to get the current user's org_id for insert operations
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

export async function getOrgId(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      // Check both user_metadata and app_metadata for org_id
      const orgId =
        session.user.user_metadata?.org_id ??
        session.user.app_metadata?.org_id;
      if (orgId) return orgId;

      // Authenticated but no org_id — misconfigured account
      throw new Error(
        'No org_id in session — user account is misconfigured. Contact your administrator.'
      );
    }

    // No session at all (unauthenticated / dev mode) — use default
    return DEFAULT_ORG_ID;
  } catch (e) {
    // Re-throw explicit org_id errors; swallow auth-fetch errors
    if (e instanceof Error && e.message.includes('org_id')) throw e;
    return DEFAULT_ORG_ID;
  }
}

export function getOrgIdSync(): string {
  // For synchronous contexts, return default; prefer async version
  return DEFAULT_ORG_ID;
}
