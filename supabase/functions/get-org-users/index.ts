import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const callerOrgId = caller.user_metadata?.org_id ?? null;
    const callerRole = caller.user_metadata?.role ?? null;

    if (callerRole !== "super_admin" && callerRole !== "admin") {
      return new Response(JSON.stringify({ error: "ADMIN_OR_SUPER_ADMIN_ONLY" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let filterOrgId: string | null = null;

    // Parse optional body
    try {
      const body = await req.json();
      if (callerRole === "super_admin" && body?.org_id) {
        filterOrgId = body.org_id;
      }
    } catch {
      // No body or invalid JSON — that's fine
    }

    // Admin always restricted to own org
    if (callerRole === "admin") {
      filterOrgId = callerOrgId;
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) {
      return new Response(JSON.stringify({ error: "LIST_USERS_FAILED" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let users = listData.users.map((u) => ({
      id: u.id,
      email: u.email ?? "",
      role: u.user_metadata?.role ?? "driver",
      org_id: u.user_metadata?.org_id ?? null,
    }));

    if (filterOrgId) {
      users = users.filter((u) => u.org_id === filterOrgId);
    }

    return new Response(JSON.stringify({ users }), {
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