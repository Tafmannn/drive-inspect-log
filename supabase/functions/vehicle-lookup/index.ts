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

    // ─── Input validation ───
    const body = await req.json();
    if (!body?.registration || typeof body.registration !== "string") {
      return new Response(
        JSON.stringify({ error: "BAD_REG" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const DVLA_KEY = Deno.env.get("DVLA_VES_API_KEY");
    if (!DVLA_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "DVLA_VES_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const registration = body.registration.replace(/\s+/g, "").toUpperCase();

    if (registration.length < 2 || registration.length > 8) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid registration" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call DVLA VES API
    const dvlaRes = await fetch("https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles", {
      method: "POST",
      headers: {
        "x-api-key": DVLA_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ registrationNumber: registration }),
    });

    if (!dvlaRes.ok) {
      const errText = await dvlaRes.text();
      console.error("DVLA lookup failed:", dvlaRes.status, errText);

      if (dvlaRes.status === 404) {
        return new Response(
          JSON.stringify({ success: false, error: "Vehicle not found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "DVLA_ERROR" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vehicle = await dvlaRes.json();

    let year = "";
    if (vehicle.yearOfManufacture) {
      year = String(vehicle.yearOfManufacture);
    } else if (vehicle.monthOfFirstRegistration) {
      year = vehicle.monthOfFirstRegistration.split("-")[0];
    }

    return new Response(
      JSON.stringify({
        success: true,
        registration: vehicle.registrationNumber || registration,
        make: (vehicle.make || "").toUpperCase(),
        colour: (vehicle.colour || "").toUpperCase(),
        year,
        fuelType: vehicle.fuelType || null,
        engineCapacity: vehicle.engineCapacity || null,
        taxStatus: vehicle.taxStatus || null,
        motStatus: vehicle.motStatus || null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: unknown) {
    console.error("vehicle-lookup error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" } }
    );
  }
});
