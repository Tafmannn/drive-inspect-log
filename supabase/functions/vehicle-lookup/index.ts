import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkStaff } from "../_shared/staffAuth.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ─── Staff only ───
    // Billed DVLA API: only active staff (driver/admin/super_admin with a
    // live profile) may call it. Customer-portal logins are refused — see
    // _shared/staffGate.ts.
    const denied = await checkStaff(req);
    if (denied) {
      return jsonResponse({ success: false, error: denied.error }, denied.status);
    }

    // ─── Input validation ───
    const body = await req.json();
    if (!body?.registration || typeof body.registration !== "string") {
      return jsonResponse({ success: false, error: "BAD_REG" }, 400);
    }

    const DVLA_KEY = Deno.env.get("DVLA_VES_API_KEY");
    if (!DVLA_KEY) {
      return jsonResponse({ success: false, error: "DVLA_VES_API_KEY not configured" }, 500);
    }

    const registration = body.registration.replace(/\s+/g, "").toUpperCase();

    if (registration.length < 2 || registration.length > 8) {
      return jsonResponse({ success: false, error: "Invalid registration" }, 400);
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
        return jsonResponse({ success: false, error: "Vehicle not found" });
      }

      return jsonResponse({ success: false, error: "DVLA_ERROR" });
    }

    const vehicle = await dvlaRes.json();

    let year = "";
    if (vehicle.yearOfManufacture) {
      year = String(vehicle.yearOfManufacture);
    } else if (vehicle.monthOfFirstRegistration) {
      year = vehicle.monthOfFirstRegistration.split("-")[0];
    }

    return jsonResponse(
      {
        success: true,
        registration: vehicle.registrationNumber || registration,
        make: (vehicle.make || "").toUpperCase(),
        colour: (vehicle.colour || "").toUpperCase(),
        year,
        fuelType: vehicle.fuelType || null,
        engineCapacity: vehicle.engineCapacity || null,
        taxStatus: vehicle.taxStatus || null,
        motStatus: vehicle.motStatus || null,
      }
    );
  } catch (e: unknown) {
    console.error("vehicle-lookup error:", e);
    return jsonResponse({ success: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});