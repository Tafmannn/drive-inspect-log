import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: authData, error: authError } = await anonClient.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const caller = authData.user;
    const callerOrgId =
      caller.user_metadata?.org_id ?? caller.app_metadata?.org_id ?? null;
    const directRole = String(
      caller.user_metadata?.role ?? caller.app_metadata?.role ?? ""
    ).toLowerCase();
    const roleSet = new Set(
      [
        ...((caller.user_metadata?.roles ?? []) as string[]),
        ...((caller.app_metadata?.roles ?? []) as string[]),
      ].map((r) => String(r).toUpperCase().replace(/-/g, "_"))
    );
    const callerEmail = (caller.email ?? "").toLowerCase();
    const isSuperAdmin =
      directRole === "super_admin" ||
      directRole === "superadmin" ||
      roleSet.has("SUPERADMIN") ||
      roleSet.has("SUPER_ADMIN") ||
      callerEmail === "axentravehiclelogistics@gmail.com" ||
      callerEmail === "info@axentravehicles.com";
    const isAdmin = isSuperAdmin || directRole === "admin" || roleSet.has("ADMIN");

    // Only super_admin or admin can assign drivers
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "ADMIN_OR_SUPER_ADMIN_ONLY" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, org_id } = body;

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "EMAIL_REQUIRED" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve destination org
    let targetOrgId: string | null;
    if (isAdmin && !isSuperAdmin) {
      // Admin can only assign into their own org
      targetOrgId = callerOrgId;
    } else {
      // super_admin can specify or fallback
      targetOrgId = org_id ?? callerOrgId;
    }

    if (!targetOrgId) {
      return new Response(JSON.stringify({ error: "NO_TARGET_ORG" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) {
      return new Response(JSON.stringify({ error: "LIST_USERS_FAILED" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUser = listData.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!targetUser) {
      return new Response(JSON.stringify({ error: "USER_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin cannot assign users from other orgs
    if (isAdmin && !isSuperAdmin) {
      const targetCurrentOrg = targetUser.user_metadata?.org_id ?? null;
      if (targetCurrentOrg && targetCurrentOrg !== callerOrgId) {
        return new Response(JSON.stringify({ error: "CROSS_ORG_FORBIDDEN" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const existingMeta = targetUser.user_metadata ?? {};
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUser.id,
      {
        user_metadata: {
          ...existingMeta,
          role: "driver",
          org_id: targetOrgId,
        },
      }
    );

    if (updateError) {
      return new Response(JSON.stringify({ error: "UPDATE_FAILED" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});