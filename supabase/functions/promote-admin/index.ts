import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isSuperAdminCheck(user: any): boolean {
  const directRole = String(user.user_metadata?.role ?? user.app_metadata?.role ?? "").toLowerCase();
  const roleSet = new Set(
    [...((user.user_metadata?.roles ?? []) as string[]), ...((user.app_metadata?.roles ?? []) as string[])]
      .map((r) => String(r).toUpperCase().replace(/-/g, "_"))
  );
  const email = (user.email ?? "").toLowerCase();
  return (
    directRole === "super_admin" || directRole === "superadmin" ||
    roleSet.has("SUPERADMIN") || roleSet.has("SUPER_ADMIN") ||
    email === "axentravehiclelogistics@gmail.com" || email === "info@axentravehicles.com"
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await anonClient.auth.getUser();
    if (authError || !authData?.user) return jsonRes({ error: "UNAUTHENTICATED" }, 401);

    const caller = authData.user;
    if (!isSuperAdminCheck(caller)) return jsonRes({ error: "SUPER_ADMIN_ONLY" }, 403);

    const body = await req.json();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── Route by _action ──
    const action = body._action ?? "promote";

    // ── LIST users ──
    if (action === "list") {
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) return jsonRes({ error: "LIST_USERS_FAILED" }, 500);
      const users = listData.users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        role: u.user_metadata?.role ?? "driver",
        org_id: u.user_metadata?.org_id ?? null,
        is_active: u.user_metadata?.is_active !== false,
      }));
      return jsonRes({ users });
    }

    // ── CREATE organisation ──
    if (action === "create_org") {
      const { name } = body;
      if (!name || typeof name !== "string") return jsonRes({ error: "NAME_REQUIRED" }, 400);
      const { data, error } = await adminClient.from("organisations").insert({ name }).select().single();
      if (error) return jsonRes({ error: error.message }, 500);
      return jsonRes({ success: true, org: data });
    }

    // ── CREATE user (invite) ──
    if (action === "create_user") {
      const { email, role, org_id } = body;
      if (!email) return jsonRes({ error: "EMAIL_REQUIRED" }, 400);
      if (!org_id) return jsonRes({ error: "ORG_ID_REQUIRED" }, 400);
      const targetRole = role ?? "driver";

      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { role: targetRole, org_id },
      });
      if (inviteError) {
        // User might already exist — try updating instead
        if (inviteError.message?.includes("already been registered")) {
          const { data: listData } = await adminClient.auth.admin.listUsers();
          const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
          if (existing) {
            const { error: upErr } = await adminClient.auth.admin.updateUserById(existing.id, {
              user_metadata: { ...existing.user_metadata, role: targetRole, org_id },
            });
            if (upErr) return jsonRes({ error: upErr.message }, 500);
            return jsonRes({ success: true, user_id: existing.id, note: "existing_user_updated" });
          }
        }
        return jsonRes({ error: inviteError.message }, 500);
      }
      return jsonRes({ success: true, user_id: inviteData?.user?.id });
    }

    // ── SET ROLE ──
    if (action === "set_role") {
      const { user_id, role, org_id } = body;
      if (!user_id) return jsonRes({ error: "USER_ID_REQUIRED" }, 400);
      if (!role) return jsonRes({ error: "ROLE_REQUIRED" }, 400);

      const { data: userData } = await adminClient.auth.admin.getUserById(user_id);
      if (!userData?.user) return jsonRes({ error: "USER_NOT_FOUND" }, 404);

      const meta = { ...userData.user.user_metadata, role };
      if (org_id !== undefined) meta.org_id = org_id;
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { user_metadata: meta });
      if (error) return jsonRes({ error: error.message }, 500);
      return jsonRes({ success: true });
    }

    // ── DEACTIVATE / REACTIVATE user ──
    if (action === "deactivate" || action === "reactivate") {
      const { user_id } = body;
      if (!user_id) return jsonRes({ error: "USER_ID_REQUIRED" }, 400);
      const { data: userData } = await adminClient.auth.admin.getUserById(user_id);
      if (!userData?.user) return jsonRes({ error: "USER_NOT_FOUND" }, 404);

      const isActive = action === "reactivate";
      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        user_metadata: { ...userData.user.user_metadata, is_active: isActive },
        ban_duration: isActive ? "none" : "876000h", // ~100 years ban for deactivate
      });
      if (error) return jsonRes({ error: error.message }, 500);
      return jsonRes({ success: true });
    }

    // ── Default: PROMOTE to admin (legacy) ──
    const { email, org_id } = body;
    if (!email || typeof email !== "string") return jsonRes({ error: "EMAIL_REQUIRED" }, 400);

    const callerOrgId = caller.user_metadata?.org_id ?? caller.app_metadata?.org_id ?? null;
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) return jsonRes({ error: "LIST_USERS_FAILED" }, 500);

    const targetUser = listData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!targetUser) return jsonRes({ error: "USER_NOT_FOUND" }, 404);

    const targetOrgId = org_id ?? callerOrgId;
    if (!targetOrgId) return jsonRes({ error: "NO_TARGET_ORG" }, 400);

    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUser.id, {
      user_metadata: { ...targetUser.user_metadata, role: "admin", org_id: targetOrgId },
    });
    if (updateError) return jsonRes({ error: "UPDATE_FAILED" }, 500);

    return jsonRes({ success: true });
  } catch (e) {
    return jsonRes({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
