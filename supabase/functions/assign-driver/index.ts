import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  authenticateCaller,
  corsHeaders,
  jsonRes,
  rolesArrayFor,
  inactiveAccountError,
} from "../_shared/auth.ts";
import { findAuthUserByEmail } from "../_shared/adminUsers.ts";
import { decideAssignDriver } from "../_shared/assignDriverPolicy.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeAssignAudit(admin: any, caller: { id: string; email: string }, action: string, targetId: string, state: { before_state: unknown; after_state: unknown }) {
  try {
    await admin.from("admin_audit_log").insert({
      performed_by: caller.id,
      performed_by_email: caller.email ?? "",
      action,
      target_user_id: targetId,
      ...state,
    });
  } catch {
    // audit is best-effort; the decision itself has already been enforced
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authorise from user_profiles (never JWT user_metadata).
    const authResult = await authenticateCaller(req);
    if ("error" in authResult) return authResult.error;
    const { caller, admin } = authResult;

    // Only active accounts: pending (not yet activated) and suspended are refused.
    const inactive = inactiveAccountError(caller.accountStatus);
    if (inactive) return jsonRes({ error: inactive }, 403);
    if (!caller.isAdmin) {
      return jsonRes({ error: "ADMIN_OR_SUPER_ADMIN_ONLY" }, 403);
    }

    const body = await req.json();
    const { email, org_id } = body;
    if (!email || typeof email !== "string") {
      return jsonRes({ error: "EMAIL_REQUIRED" }, 400);
    }

    // Locate the target auth user by email (paginates across all users).
    let targetUser;
    try {
      targetUser = await findAuthUserByEmail(admin, email);
    } catch {
      return jsonRes({ error: "LIST_USERS_FAILED" }, 500);
    }
    if (!targetUser) return jsonRes({ error: "USER_NOT_FOUND" }, 404);

    // Read the target's current profile; fail closed if it can't be read.
    const { data: existing, error: readErr } = await admin
      .from("user_profiles")
      .select("role, org_id, is_protected, client_id")
      .eq("auth_user_id", targetUser.id)
      .maybeSingle();
    if (readErr) return jsonRes({ error: "PROFILE_READ_FAILED" }, 500);

    // Service role bypasses the DB guard trigger, so this is the guard:
    // drivers (or brand-new users) only, never a role change, never a
    // protected account, never another org's driver unless super-admin.
    const decision = decideAssignDriver(caller, org_id ?? null, existing ?? null);
    if (!decision.ok) {
      await writeAssignAudit(admin, caller, "assign_driver_denied", targetUser.id, {
        before_state: existing ?? null,
        after_state: { error: decision.error, requested_org_id: org_id ?? null },
      });
      return jsonRes({ error: decision.error }, decision.status);
    }
    const targetOrgId = decision.targetOrgId;

    // Authoritative write: user_profiles is the source of truth.
    const { error: profileErr } = await admin.from("user_profiles").upsert(
      {
        auth_user_id: targetUser.id,
        email: (targetUser.email ?? email).toLowerCase(),
        role: "driver",
        org_id: targetOrgId,
      },
      { onConflict: "auth_user_id" },
    );
    if (profileErr) return jsonRes({ error: "PROFILE_WRITE_FAILED" }, 500);

    // Keep app_metadata (service-controlled) in sync for any JWT consumers.
    const { error: updateError } = await admin.auth.admin.updateUserById(
      targetUser.id,
      {
        app_metadata: {
          ...targetUser.app_metadata,
          role: "driver",
          org_id: targetOrgId,
          roles: rolesArrayFor("driver"),
        },
      },
    );
    if (updateError) {
      // Put the profile back so DB and Auth don't disagree.
      if (existing) {
        await admin.from("user_profiles")
          .update({ org_id: existing.org_id })
          .eq("auth_user_id", targetUser.id);
      }
      return jsonRes({ error: "UPDATE_FAILED" }, 500);
    }

    await writeAssignAudit(admin, caller, "assign_driver", targetUser.id, {
      before_state: existing ?? null,
      after_state: { role: "driver", org_id: targetOrgId },
    });

    return jsonRes({ success: true });
  } catch (e) {
    console.error("assign-driver failed", e);
    return jsonRes({ error: "INTERNAL_ERROR" }, 500);
  }
});
