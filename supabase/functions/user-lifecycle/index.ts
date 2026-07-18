/**
 * user-lifecycle — unified edge function for user management.
 * Actions: list, get, create, resend_invite, update_profile, set_role, activate,
 *          suspend, reactivate, archive_driver, restore_driver, sync_profiles,
 *          update_driver_profile, get_permissions, set_permission_override
 *
 * Auth: JWT verified in code. Caller must be admin (org-scoped) or super_admin (global).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findAuthUserByEmail, listAllAuthUsers } from "../_shared/adminUsers.ts";
import { isSensitivePermissionBlockedForNonSuperAdmin } from "../_shared/permissionEscalation.ts";
import { renderActionEmailHtml, resolveRedirectUrl, sendBrandedEmail } from "../_shared/brandedEmail.ts";

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
  const r = String(role ?? "").toLowerCase().replace(/_/g, "");
  if (r === "superadmin") return 3;
  if (r === "admin") return 2;
  return 1;
}

// Authoritative caller org. After the caller's profile is loaded in the handler,
// caller.app_metadata.org_id is overwritten with the user_profiles value, so this
// reads only trusted data.
function callerOrgId(user: any): string | null {
  return user.app_metadata?.org_id ?? null;
}

async function writeAudit(
  admin: any,
  caller: any,
  action: string,
  opts: {
    target_user_id?: string;
    target_org_id?: string;
    before_state?: any;
    after_state?: any;
  } = {}
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
  } catch {
    // non-blocking
  }
}

// ── Branded invite email (Resend) ───────────────────────────────────────
// Supabase's built-in invite email is generic and comes from the shared
// supabase.io sender. Instead we mint the action link ourselves
// (auth.admin.generateLink) and deliver it in an Axentra-branded email via
// Resend (see _shared/brandedEmail.ts), reusing the RESEND_API_KEY already
// configured for send-pod-email. If Resend is not configured we fall back to
// Supabase's built-in email so invites never silently stop working.

function welcomeRedirectUrl(req: Request): string | undefined {
  return resolveRedirectUrl(req, "/welcome");
}

async function sendInviteEmail(opts: {
  to: string;
  firstName: string | null;
  actionLink: string;
  subject: string;
}): Promise<{ ok: boolean; detail?: unknown }> {
  return sendBrandedEmail({
    to: opts.to,
    subject: opts.subject,
    html: renderActionEmailHtml({
      firstName: opts.firstName,
      introHtml:
        "You've been invited to join <strong>Axentra Vehicle Logistics</strong>. " +
        "Click the button below to create your password and finish setting up your account.",
      buttonLabel: "Set up my account",
      actionLink: opts.actionLink,
      noteHtml:
        "This link is valid for 24 hours and can only be used once. If it has " +
        "expired, ask your administrator to resend the invitation.",
    }),
  });
}

async function loadDriverProfilesForUsers(admin: any, userIds: string[]) {
  if (!userIds.length) return {};

  const { data, error } = await admin
    .from("driver_profiles")
    .select(
      "id, user_id, is_active, archived_at, archived_by, archive_reason, restored_at, restored_by, restore_note, full_name, display_name, licence_expiry"
    )
    .in("user_id", userIds);

  if (error) throw new Error(error.message);

  return (data ?? []).reduce((acc: Record<string, any[]>, row: any) => {
    if (!acc[row.user_id]) acc[row.user_id] = [];
    acc[row.user_id].push(row);
    return acc;
  }, {});
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "UNAUTHENTICATED" }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate JWT via getClaims (does not depend on session store)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return json({ error: "UNAUTHENTICATED" }, 401);
    }

    const userId = claimsData.claims.sub as string;

    // Fetch full user via admin API (avoids session-store lookup)
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: adminUserData, error: adminUserErr } = await admin.auth.admin.getUserById(userId);
    if (adminUserErr || !adminUserData?.user) {
      return json({ error: "UNAUTHENTICATED" }, 401);
    }

    const caller = adminUserData.user;

    // AUTHORITATIVE authz (C3): role/org come ONLY from user_profiles, never
    // from JWT metadata (user_metadata is self-writable). We load the caller's
    // profile and overwrite caller.app_metadata/user_metadata from it so the
    // existing callerOrgId()/role helpers below operate on trusted data.
    const { data: callerProfile } = await admin
      .from("user_profiles")
      .select("role, org_id, account_status")
      .eq("auth_user_id", caller.id)
      .maybeSingle();

    const callerRole = String(callerProfile?.role ?? "driver");
    const callerIsSuper = callerRole === "super_admin";
    const callerIsAdmin = callerRole === "admin" || callerIsSuper;

    caller.app_metadata = {
      role: callerRole,
      org_id: callerProfile?.org_id ?? null,
      roles: callerIsSuper
        ? ["SUPERADMIN", "ADMIN", "DRIVER"]
        : callerRole === "admin"
        ? ["ADMIN", "DRIVER"]
        : ["DRIVER"],
    };
    caller.user_metadata = {};

    if (callerProfile?.account_status === "suspended") {
      return json({ error: "ACCOUNT_SUSPENDED" }, 403);
    }
    if (!callerIsAdmin) {
      return json({ error: "ADMIN_OR_SUPER_ADMIN_ONLY" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body._action ?? "list";
    // admin client already created above

    // ── LIST ──
    if (action === "list") {
      let query = admin.from("user_profiles").select("*");

      if (!callerIsSuper) {
        const orgId = callerOrgId(caller);
        if (!orgId) return json({ error: "NO_ORG_ID" }, 400);
        query = query.eq("org_id", orgId);
      } else if (body.org_id) {
        query = query.eq("org_id", body.org_id);
      }

      if (body.account_status) query = query.eq("account_status", body.account_status);
      if (body.role) query = query.eq("role", body.role);

      const { data: profiles, error } = await query
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) return json({ error: error.message }, 500);

      const userIds = (profiles ?? [])
        .map((p: any) => p.auth_user_id)
        .filter(Boolean);

      const driverProfilesByUserId = await loadDriverProfilesForUsers(admin, userIds);

      const users = (profiles ?? []).map((profile: any) => ({
        ...profile,
        driver_profiles: driverProfilesByUserId[profile.auth_user_id] ?? [],
      }));

      return json({ users });
    }

    // ── GET single user ──
    if (action === "get") {
      const { user_id } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: profile, error } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user_id)
        .maybeSingle();

      if (error) return json({ error: error.message }, 500);
      if (!profile) return json({ error: "NOT_FOUND" }, 404);

      if (!callerIsSuper && profile.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }

      const { data: driverProfiles, error: dpError } = await admin
        .from("driver_profiles")
        .select("*")
        .eq("user_id", user_id);

      if (dpError) return json({ error: dpError.message }, 500);

      return json({
        user: {
          ...profile,
          driver_profiles: driverProfiles ?? [],
        },
      });
    }

    // ── CREATE (invite + profile) ──
    if (action === "create") {
      const {
        email: rawEmail,
        role: newRole,
        org_id,
        first_name,
        last_name,
        display_name,
        phone,
      } = body;

      // Normalise + validate up front. GoTrue rejects malformed addresses
      // with a raw "Unable to validate email address: invalid format" that
      // previously surfaced to admins as an opaque 500 — a single stray
      // space from a mobile keyboard was enough to hit it (observed live).
      const email =
        typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
      if (!email) return json({ error: "EMAIL_REQUIRED" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "Please enter a valid email address." }, 400);
      }
      if (!org_id) return json({ error: "ORG_ID_REQUIRED" }, 400);

      const targetRole = newRole ?? "driver";

      if (!callerIsSuper && targetRole === "super_admin") {
        return json({ error: "CANNOT_GRANT_SUPER_ADMIN" }, 403);
      }

      if (!callerIsSuper && org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }

      const redirectTo = welcomeRedirectUrl(req);
      const useBrandedEmail = Boolean(Deno.env.get("RESEND_API_KEY"));

      // An already-registered email must NOT silently hijack the existing
      // account. The previous behaviour adopted the existing auth user
      // unconditionally and then overwrote their app_metadata and
      // user_profiles row (role, names, account_status → pending_activation),
      // corrupting a live account while reporting success — observed live
      // against an active driver. Adoption is only safe for ORPHANED auth
      // users (an auth record with no user_profiles row, e.g. a previous
      // half-failed create); anything else is a hard 409.
      const adoptOrphanOr409 = async (
        authErrMessage: string,
      ): Promise<Response | string> => {
        const existing = await findAuthUserByEmail(admin, email);
        if (!existing) return json({ error: authErrMessage }, 500);
        const { data: existingProfile } = await admin
          .from("user_profiles")
          .select("auth_user_id")
          .eq("auth_user_id", existing.id)
          .maybeSingle();
        if (existingProfile) {
          return json(
            { error: "A user with this email address already exists." },
            409,
          );
        }
        return existing.id;
      };

      let authUserId: string;
      // "sent"     — branded email delivered via Resend
      // "builtin"  — Supabase's default template was used (Resend unavailable)
      // "failed"   — user was created but no email went out; use Resend Invite
      let inviteEmail: "sent" | "builtin" | "failed";

      if (useBrandedEmail) {
        // generateLink creates the auth user WITHOUT sending Supabase's
        // generic template email; we deliver the link ourselves via Resend.
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { data: { role: targetRole, org_id }, redirectTo },
        });

        if (linkErr) {
          if (linkErr.message?.includes("already been registered")) {
            const adopted = await adoptOrphanOr409(linkErr.message);
            if (adopted instanceof Response) return adopted;
            authUserId = adopted;
            inviteEmail = "failed"; // no fresh link for an existing auth user here
          } else {
            return json({ error: linkErr.message }, 500);
          }
        } else {
          // Defensive: guard against a resolved call with no user/link payload
          // rather than letting `undefined` flow into updateUserById below.
          if (!linkData?.user?.id || !linkData?.properties?.action_link) {
            return json({ error: "Invite succeeded but returned no user" }, 500);
          }
          authUserId = linkData.user.id;
          const sent = await sendInviteEmail({
            to: email,
            firstName: first_name ?? null,
            actionLink: linkData.properties.action_link,
            subject: "You've been invited to Axentra",
          });
          // A failed send must not abort creation — the profile below still
          // gets created and the admin can use "Resend Invite" to retry.
          inviteEmail = sent.ok ? "sent" : "failed";
          if (!sent.ok) console.error("invite email send failed", sent.detail);
        }
      } else {
        // No Resend key: keep the original built-in Supabase invite email so
        // invites still arrive (generic template, but pointed at /welcome).
        const { data: inviteData, error: inviteErr } =
          await admin.auth.admin.inviteUserByEmail(email, {
            data: { role: targetRole, org_id },
            redirectTo,
          });

        if (inviteErr) {
          if (inviteErr.message?.includes("already been registered")) {
            const adopted = await adoptOrphanOr409(inviteErr.message);
            if (adopted instanceof Response) return adopted;
            authUserId = adopted;
            inviteEmail = "failed";
          } else {
            return json({ error: inviteErr.message }, 500);
          }
        } else {
          if (!inviteData?.user?.id) {
            return json({ error: "Invite succeeded but returned no user" }, 500);
          }
          authUserId = inviteData.user.id;
          inviteEmail = "builtin";
        }
      }

      await admin.auth.admin.updateUserById(authUserId, {
        app_metadata: {
          role: targetRole,
          org_id,
          roles:
            targetRole === "super_admin"
              ? ["SUPERADMIN", "ADMIN", "DRIVER"]
              : targetRole === "admin"
              ? ["ADMIN", "DRIVER"]
              : ["DRIVER"],
        },
        user_metadata: { role: targetRole, org_id },
      });

      const { error: profileErr } = await admin.from("user_profiles").upsert(
        {
          auth_user_id: authUserId,
          email: email.toLowerCase(),
          first_name: first_name ?? null,
          last_name: last_name ?? null,
          display_name: display_name ?? null,
          phone: phone ?? null,
          org_id,
          role: targetRole,
          account_status: "pending_activation",
        },
        { onConflict: "auth_user_id" }
      );

      if (profileErr) return json({ error: profileErr.message }, 500);

      await writeAudit(admin, caller, "create_user", {
        target_user_id: authUserId,
        target_org_id: org_id,
        after_state: { email, role: targetRole, org_id, invite_email: inviteEmail },
      });

      return json({ success: true, user_id: authUserId, invite_email: inviteEmail });
    }

    // ── RESEND INVITE ──
    // Re-sends the branded set-password email to a pending_activation user
    // whose original invite link expired (links are single-use, 24h). The
    // auth user already exists, so a "recovery" link is minted instead of an
    // "invite" link — both verify the email and land the user on /welcome
    // with a session so they can set their first password.
    if (action === "resend_invite") {
      const { user_id } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: target } = await admin
        .from("user_profiles")
        .select("email, first_name, org_id, account_status")
        .eq("auth_user_id", user_id)
        .maybeSingle();

      if (!target) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && target.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }
      if (target.account_status !== "pending_activation") {
        return json({ error: "USER_NOT_PENDING_ACTIVATION" }, 400);
      }

      const redirectTo = welcomeRedirectUrl(req);

      if (Deno.env.get("RESEND_API_KEY")) {
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: target.email,
          options: { redirectTo },
        });
        if (linkErr || !linkData?.properties?.action_link) {
          return json({ error: linkErr?.message ?? "LINK_GENERATION_FAILED" }, 500);
        }
        const sent = await sendInviteEmail({
          to: target.email,
          firstName: target.first_name,
          actionLink: linkData.properties.action_link,
          subject: "Your Axentra invite link",
        });
        if (!sent.ok) {
          console.error("invite email resend failed", sent.detail);
          return json({ error: "EMAIL_SEND_FAILED" }, 500);
        }
      } else {
        // No Resend key: Supabase's built-in recovery email still delivers a
        // working set-password link (generic template).
        const { error: resetErr } = await admin.auth.resetPasswordForEmail(
          target.email,
          { redirectTo }
        );
        if (resetErr) return json({ error: resetErr.message }, 500);
      }

      await writeAudit(admin, caller, "resend_invite", {
        target_user_id: user_id,
        target_org_id: target.org_id,
      });

      return json({ success: true });
    }

    // ── UPDATE PROFILE ──
    if (action === "update_profile") {
      const { user_id, ...fields } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: current } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user_id)
        .single();

      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }
      if (current.is_protected && !callerIsSuper) {
        return json({ error: "PROTECTED_ACCOUNT" }, 403);
      }

      const allowed = [
        "first_name",
        "last_name",
        "display_name",
        "phone",
        "internal_notes",
        "profile_photo_path",
      ];

      const updates: Record<string, any> = {};
      for (const k of allowed) {
        if (k in fields && k !== "_action" && k !== "user_id") {
          updates[k] = fields[k];
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await admin
          .from("user_profiles")
          .update(updates)
          .eq("auth_user_id", user_id);

        if (error) return json({ error: error.message }, 500);
      }

      await writeAudit(admin, caller, "update_profile", {
        target_user_id: user_id,
        before_state: {
          first_name: current.first_name,
          last_name: current.last_name,
          display_name: current.display_name,
          phone: current.phone,
          internal_notes: current.internal_notes,
          profile_photo_path: current.profile_photo_path,
        },
        after_state: updates,
      });

      return json({ success: true });
    }

    // ── UPDATE DRIVER PROFILE ──
    if (action === "update_driver_profile") {
      const { user_id, ...fields } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: profile } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user_id)
        .single();

      if (!profile) return json({ error: "NOT_FOUND" }, 404);
      if (profile.role !== "driver") return json({ error: "NOT_A_DRIVER" }, 400);
      if (!callerIsSuper && profile.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }
      if (profile.is_protected && !callerIsSuper) {
        return json({ error: "PROTECTED_ACCOUNT" }, 403);
      }

      const allowed = [
        "full_name", "display_name", "phone", "licence_number", "licence_expiry",
        "date_of_birth", "address_line1", "address_line2", "city", "postcode",
        "emergency_contact_name", "emergency_contact_phone", "trade_plate_number",
        "employment_type", "notes", "licence_categories",
      ];

      const dateFields = new Set(["licence_expiry", "date_of_birth", "start_date"]);
      const updates: Record<string, any> = {};
      for (const k of allowed) {
        if (k in fields && k !== "_action" && k !== "user_id") {
          // Convert empty strings to null for date columns
          updates[k] = dateFields.has(k) && fields[k] === "" ? null : fields[k];
        }
      }

      if (Object.keys(updates).length === 0) {
        return json({ error: "NO_FIELDS_TO_UPDATE" }, 400);
      }

      const { data: before } = await admin
        .from("driver_profiles")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

      if (!before) return json({ error: "DRIVER_PROFILE_NOT_FOUND" }, 404);

      const { error } = await admin
        .from("driver_profiles")
        .update(updates)
        .eq("user_id", user_id);

      if (error) return json({ error: error.message }, 500);

      await writeAudit(admin, caller, "update_driver_profile", {
        target_user_id: user_id,
        target_org_id: profile.org_id,
        before_state: Object.fromEntries(allowed.filter(k => k in updates).map(k => [k, before[k]])),
        after_state: updates,
      });

      return json({ success: true });
    }

    // ── GET PERMISSIONS ──
    if (action === "get_permissions") {
      const { user_id } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: targetProfile } = await admin
        .from("user_profiles")
        .select("role, org_id")
        .eq("auth_user_id", user_id)
        .single();

      if (!targetProfile) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && targetProfile.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }

      const { data: catalog } = await admin
        .from("permissions_catalog")
        .select("key, label, category, description, is_sensitive")
        .order("category")
        .order("key");

      const { data: roleDefaults } = await admin
        .from("role_permission_templates")
        .select("permission_key, is_allowed")
        .eq("role", targetProfile.role);

      const { data: overrides } = await admin
        .from("user_permission_overrides")
        .select("permission_key, grant_type, granted_by, reason, updated_at")
        .eq("user_id", user_id);

      return json({
        role: targetProfile.role,
        catalog: catalog ?? [],
        role_defaults: (roleDefaults ?? []).reduce((acc: Record<string, boolean>, r: any) => {
          acc[r.permission_key] = r.is_allowed;
          return acc;
        }, {}),
        overrides: (overrides ?? []).reduce((acc: Record<string, any>, r: any) => {
          acc[r.permission_key] = r;
          return acc;
        }, {}),
      });
    }

    // ── SET PERMISSION OVERRIDE ──
    if (action === "set_permission_override") {
      const { user_id, permission_key, grant_type, reason } = body;
      if (!user_id || !permission_key) {
        return json({ error: "USER_ID_AND_PERMISSION_KEY_REQUIRED" }, 400);
      }

      // grant_type: "allow", "deny", or "default" (delete override)
      if (!["allow", "deny", "default"].includes(grant_type)) {
        return json({ error: "INVALID_GRANT_TYPE" }, 400);
      }

      const { data: targetProfile } = await admin
        .from("user_profiles")
        .select("role, org_id, is_protected")
        .eq("auth_user_id", user_id)
        .single();

      if (!targetProfile) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && targetProfile.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }
      if (targetProfile.is_protected && !callerIsSuper) {
        return json({ error: "PROTECTED_ACCOUNT" }, 403);
      }

      // Check permission exists
      const { data: permDef } = await admin
        .from("permissions_catalog")
        .select("key, is_sensitive")
        .eq("key", permission_key)
        .single();

      if (!permDef) return json({ error: "PERMISSION_NOT_FOUND" }, 404);

      // Non-super admin escalation checks
      if (!callerIsSuper) {
        // Admin can't manage super_admin targets
        if (targetProfile.role === "super_admin") {
          return json({ error: "CANNOT_MANAGE_SUPER_ADMIN" }, 403);
        }
        // Admin can't manage sensitive permissions they don't have authority
        // over (SECURITY-002: previously hardcoded to 3 specific keys,
        // which let an admin manage any OTHER is_sensitive permission via
        // direct API call even though the UI hides all of them).
        if (isSensitivePermissionBlockedForNonSuperAdmin(permDef)) {
          return json({ error: "CANNOT_MANAGE_SENSITIVE_PERMISSION" }, 403);
        }
      }

      const callerEmail = caller.email ?? "";

      if (grant_type === "default") {
        // Delete override
        await admin
          .from("user_permission_overrides")
          .delete()
          .eq("user_id", user_id)
          .eq("permission_key", permission_key);

        // Audit
        await admin.from("permission_audit_log").insert({
          actor_user_id: caller.id,
          actor_email: callerEmail,
          target_user_id: user_id,
          permission_key,
          action: "delete_override",
          old_grant_type: null,
          new_grant_type: null,
          reason: reason ?? null,
        });
      } else {
        // Upsert override
        await admin
          .from("user_permission_overrides")
          .upsert(
            {
              user_id,
              permission_key,
              grant_type,
              granted_by: caller.id,
              reason: reason ?? null,
            },
            { onConflict: "user_id,permission_key" }
          );

        // Audit
        await admin.from("permission_audit_log").insert({
          actor_user_id: caller.id,
          actor_email: callerEmail,
          target_user_id: user_id,
          permission_key,
          action: grant_type === "allow" ? "grant_override" : "deny_override",
          old_grant_type: null,
          new_grant_type: grant_type,
          reason: reason ?? null,
        });
      }

      await writeAudit(admin, caller, "set_permission_override", {
        target_user_id: user_id,
        after_state: { permission_key, grant_type, reason },
      });

      return json({ success: true });
    }

    // ── SET ROLE ──
    if (action === "set_role") {
      const { user_id, role: newRole } = body;
      if (!user_id || !newRole) {
        return json({ error: "USER_ID_AND_ROLE_REQUIRED" }, 400);
      }

      // Prevent self-demotion / self-role-modification
      if (user_id === caller.id) {
        return json({ error: "CANNOT_MODIFY_OWN_ROLE" }, 403);
      }

      const { data: current } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user_id)
        .single();

      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }
      if (current.is_protected && !callerIsSuper) {
        return json({ error: "PROTECTED_ACCOUNT" }, 403);
      }

      const callerLevel = callerIsSuper ? 3 : 2;
      if (roleLevel(newRole) > callerLevel) {
        return json({ error: "CANNOT_ESCALATE_BEYOND_OWN_ROLE" }, 403);
      }

      const rolesArray =
        newRole === "super_admin"
          ? ["SUPERADMIN", "ADMIN", "DRIVER"]
          : newRole === "admin"
          ? ["ADMIN", "DRIVER"]
          : ["DRIVER"];

      const { data: authUser } = await admin.auth.admin.getUserById(user_id);
      if (!authUser?.user) return json({ error: "AUTH_USER_NOT_FOUND" }, 404);

      await admin.auth.admin.updateUserById(user_id, {
        app_metadata: {
          ...authUser.user.app_metadata,
          role: newRole,
          roles: rolesArray,
        },
        user_metadata: {
          ...authUser.user.user_metadata,
          role: newRole,
        },
      });

      const { error: updateError } = await admin
        .from("user_profiles")
        .update({ role: newRole })
        .eq("auth_user_id", user_id);

      if (updateError) return json({ error: updateError.message }, 500);

      await writeAudit(admin, caller, "set_role", {
        target_user_id: user_id,
        before_state: { role: current.role },
        after_state: { role: newRole },
      });

      return json({ success: true });
    }

    // ── SYNC ROLE FROM DB (restore JWT from user_profiles) ──
    if (action === "sync_role_from_db") {
      const { user_id } = body;
      const targetId = user_id ?? caller.id;

      const { data: profile } = await admin
        .from("user_profiles")
        .select("role, is_protected, org_id")
        .eq("auth_user_id", targetId)
        .single();

      if (!profile) return json({ error: "NOT_FOUND" }, 404);

      // Only allow: super_admin (by DB), protected accounts, or self-sync
      const dbIsSuperAdmin = profile.role === "super_admin";
      if (!dbIsSuperAdmin && !profile.is_protected && targetId !== caller.id) {
        return json({ error: "NOT_AUTHORIZED_FOR_SYNC" }, 403);
      }

      const dbRole = profile.role;
      const rolesArray =
        dbRole === "super_admin"
          ? ["SUPERADMIN", "ADMIN", "DRIVER"]
          : dbRole === "admin"
          ? ["ADMIN", "DRIVER"]
          : ["DRIVER"];

      const { data: authUser } = await admin.auth.admin.getUserById(targetId);
      if (!authUser?.user) return json({ error: "AUTH_USER_NOT_FOUND" }, 404);

      await admin.auth.admin.updateUserById(targetId, {
        app_metadata: {
          ...authUser.user.app_metadata,
          role: dbRole,
          org_id: profile.org_id,
          roles: rolesArray,
        },
        user_metadata: {
          ...authUser.user.user_metadata,
          role: dbRole,
        },
      });

      await writeAudit(admin, caller, "sync_role_from_db", {
        target_user_id: targetId,
        before_state: { jwt_role: authUser.user.app_metadata?.role },
        after_state: { jwt_role: dbRole, roles: rolesArray },
      });

      return json({ success: true, synced_role: dbRole, roles: rolesArray });
    }

    // ── ACTIVATE ──
    if (action === "activate") {
      const { user_id } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: current } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user_id)
        .single();

      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }
      if (current.account_status === "active") {
        return json({ error: "ALREADY_ACTIVE" }, 400);
      }
      if (
        current.account_status !== "pending_activation" &&
        current.account_status !== "suspended"
      ) {
        return json({ error: "INVALID_TRANSITION" }, 400);
      }

      const { error: updateError } = await admin
        .from("user_profiles")
        .update({
          account_status: "active",
          activated_at: new Date().toISOString(),
          activated_by: caller.id,
        })
        .eq("auth_user_id", user_id);

      if (updateError) return json({ error: updateError.message }, 500);

      await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" });

      // Auto-create driver_profiles row for driver-role users if missing
      if (current.role === "driver" && current.org_id) {
        const { data: existingDP } = await admin
          .from("driver_profiles")
          .select("id")
          .eq("user_id", user_id)
          .maybeSingle();

        if (!existingDP) {
          const displayName = [current.first_name, current.last_name]
            .filter(Boolean)
            .join(" ") || current.display_name || current.email;
          await admin.from("driver_profiles").insert({
            user_id,
            org_id: current.org_id,
            full_name: displayName,
            display_name: current.display_name ?? null,
            phone: current.phone ?? null,
            is_active: true,
          });
        }
      }

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

      const { data: current } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user_id)
        .single();

      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }
      if (current.is_protected) return json({ error: "PROTECTED_ACCOUNT" }, 403);
      if (current.account_status !== "active") {
        return json({ error: "INVALID_TRANSITION" }, 400);
      }

      const { error: updateError } = await admin
        .from("user_profiles")
        .update({
          account_status: "suspended",
          suspended_at: new Date().toISOString(),
          suspended_by: caller.id,
          suspension_reason: reason ?? null,
        })
        .eq("auth_user_id", user_id);

      if (updateError) return json({ error: updateError.message }, 500);

      await admin.auth.admin.updateUserById(user_id, { ban_duration: "876000h" });

      await writeAudit(admin, caller, "suspend", {
        target_user_id: user_id,
        before_state: { account_status: "active" },
        after_state: { account_status: "suspended", reason },
      });

      return json({ success: true });
    }

    // ── REACTIVATE ──
    if (action === "reactivate") {
      const { user_id } = body;
      if (!user_id) return json({ error: "USER_ID_REQUIRED" }, 400);

      const { data: current } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user_id)
        .single();

      if (!current) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && current.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }
      if (current.account_status !== "suspended") {
        return json({ error: "INVALID_TRANSITION" }, 400);
      }

      const { error: updateError } = await admin
        .from("user_profiles")
        .update({
          account_status: "active",
          activated_at: new Date().toISOString(),
          activated_by: caller.id,
          suspended_at: null,
          suspended_by: null,
          suspension_reason: null,
        })
        .eq("auth_user_id", user_id);

      if (updateError) return json({ error: updateError.message }, 500);

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

      const { data: profile } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user_id)
        .single();

      if (!profile) return json({ error: "NOT_FOUND" }, 404);
      if (profile.role !== "driver") return json({ error: "NOT_A_DRIVER" }, 400);
      if (!callerIsSuper && profile.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }

      const { error: dpErr } = await admin
        .from("driver_profiles")
        .update({
          archived_at: new Date().toISOString(),
          archived_by: caller.id,
          archive_reason: reason ?? null,
          is_active: false,
        })
        .eq("user_id", user_id);

      if (dpErr) return json({ error: dpErr.message }, 500);

      const { error: upErr } = await admin
        .from("user_profiles")
        .update({
          account_status: "suspended",
          suspended_at: new Date().toISOString(),
          suspended_by: caller.id,
          suspension_reason: `Archived: ${reason ?? "No reason given"}`,
        })
        .eq("auth_user_id", user_id);

      if (upErr) return json({ error: upErr.message }, 500);

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

      const { data: profile } = await admin
        .from("user_profiles")
        .select("*")
        .eq("auth_user_id", user_id)
        .single();

      if (!profile) return json({ error: "NOT_FOUND" }, 404);
      if (!callerIsSuper && profile.org_id !== callerOrgId(caller)) {
        return json({ error: "ORG_SCOPE_VIOLATION" }, 403);
      }

      const { error: dpErr } = await admin
        .from("driver_profiles")
        .update({
          archived_at: null,
          archived_by: null,
          archive_reason: null,
          restored_at: new Date().toISOString(),
          restored_by: caller.id,
          restore_note: note ?? null,
          is_active: true,
        })
        .eq("user_id", user_id);

      if (dpErr) return json({ error: dpErr.message }, 500);

      if (reactivate_account) {
        const { error: upErr } = await admin
          .from("user_profiles")
          .update({
            account_status: "active",
            activated_at: new Date().toISOString(),
            activated_by: caller.id,
            suspended_at: null,
            suspended_by: null,
            suspension_reason: null,
          })
          .eq("auth_user_id", user_id);

        if (upErr) return json({ error: upErr.message }, 500);

        await admin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
      }

      await writeAudit(admin, caller, "restore_driver", {
        target_user_id: user_id,
        after_state: {
          restored: true,
          reactivate_account: !!reactivate_account,
          note,
        },
      });

      return json({ success: true });
    }

    // ── CREATE ORG (super-admin only) ──
    // Authoritative org creation for the Super Admin dashboard. Lives here (not
    // in the legacy promote-admin function) so ALL super-admin user/org actions
    // authorize from user_profiles, never JWT metadata.
    if (action === "create_org") {
      if (!callerIsSuper) return json({ error: "SUPER_ADMIN_ONLY" }, 403);
      const { name } = body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return json({ error: "NAME_REQUIRED" }, 400);
      }
      const { data, error } = await admin
        .from("organisations")
        .insert({ name: name.trim() })
        .select()
        .single();
      if (error) return json({ error: error.message }, 500);

      await writeAudit(admin, caller, "create_org", {
        target_org_id: data.id,
        after_state: { name: name.trim() },
      });

      return json({ success: true, org: data });
    }

    // ── SYNC PROFILE ──
    if (action === "sync_profiles") {
      if (!callerIsSuper) return json({ error: "SUPER_ADMIN_ONLY" }, 403);

      let allAuthUsers;
      try {
        allAuthUsers = await listAllAuthUsers(admin);
      } catch {
        return json({ error: "LIST_FAILED" }, 500);
      }

      const { data: existing } = await admin
        .from("user_profiles")
        .select("auth_user_id");

      const existingIds = new Set((existing ?? []).map((r: any) => r.auth_user_id));

      const toInsert = allAuthUsers
        .filter((u: any) => !existingIds.has(u.id))
        .map((u: any) => ({
          auth_user_id: u.id,
          email: (u.email ?? "").toLowerCase(),
          first_name: u.user_metadata?.full_name?.split(" ")[0] ?? null,
          last_name: u.user_metadata?.full_name?.split(" ").slice(1).join(" ") ?? null,
          display_name: u.user_metadata?.name ?? u.user_metadata?.full_name ?? null,
          org_id: u.app_metadata?.org_id ?? u.user_metadata?.org_id ?? null,
          // role from app_metadata ONLY (service-controlled). Never trust
          // user_metadata.role here — it is self-writable and would launder a
          // self-asserted privileged role into user_profiles.
          role: ["admin", "super_admin"].includes(String(u.app_metadata?.role ?? ""))
            ? u.app_metadata.role
            : "driver",
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
