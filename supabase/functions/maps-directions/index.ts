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

const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = cors(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ─── Auth ───
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgId = authData.user.user_metadata?.org_id ?? null;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "NO_ORG" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Original logic ───
    const MAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!MAPS_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { origin: originPC, destination } = body;

    if (!originPC || !destination) {
      return new Response(
        JSON.stringify({ error: "origin and destination are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!UK_POSTCODE_RE.test(originPC) || !UK_POSTCODE_RE.test(destination)) {
      return new Response(
        JSON.stringify({ error: "Invalid UK postcode format", valid: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${originPC}, UK`);
    url.searchParams.set("destination", `${destination}, UK`);
    url.searchParams.set("units", "imperial");
    url.searchParams.set("key", MAPS_KEY);

    const resp = await fetch(url.toString());
    const data = await resp.json();

    if (data.status === "ZERO_RESULTS" || !data.routes?.length) {
      return new Response(
        JSON.stringify({
          error: "No route found between these postcodes",
          valid: false,
          distanceMiles: null,
          etaMinutes: null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (data.status !== "OK") {
      return new Response(
        JSON.stringify({ error: `Maps API error: ${data.status}`, valid: false }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const leg = data.routes[0].legs[0];
    const distanceMeters = leg.distance.value;
    const durationSeconds = leg.duration.value;

    const distanceMiles = Math.round((distanceMeters / 1609.344) * 10) / 10;
    const etaMinutes = Math.round(durationSeconds / 60);

    return new Response(
      JSON.stringify({
        valid: true,
        distanceMiles,
        etaMinutes,
        distanceText: leg.distance.text,
        durationText: leg.duration.text,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" } }
    );
  }
});
