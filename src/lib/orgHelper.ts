// Helper to get the current user's org_id for insert operations
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

export async function getOrgId(): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const orgId = session?.user?.user_metadata?.org_id;
    if (orgId) return orgId;
  } catch {
    // fallback
  }
  return DEFAULT_ORG_ID;
}

export function getOrgIdSync(): string {
  // For synchronous contexts, return default; prefer async version
  return DEFAULT_ORG_ID;
}
