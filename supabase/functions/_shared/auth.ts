// Shared authentication/authorization helpers for edge functions.
//
// SECURITY MODEL (Phase 1 / C3):
//   The ONLY authoritative source for a caller's role and org is the
//   public.user_profiles table (server-controlled). JWT `user_metadata` is
//   user-writable via auth.updateUser() and must NEVER be trusted for authz.
//   These helpers verify the bearer token (signature-checked by GoTrue via
//   getUser) and then load role/org from user_profiles using the service role.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

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

export type AppRole = "driver" | "admin" | "super_admin";

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
 */
export async function authenticateCaller(
  req: Request,
): Promise<AuthOk | { error: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: jsonRes({ error: "UNAUTHENTICATED" }, 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Token signature is verified server-side by GoTrue here.
  const anon = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await anon.auth.getUser();
  if (authError || !authData?.user) {
    return { error: jsonRes({ error: "UNAUTHENTICATED" }, 401) };
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: profile } = await admin
    .from("user_profiles")
    .select("role, org_id, account_status, email")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  const role: AppRole =
    profile?.role === "super_admin" || profile?.role === "admin"
      ? profile.role
      : "driver";

  const caller: Caller = {
    id: authData.user.id,
    email: profile?.email ?? authData.user.email ?? "",
    role,
    orgId: profile?.org_id ?? null,
    accountStatus: profile?.account_status ?? "active",
    isAdmin: role === "admin" || role === "super_admin",
    isSuperAdmin: role === "super_admin",
  };

  return { caller, admin };
}

/** Roles array for app_metadata, kept in sync with a profile role. */
export function rolesArrayFor(role: AppRole): string[] {
  if (role === "super_admin") return ["SUPERADMIN", "ADMIN", "DRIVER"];
  if (role === "admin") return ["ADMIN", "DRIVER"];
  return ["DRIVER"];
}
