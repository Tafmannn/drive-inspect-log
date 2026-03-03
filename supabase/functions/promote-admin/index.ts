import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://id-preview--3a41afcd-01f5-4632-9ca9-6cdb511c4f9c.lovable.app",
  "https://axentra.lovable.app",
];

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
}

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = cors(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity with anon client
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
    const callerOrgId = caller.user_metadata?.org_id ?? null;
    const callerRole = caller.user_metadata?.role ?? null;

    // Only super_admin can promote
    if (callerRole !== "super_admin") {
      return new Response(JSON.stringify({ error: "SUPER_ADMIN_ONLY" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Use service role client for admin operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // ── LIST action ──
    if (body._action === "list") {
      const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
      if (listError) {
        return new Response(JSON.stringify({ error: "LIST_USERS_FAILED" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const users = listData.users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        role: u.user_metadata?.role ?? "driver",
        org_id: u.user_metadata?.org_id ?? null,
      }));
      return new Response(JSON.stringify({ users }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PROMOTE action ──
    const { email, org_id } = body;

    if (!email || typeof email !== "string") {
      return new Response(JSON.stringify({ error: "EMAIL_REQUIRED" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up target user by email
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

    // Compute target org_id
    const targetOrgId = org_id ?? callerOrgId;
    if (!targetOrgId) {
      return new Response(JSON.stringify({ error: "NO_TARGET_ORG" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update target user metadata — preserve existing, set role + org_id
    const existingMeta = targetUser.user_metadata ?? {};
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      targetUser.id,
      {
        user_metadata: {
          ...existingMeta,
          role: "admin",
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
      headers: { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" },
    });
  }
});
