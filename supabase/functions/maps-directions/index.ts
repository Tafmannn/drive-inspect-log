import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkStaff } from "../_shared/staffAuth.ts";
import { createIpRateLimiter } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const rateLimiter = createIpRateLimiter(corsHeaders);

const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const limited = rateLimiter.check(req);
  if (limited) return limited;

  try {
    // ─── Staff only ───
    // Billed third-party API: only active staff (driver/admin/super_admin
    // with a live profile) may call it. Signed-out callers and customer-portal
    // logins are refused — see _shared/staffGate.ts.
    const denied = await checkStaff(req);
    if (denied) {
      return new Response(JSON.stringify({ error: denied.error }), {
        status: denied.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Original logic ───
    const MAPS_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!MAPS_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_PLACES_API_KEY not configured" }),
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

    const resp = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_KEY,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { address: `${originPC}, UK` },
        destination: { address: `${destination}, UK` },
        travelMode: "DRIVE",
        regionCode: "GB",
        units: "IMPERIAL",
      }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      const apiStatus = data.error?.status || data.error?.message || `HTTP ${resp.status}`;
      return new Response(
        JSON.stringify({ error: `Maps API error: ${apiStatus}`, valid: false }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data.routes?.length) {
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

    const route = data.routes[0];
    const distanceMeters = Number(route.distanceMeters ?? 0);
    const durationSeconds = Number.parseFloat(route.duration);
    if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) {
      throw new Error("Invalid route response from Maps API");
    }

    const distanceMiles = Math.round((distanceMeters / 1609.344) * 10) / 10;
    const etaMinutes = Math.round(durationSeconds / 60);
    const hours = Math.floor(etaMinutes / 60);
    const minutes = etaMinutes % 60;
    const durationText = hours
      ? `${hours} ${hours === 1 ? "hour" : "hours"}${minutes ? ` ${minutes} mins` : ""}`
      : `${minutes} mins`;

    return new Response(
      JSON.stringify({
        valid: true,
        distanceMiles,
        etaMinutes,
        distanceText: `${distanceMiles} mi`,
        durationText,
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