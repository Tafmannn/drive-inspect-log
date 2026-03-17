/**
 * user-lifecycle — unified edge function for user management.
 * Actions: list, get, create, update_profile, set_role, activate, suspend, reactivate,
 *          archive_driver, restore_driver, sync_profile
 *
 * Auth: JWT verified in code. Caller must be admin (org-scoped) or super_admin (global).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function roleLevel(role: string): number {
  const r = role.toLowerCase().replace(/_/g, "");
  if (r === "superadmin") return 3;
  if (r === "admin") return 2;
  return 1;
}

function isSuperAdminCheck(user: any): boolean {
  const direct = String(user.app_metadata?.role ?? "").toLowerCase().replace(/_/g, "");
  if (direct === "superadmin") return true;
  const roles = [...((user.app_metadata?.roles ?? []) as string[])].map((r) =>
    String(r).toUpperCase().replace(/-/g, "_")
  );
  return roles.includes("SUPERADMIN") || roles.includes("SUPER_ADMIN");
}

function isAdminCheck(user: any): boolean {
  if (isSuperAdminCheck(user)) return true;
  const direct = String(user.app_metadata?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  if (direct === "admin") return true;
  const roles = [
    ...((user.app_metadata?.roles ?? []) as string[]),
    ...((user.user_metadata?.roles ?? []) as string[]),
  ].map((r) => String(r).toUpperCase().replace(/-/g, "_"));
  return roles.includes("ADMIN");
}

function callerOrgId(user: any): string | null {
  return user.app_metadata?.org_id ?? user.user_metadata?.org_id ?? null;
}

async function writeAudit(
  admin: any,
  caller: any,
  action: string,
  opts: { target_user_id?: string; target_org_id?: string; before_state?: any; after_state?: any } = {}
) {
  try {
    await admin.from("admin_audit_log").insert({
      performed_by: caller.id,
      performed_by_email: caller.email ?? "",
      action,
      target_user_id: opts.target_user_id ?? null,
      target_org_id: opts.target_org_id ?? null,
      before_state: opts.before_state ?? null,
      after_state: opts.after_state ?? null,
    });
  } catch { /* non-blocking */ }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData?.user) return json({ error: "UNAUTHENTICATED" }, 401);

    const caller = authData.user;
    const callerIsSuper = isSuperAdminCheck(caller);
    const callerIsAdmin = isAdminCheck(caller);
    if (!callerIsAdmin) return json({ error: "ADMIN_OR_SUPER_ADMIN_ONLY" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body._action ?? "list";
    const admin = createClient(supabaseUrl, serviceKey);

    // ── LIST ──
    if (action === "list") {
      let query = admin.from("user_profiles").select("*, driver_profiles:driver_profiles(id, is_active, archived_at, full_name, display_name, licence_expiry)");

      if (!callerIsSuper) {
        const orgId = callerOrgId(caller);
        if (!orgId) return json({ error: "NO_ORG_ID" }, 400);
        query = query.eq("org_id", orgId);
      } else if (body.org_id) {
        query = query.eq("org_id", body.org_id);
      }
      if (body.account_status) query = query.eq("account_status", body.account_status);
      if (body.role) query = query.eq("role", body.role);

      const { data, error } = await query.order("created_at", { ascending: false }).limit(500);
      if (error) return json({ error: error.message }, 500);
      return json({ users: data ?? [] });
    }

    // ── GET single user ──
    if (action === "get") {
      const { user_id } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: profile, error } = await admin
        .from("user_profiles")
        .select("*, driver_profiles:driver_profiles(*)") 
        .eq("auth_user_id", user_id)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!profile) return json({ error: "NOT_FOUND" }, 404);

      // Org scope check for non-super admins
      if (!callerIsSuper && profile.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }
      return json({ user: profile });
    }

    // ── CREATE (invite + profile) ──
    if (action === "create") {
      const { email, role: newRole, org_id, first_name, last_name, display_name, phone } = body;
      if (!email) return json({ error: "EMAIL_REQUIRED" }, 400);
      if (!org_id) return json({ error: "ORG_ID_REQUIRED" }, 400);
      const targetRole = newRole ?? "driver";

      // Admin cannot create super_admin
      if (!callerIsSuper && targetRole === "super_admin") {
        return json({ error: "CANNOT_GRANT_SUPER_ADMIN" }, 403);
      }
      // Admin cannot create outside own org
      if (!callerIsSuper && org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }

      // Invite via Supabase Auth
      const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { role: targetRole, org_id },
      });

      let authUserId: string;
      if (inviteErr) {
        if (inviteErr.message?.includes("already been registered")) {
          const { data: listData } = await admin.auth.admin.listUsers();
          const existing = listData?.users?.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
          if (!existing) return json({ error: inviteErr.message }, 500);
          authUserId = existing.id;
        } else {
          return json({ error: inviteErr.message }, 500);
        }
      } else {
        authUserId = inviteData?.user?.id!;
      }

      // Update auth metadata
      await admin.auth.admin.updateUserById(authUserId, {
        app_metadata: { role: targetRole, org_id, roles: targetRole === "super_admin" ? ["SUPERADMIN","ADMIN","DRIVER"] : targetRole === "admin" ? ["ADMIN","DRIVER"] : ["DRIVER"] },
        user_metadata: { role: targetRole, org_id },
      });

      // Upsert user_profiles
      const { error: profileErr } = await admin.from("user_profiles").upsert({
        auth_user_id: authUserId,
        email: email.toLowerCase(),
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        display_name: display_name ?? null,
        phone: phone ?? null,
        org_id,
        role: targetRole,
        account_status: "pending_activation",
      }, { onConflict: "auth_user_id" });
      if (profileErr) return json({ error: profileErr.message }, 500);

      await writeAudit(admin, caller, "create_user", {
        target_user_id: authUserId,
        target_org_id: org_id,
        after_state: { email, role: targetRole, org_id },
      });
      return json({ success: true, user_id: authUserId });
    }

    // ── UPDATE PROFILE ──
    if (action === "update_profile") {
      const { user_id, ...fields } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      // Fetch current
      const { data: current } = await admin.from("user_profiles").select("*").eq("auth_user_id", user_id).single();
      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      if (current.is_protected && !callerIsSuper) return json({ error: "PROTECTED_ACCOUNT" }, 403);

      // Sanitize allowed fields
      const allowed = ["first_name","last_name","display_name","phone","internal_notes","profile_photo_path"];
      const updates: Record<string, any> = {};
      for (const k of allowed) {
        if (k in fields && k !== "_action" && k !== "user_id") updates[k] = fields[k];
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await admin.from("user_profiles").update(updates).eq("auth_user_id", user_id);
        if (error) return json({ error: error.message }, 500);
      }

      await writeAudit(admin, caller, "update_profile", {
        target_user_id: user_id,
        before_state: { first_name: current.first_name, last_name: current.last_name },
        after_state: updates,
      });
      return json({ success: true });
    }

    // ── SET ROLE ──
    if (action === "set_role") {
      const { user_id, role: newRole } = body;
      if (!user_id || !newRole) return json({ error: "USER_ID_AND_ROLE_REQUIRED" }, 400);

      const { data: current } = await admin.from("user_profiles").select("*").eq("auth_user_id", user_id).single();
      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      if (current.is_protected && !callerIsSuper) return json({ error: "PROTECTED_ACCOUNT" }, 403);

      // Cannot escalate beyond own level
      const callerLevel = callerIsSuper ? 3 : 2;
      if (roleLevel(newRole) > callerLevel) return json({ error: "CANNOT_ESCALATE_BEYOND_OWN_ROLE" }, 403);

      const rolesArray = newRole === "super_admin" ? ["SUPERADMIN","ADMIN","DRIVER"] : newRole === "admin" ? ["ADMIN","DRIVER"] : ["DRIVER"];

      // Update auth metadata
      const { data: authUser } = await admin.auth.admin.getUserById(user_id);
      if (!authUser?.user) return json({ error: "AUTH_USER_NOT_FOUND" }, 404);
      await admin.auth.admin.updateUserById(user_id, {
        app_metadata: { ...authUser.user.app_metadata, role: newRole, roles: rolesArray },
        user_metadata: { ...authUser.user.user_metadata, role: newRole },
      });

      // Update user_profiles
      await admin.from("user_profiles").update({ role: newRole }).eq("auth_user_id", user_id);

      await writeAudit(admin, caller, "set_role", {
        target_user_id: user_id,
        before_state: { role: current.role },
        after_state: { role: newRole },
      });
      return json({ success: true });
    }

    // ── ACTIVATE ──
    if (action === "activate") {
      const { user_id } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: current } = await admin.from("user_profiles").select("*").eq("auth_user_id", user_id).single();
      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      if (current.account_status === "active") return json({ error: "ALREADY_ACTIVE" }, 400);
      if (current.account_status !== "pending_activation" && current.account_status !== "suspended") {
        return json({ error: "INVALID_TRANSITION" }, 400);
      }

      await admin.from("user_profiles").update({
        account_status: "active",
        activated_at: new Date().toISOString(),
        activated_by: caller.id,
      }).eq("auth_user_id", user_id);

      // Unban in auth
      await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" });

      await writeAudit(admin, caller, "activate", {
        target_user_id: user_id,
        before_state: { account_status: current.account_status },
        after_state: { account_status: "active" },
      });
      return json({ success: true });
    }

    // ── SUSPEND ──
    if (action === "suspend") {
      const { user_id, reason } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);
      if (user_id === caller.id) return json({ error: "CANNOT_SUSPEND_SELF" }, 400);

      const { data: current } = await admin.from("user_profiles").select("*").eq("auth_user_id", user_id).single();
      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      if (current.is_protected) return json({ error: "PROTECTED_ACCOUNT" }, 403);
      if (current.account_status !== "active") return json({ error: "INVALID_TRANSITION" }, 400);

      await admin.from("user_profiles").update({
        account_status: "suspended",
        suspended_at: new Date().toISOString(),
        suspended_by: caller.id,
        suspension_reason: reason ?? null,
      }).eq("auth_user_id", user_id);

      // Ban in auth
      await admin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });

      await writeAudit(admin, caller, "suspend", {
        target_user_id: user_id,
        before_state: { account_status: "active" },
        after_state: { account_status: "suspended", reason },
      });
      return json({ success: true });
    }

    // ── REACTIVATE (from suspended) ──
    if (action === "reactivate") {
      const { user_id } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: current } = await admin.from("user_profiles").select("*").eq("auth_user_id", user_id).single();
      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      if (current.account_status !== "suspended") return json({ error: "INVALID_TRANSITION" }, 400);

      await admin.from("user_profiles").update({
        account_status: "active",
        activated_at: new Date().toISOString(),
        activated_by: caller.id,
        suspended_at: null,
        suspended_by: null,
        suspension_reason: null,
      }).eq("auth_user_id", user_id);

      await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" });

      await writeAudit(admin, caller, "reactivate", {
        target_user_id: user_id,
        before_state: { account_status: "suspended" },
        after_state: { account_status: "active" },
      });
      return json({ success: true });
    }

    // ── ARCHIVE DRIVER ──
    if (action === "archive_driver") {
      const { user_id, reason } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: profile } = await admin.from("user_profiles").select("*").eq("auth_user_id", user_id).single();
      if (!profile) return json({ error: "NOT_FOUND" }, 404);
      if (profile.role !== "driver") return json({ error: "NOT_A_DRIVER" }, 400);
      if (!callerIsSuper && profile.org_id !== callerOrgId(caller)) return json({ error: "ORG_SCOPE_VIOLATION" }, 403);

      // Archive driver_profiles
      const { error: dpErr } = await admin.from("driver_profiles").update({
        archived_at: new Date().toISOString(),
        archived_by: caller.id,
        archive_reason: reason ?? null,
        is_active: false,
      }).eq("user_id", user_id);
      if (dpErr) return json({ error: dpErr.message }, 500);

      // Also suspend account by default
      await admin.from("user_profiles").update({
        account_status: "suspended",
        suspended_at: new Date().toISOString(),
        suspended_by: caller.id,
        suspension_reason: `Archived: ${reason ?? "No reason given"}`,
      }).eq("auth_user_id", user_id);

      await admin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });

      await writeAudit(admin, caller, "archive_driver", {
        target_user_id: user_id,
        after_state: { archived: true, reason, account_status: "suspended" },
      });
      return json({ success: true });
    }

    // ── RESTORE DRIVER ──
    if (action === "restore_driver") {
      const { user_id, reactivate_account, note } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: profile } = await admin.from("user_profiles").select("*").eq("auth_user_id", user_id).single();
      if (!profile) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && profile.org_id !== callerOrgId(caller)) return json({ error: "ORG_SCOPE_VIOLATION" }, 403);

      // Restore driver_profiles
      await admin.from("driver_profiles").update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
        restored_at: new Date().toISOString(),
        restored_by: caller.id,
        restore_note: note ?? null,
        is_active: true,
      }).eq("user_id", user_id);

      if (reactivate_account) {
        await admin.from("user_profiles").update({
          account_status: "active",
          activated_at: new Date().toISOString(),
          activated_by: caller.id,
          suspended_at: null,
          suspended_by: null,
          suspension_reason: null,
        }).eq("auth_user_id", user_id);
        await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      await writeAudit(admin, caller, "restore_driver", {
        target_user_id: user_id,
        after_state: { restored: true, reactivate_account: !!reactivate_account, note },
      });
      return json({ success: true });
    }

    // ── SYNC PROFILE (create user_profiles row from auth user if missing) ──
    if (action === "sync_profiles") {
      if (!callerIsSuper) return json({ error: "SUPER_ADMIN_ONLY" }, 403);

      const { data: authUsers } = await admin.auth.admin.listUsers();
      if (!authUsers?.users) return json({ error: "LIST_FAILED" }, 500);

      const { data: existing } = await admin.from("user_profiles").select("auth_user_id");
      const existingIds = new Set((existing ?? []).map((r: any) => r.auth_user_id));

      const toInsert = authUsers.users
        .filter((u: any) => !existingIds.has(u.id))
        .map((u: any) => ({
          auth_user_id: u.id,
          email: (u.email ?? "").toLowerCase(),
          first_name: u.user_metadata?.full_name?.split(" ")[0] ?? null,
          last_name: u.user_metadata?.full_name?.split(" ").slice(1).join(" ") ?? null,
          display_name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? null,
          org_id: u.app_metadata?.org_id ?? u.user_metadata?.org_id ?? null,
          role: u.app_metadata?.role ?? u.user_metadata?.role ?? "driver",
          account_status: "active",
        }));

      if (toInsert.length > 0) {
        const { error } = await admin.from("user_profiles").insert(toInsert);
        if (error) return json({ error: error.message }, 500);
      }

      return json({ success: true, synced: toInsert.length });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
