// portal-access — admin management of a client's customer-portal logins.
// Actions: list, invite, resend, suspend, reactivate, remove.
//
// AUTHORIZATION: caller must be an active admin of the client's own org (or a
// super-admin), checked from user_profiles via authenticateCaller — never JWT
// metadata. Every per-user action additionally requires the target to be a
// role='client' profile of THIS client, so this function can never touch a
// staff (driver/admin) account.
//
// Portal identities are written here with the service role; the database
// constraint user_profiles_client_role_consistency guarantees the result is
// always role='client' + client_id + org_id NULL.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateCaller, corsHeaders, jsonRes } from "../_shared/auth.ts";
import { findAuthUserByEmail } from "../_shared/adminUsers.ts";
import { escapeHtml, renderActionEmailHtml, resolveRedirectUrl, sendBrandedEmail } from "../_shared/brandedEmail.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function audit(admin: SupabaseClient, callerId: string, callerEmail: string, action: string, opts: {
  target_user_id?: string;
  target_org_id?: string;
  after_state?: unknown;
}) {
  try {
    await admin.from("admin_audit_log").insert({
      performed_by: callerId,
      performed_by_email: callerEmail,
      action,
      target_user_id: opts.target_user_id ?? null,
      target_org_id: opts.target_org_id ?? null,
      after_state: opts.after_state ?? null,
    });
  } catch {
    // non-blocking
  }
}

async function sendPortalEmail(opts: {
  to: string;
  firstName: string | null;
  operatorName: string;
  clientName: string;
  actionLink: string;
  isResend: boolean;
}) {
  return sendBrandedEmail({
    to: opts.to,
    subject: opts.isResend
      ? `Your ${opts.operatorName} customer portal link`
      : `You've been invited to the ${opts.operatorName} customer portal`,
    html: renderActionEmailHtml({
      firstName: opts.firstName,
      introHtml:
        `<strong>${escapeHtml(opts.operatorName)}</strong> has given you access to their customer portal for ` +
        `<strong>${escapeHtml(opts.clientName)}</strong>. Track your vehicle moves, see delivery photos and ` +
        "signatures, and download your invoices — any time.",
      buttonLabel: opts.isResend ? "Set my password" : "Set up my portal access",
      actionLink: opts.actionLink,
      noteHtml:
        "This link is valid for 24 hours and can only be used once. If it has expired, " +
        "ask your contact to send a new one.",
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authResult = await authenticateCaller(req);
    if ("error" in authResult) return authResult.error;
    const { caller, admin } = authResult;

    if (caller.accountStatus === "suspended") return jsonRes({ error: "ACCOUNT_SUSPENDED" }, 403);
    if (!caller.isAdmin) return jsonRes({ error: "ADMIN_OR_SUPER_ADMIN_ONLY" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const clientId = typeof body?.client_id === "string" ? body.client_id : "";
    if (!UUID_RE.test(clientId)) return jsonRes({ error: "INVALID_CLIENT_ID" }, 400);

    const { data: client } = await admin
      .from("clients")
      .select("id, org_id, name, company, trading_name, is_active")
      .eq("id", clientId)
      .maybeSingle();
    if (!client || (!caller.isSuperAdmin && client.org_id !== caller.orgId)) {
      return jsonRes({ error: "NOT_FOUND" }, 404);
    }
    const clientName = client.trading_name || client.company || client.name;

    // ── LIST ──
    if (action === "list") {
      const [{ data: users, error }, { count: linkedJobs }] = await Promise.all([
        admin
          .from("user_profiles")
          .select("auth_user_id, email, first_name, last_name, display_name, account_status, created_at")
          .eq("client_id", clientId)
          .eq("role", "client")
          .order("created_at", { ascending: true }),
        admin
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .eq("is_hidden", false),
      ]);
      if (error) return jsonRes({ error: error.message }, 500);

      // Has the user ever signed in? Tells the admin whether an invite is still pending.
      const withSignIn = await Promise.all(
        (users ?? []).map(async (u) => {
          const { data } = await admin.auth.admin.getUserById(u.auth_user_id);
          return { ...u, last_sign_in_at: data?.user?.last_sign_in_at ?? null };
        }),
      );
      return jsonRes({ users: withSignIn, linked_jobs: linkedJobs ?? 0, client_active: client.is_active });
    }

    const { data: org } = await admin
      .from("organisations")
      .select("name, branding_name")
      .eq("id", client.org_id)
      .maybeSingle();
    const operatorName = org?.branding_name || org?.name || "Axentra";
    const redirectTo = resolveRedirectUrl(req, "/welcome");

    // ── INVITE ──
    if (action === "invite") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const firstName = typeof body.first_name === "string" ? body.first_name.trim() || null : null;
      const lastName = typeof body.last_name === "string" ? body.last_name.trim() || null : null;
      if (!EMAIL_RE.test(email)) return jsonRes({ error: "Please enter a valid email address." }, 400);
      if (!client.is_active) return jsonRes({ error: "This client is inactive. Reactivate it before inviting portal users." }, 400);

      // Never adopt or convert an existing account. A staff member's email
      // must not silently become a client login, and vice versa.
      const existing = await findAuthUserByEmail(admin, email);
      if (existing) {
        const { data: existingProfile } = await admin
          .from("user_profiles")
          .select("role, client_id")
          .eq("auth_user_id", existing.id)
          .maybeSingle();
        if (existingProfile?.role === "client" && existingProfile.client_id === clientId) {
          return jsonRes({ error: "This person already has portal access for this client." }, 409);
        }
        return jsonRes({ error: "This email address already belongs to another Axentra account." }, 409);
      }

      let authUserId: string;
      let inviteEmail: "sent" | "builtin" | "failed";

      if (Deno.env.get("RESEND_API_KEY")) {
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "invite",
          email,
          options: { redirectTo },
        });
        if (linkErr || !linkData?.user?.id || !linkData?.properties?.action_link) {
          return jsonRes({ error: linkErr?.message ?? "Invite failed" }, 500);
        }
        authUserId = linkData.user.id;
        const sent = await sendPortalEmail({
          to: email, firstName, operatorName, clientName,
          actionLink: linkData.properties.action_link, isResend: false,
        });
        inviteEmail = sent.ok ? "sent" : "failed";
        if (!sent.ok) console.error("portal invite email failed", sent.detail);
      } else {
        const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
        if (inviteErr || !inviteData?.user?.id) {
          return jsonRes({ error: inviteErr?.message ?? "Invite failed" }, 500);
        }
        authUserId = inviteData.user.id;
        inviteEmail = "builtin";
      }

      // app_metadata is informational only (authz always reads user_profiles).
      await admin.auth.admin.updateUserById(authUserId, {
        app_metadata: { role: "client", roles: ["CLIENT"] },
      });

      // handle_new_user has already created a baseline row (role driver,
      // org NULL, pending) for this auth user; this turns it into the portal
      // identity in a single statement.
      const { error: profileErr } = await admin.from("user_profiles").upsert(
        {
          auth_user_id: authUserId,
          email,
          first_name: firstName,
          last_name: lastName,
          display_name: [firstName, lastName].filter(Boolean).join(" ") || null,
          role: "client",
          client_id: clientId,
          org_id: null,
          account_status: "active",
        },
        { onConflict: "auth_user_id" },
      );
      if (profileErr) {
        // Don't leave a dangling auth user that can't become a portal user.
        await admin.from("user_profiles").delete().eq("auth_user_id", authUserId);
        await admin.auth.admin.deleteUser(authUserId);
        return jsonRes({ error: profileErr.message }, 500);
      }

      await audit(admin, caller.id, caller.email, "portal_invite", {
        target_user_id: authUserId,
        target_org_id: client.org_id,
        after_state: { email, client_id: clientId, invite_email: inviteEmail },
      });
      return jsonRes({ success: true, user_id: authUserId, invite_email: inviteEmail });
    }

    // ── Per-user actions: target must be a portal user of THIS client ──
    const userId = typeof body?.user_id === "string" ? body.user_id : "";
    if (!UUID_RE.test(userId)) return jsonRes({ error: "INVALID_USER_ID" }, 400);
    const { data: target } = await admin
      .from("user_profiles")
      .select("auth_user_id, email, first_name, role, client_id, account_status")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (!target || target.role !== "client" || target.client_id !== clientId) {
      return jsonRes({ error: "NOT_FOUND" }, 404);
    }

    if (action === "resend") {
      if (target.account_status !== "active") {
        return jsonRes({ error: "Reactivate this login before sending a new link." }, 400);
      }
      if (Deno.env.get("RESEND_API_KEY")) {
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "recovery",
          email: target.email,
          options: { redirectTo },
        });
        if (linkErr || !linkData?.properties?.action_link) {
          return jsonRes({ error: linkErr?.message ?? "LINK_GENERATION_FAILED" }, 500);
        }
        const sent = await sendPortalEmail({
          to: target.email, firstName: target.first_name, operatorName, clientName,
          actionLink: linkData.properties.action_link, isResend: true,
        });
        if (!sent.ok) return jsonRes({ error: "EMAIL_SEND_FAILED" }, 500);
      } else {
        const { error } = await admin.auth.resetPasswordForEmail(target.email, { redirectTo });
        if (error) return jsonRes({ error: error.message }, 500);
      }
      await audit(admin, caller.id, caller.email, "portal_resend", { target_user_id: userId, target_org_id: client.org_id });
      return jsonRes({ success: true });
    }

    if (action === "suspend" || action === "reactivate") {
      const next = action === "suspend" ? "suspended" : "active";
      const { error } = await admin
        .from("user_profiles")
        .update({
          account_status: next,
          suspended_at: next === "suspended" ? new Date().toISOString() : null,
          suspended_by: next === "suspended" ? caller.id : null,
        })
        .eq("auth_user_id", userId)
        .eq("role", "client")
        .eq("client_id", clientId);
      if (error) return jsonRes({ error: error.message }, 500);
      await audit(admin, caller.id, caller.email, `portal_${action}`, {
        target_user_id: userId, target_org_id: client.org_id, after_state: { account_status: next },
      });
      return jsonRes({ success: true, account_status: next });
    }

    if (action === "remove") {
      const { error: delProfileErr } = await admin
        .from("user_profiles")
        .delete()
        .eq("auth_user_id", userId)
        .eq("role", "client")
        .eq("client_id", clientId);
      if (delProfileErr) return jsonRes({ error: delProfileErr.message }, 500);
      const { error: delAuthErr } = await admin.auth.admin.deleteUser(userId);
      if (delAuthErr) console.error("portal remove: auth user delete failed", delAuthErr.message);
      await audit(admin, caller.id, caller.email, "portal_remove", {
        target_user_id: userId, target_org_id: client.org_id, after_state: { email: target.email },
      });
      return jsonRes({ success: true });
    }

    return jsonRes({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e) {
    console.error("portal-access error:", e instanceof Error ? e.message : e);
    return jsonRes({ error: "INTERNAL_ERROR" }, 500);
  }
});
