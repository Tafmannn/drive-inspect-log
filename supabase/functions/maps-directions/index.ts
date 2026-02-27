import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// UK postcode regex (loose)
const UK_POSTCODE_RE =
  /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!MAPS_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_MAPS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { origin, destination } = await req.json();

    if (!origin || !destination) {
      return new Response(
        JSON.stringify({ error: "origin and destination are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate UK postcode format
    if (!UK_POSTCODE_RE.test(origin) || !UK_POSTCODE_RE.test(destination)) {
      return new Response(
        JSON.stringify({ error: "Invalid UK postcode format", valid: false }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
    url.searchParams.set("origin", `${origin}, UK`);
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
