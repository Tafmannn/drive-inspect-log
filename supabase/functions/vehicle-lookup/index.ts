import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DVLA_KEY = Deno.env.get("DVLA_VES_API_KEY");
    if (!DVLA_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "DVLA_VES_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const registration = (body.registration || "").replace(/\s+/g, "").toUpperCase();

    if (!registration || registration.length < 2 || registration.length > 8) {
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
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: "DVLA lookup failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vehicle = await dvlaRes.json();

    // Extract year from yearOfManufacture or firstRegistration
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
