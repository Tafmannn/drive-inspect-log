import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  authenticateCaller,
  corsHeaders,
  jsonRes,
  rolesArrayFor,
} from "../_shared/auth.ts";
import { findAuthUserByEmail } from "../_shared/adminUsers.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authorise from user_profiles (never JWT user_metadata).
    const authResult = await authenticateCaller(req);
    if ("error" in authResult) return authResult.error;
    const { caller, admin } = authResult;

    if (caller.accountStatus === "suspended") {
      return jsonRes({ error: "ACCOUNT_SUSPENDED" }, 403);
    }
    if (!caller.isAdmin) {
      return jsonRes({ error: "ADMIN_OR_SUPER_ADMIN_ONLY" }, 403);
    }

    const body = await req.json();
    const { email, org_id } = body;
    if (!email || typeof email !== "string") {
      return jsonRes({ error: "EMAIL_REQUIRED" }, 400);
    }

    // Admins can only assign into their own org; super-admins may target any org.
    const targetOrgId = caller.isSuperAdmin ? (org_id ?? caller.orgId) : caller.orgId;
    if (!targetOrgId) return jsonRes({ error: "NO_TARGET_ORG" }, 400);

    // Locate the target auth user by email (paginates across all users).
    let targetUser;
    try {
      targetUser = await findAuthUserByEmail(admin, email);
    } catch {
      return jsonRes({ error: "LIST_USERS_FAILED" }, 500);
    }
    if (!targetUser) return jsonRes({ error: "USER_NOT_FOUND" }, 404);

    // Org admins cannot pull a user who already belongs to a different org.
    if (!caller.isSuperAdmin) {
      const { data: existingProfile } = await admin
        .from("user_profiles")
        .select("org_id")
        .eq("auth_user_id", targetUser.id)
        .maybeSingle();
      if (existingProfile?.org_id && existingProfile.org_id !== caller.orgId) {
        return jsonRes({ error: "CROSS_ORG_FORBIDDEN" }, 403);
      }
    }

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
    if (profileErr) return jsonRes({ error: profileErr.message }, 500);

    // Keep app_metadata (service-controlled) in sync for any JWT consumers.
    // user_metadata is intentionally NOT used for role/org anymore.
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
    if (updateError) return jsonRes({ error: "UPDATE_FAILED" }, 500);

    return jsonRes({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonRes({ error: msg }, 500);
  }
});
