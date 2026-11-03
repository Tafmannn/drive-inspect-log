// Staff-only gate for edge functions that call billed third-party APIs.
//
// Verifies the bearer token (getClaims, same as _shared/auth.ts), then loads
// the caller's role/org/status from user_profiles with the service role —
// never from JWT user_metadata — and applies the pure staffDecision rule.
// The anon key is not a user token: getClaims yields no `sub` for it, so
// signed-out ("public") calls are refused.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DENY_LOOKUP_FAILED,
  DENY_UNAUTHENTICATED,
  staffDecision,
  type StaffDenial,
} from "./staffGate.ts";

export type { StaffDenial };

/** Returns null when the caller is active staff, else the denial to send. */
export async function checkStaff(req: Request): Promise<StaffDenial | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return DENY_UNAUTHENTICATED;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return DENY_UNAUTHENTICATED;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: authError } = await anon.auth.getClaims(token);
  const userId = claimsData?.claims?.sub;
  if (authError || !userId) return DENY_UNAUTHENTICATED;

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("role, org_id, account_status")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (profileError) {
    console.error("checkStaff: profile lookup failed", profileError.message);
    return DENY_LOOKUP_FAILED;
  }

  return staffDecision(profile);
}
