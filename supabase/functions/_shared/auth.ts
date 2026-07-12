// Shared authentication/authorization helpers for edge functions.
//
// SECURITY MODEL (Phase 1 / C3):
//   The ONLY authoritative source for a caller's role and org is the
//   public.user_profiles table (server-controlled). JWT `user_metadata` is
//   user-writable via auth.updateUser() and must NEVER be trusted for authz.
//   These helpers verify the bearer token (validated locally against the
//   project's signing keys via getClaims) and then load role/org from
//   user_profiles using the service role.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { extractJobIdFromPath } from "./pathAuth.ts";
import {
  callerAuthzFromProfile,
  rolesArrayFor,
  type AppRole,
} from "./profileAuthz.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Re-exported from the pure module so existing importers keep working.
export type { AppRole };
export { rolesArrayFor };

export interface Caller {
  id: string;
  email: string;
  role: AppRole;
  orgId: string | null;
  accountStatus: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface AuthOk {
  caller: Caller;
  admin: SupabaseClient;
}

/**
 * Authenticate the request and load the caller's authoritative profile.
 * Returns either { caller, admin } or a ready-to-return error Response.
 *
 * `opts.tokenParam` allows callers (e.g. gcs-proxy serving <img> requests that
 * cannot set an Authorization header) to supply the bearer token explicitly.
 */
export async function authenticateCaller(
  req: Request,
  opts: { tokenParam?: string | null } = {},
): Promise<AuthOk | { error: Response }> {
  let authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader && opts.tokenParam) {
    authHeader = `Bearer ${opts.tokenParam}`;
  }
  if (!authHeader.startsWith("Bearer ")) {
    return { error: jsonRes({ error: "UNAUTHENTICATED" }, 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // getUser() stopped validating correctly under the newer signing-keys JWT
  // setup (confirmed live on business-search/postcode-lookup/maps-directions,
  // all fixed by switching to getClaims()) — verifies the token locally
  // against the current signing keys instead of round-tripping through the
  // old endpoint.
  const anon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: authError } = await anon.auth.getClaims(token);
  if (authError || !claimsData?.claims?.sub) {
    return { error: jsonRes({ error: "UNAUTHENTICATED" }, 401) };
  }
  const userId = claimsData.claims.sub;
  const userEmail = (claimsData.claims as { email?: string }).email ?? "";

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role, org_id, account_status, email")
    .eq("auth_user_id", userId)
    .maybeSingle();

  // Authorization is derived ONLY from the profile row (never user_metadata).
  const caller: Caller = {
    id: userId,
    email: profile?.email ?? userEmail,
    ...callerAuthzFromProfile(profile),
  };

  return { caller, admin };
}

/**
 * Authorize access to a storage object by resolving its owning org from the DB.
 * All GCS/signature object paths are of the form `jobs/<jobId>/...`, so the org
 * is resolved via the jobs table and compared to the caller's org. Fails closed
 * for non-super-admins when the path has no resolvable job/org.
 */
export async function callerCanAccessPath(
  admin: SupabaseClient,
  caller: Caller,
  objectPath: string,
): Promise<boolean> {
  if (caller.isSuperAdmin) return true;
  if (!caller.orgId) return false;

  const jobId = extractJobIdFromPath(objectPath);
  if (!jobId) return false; // fail closed

  const { data: job } = await admin
    .from("jobs")
    .select("org_id")
    .eq("id", jobId)
    .maybeSingle();

  return !!job && job.org_id === caller.orgId;
}
