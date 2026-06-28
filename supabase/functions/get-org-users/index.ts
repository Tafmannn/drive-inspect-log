import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateCaller, corsHeaders, jsonRes } from "../_shared/auth.ts";

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

    // Determine org scope. Admins are pinned to their own org; super-admins may
    // optionally filter by a given org, otherwise see all.
    let filterOrgId: string | null = null;
    if (!caller.isSuperAdmin) {
      filterOrgId = caller.orgId;
      if (!filterOrgId) return jsonRes({ error: "NO_ORG_ID" }, 400);
    } else {
      try {
        const body = await req.json();
        if (body?.org_id) filterOrgId = body.org_id;
      } catch {
        // no body — super-admin sees all orgs
      }
    }

    let query = admin
      .from("user_profiles")
      .select("auth_user_id, email, role, org_id")
      .order("email", { ascending: true })
      .limit(1000);

    if (filterOrgId) query = query.eq("org_id", filterOrgId);

    const { data, error } = await query;
    if (error) return jsonRes({ error: error.message }, 500);

    const users = (data ?? []).map((p) => ({
      id: p.auth_user_id,
      email: p.email ?? "",
      role: p.role ?? "driver",
      org_id: p.org_id ?? null,
    }));

    return jsonRes({ users });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonRes({ error: msg }, 500);
  }
});
