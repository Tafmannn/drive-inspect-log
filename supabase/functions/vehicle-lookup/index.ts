import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkStaff } from "../_shared/staffAuth.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createIpRateLimiter } from "../_shared/rateLimit.ts";

// Same per-IP throttle as the other lookup functions; protects the DVLA quota.
const rateLimiter = createIpRateLimiter(corsHeaders);

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

  const limited = rateLimiter.check(req);
  if (limited) return limited;

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
    const body = await req.json().catch(() => null);
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

    // Call DVLA VES API. Outages, authentication failures and malformed
    // responses never surface raw details to the caller and never return a
    // partial vehicle record (the app must treat MOT/tax as unverified).
    let dvlaRes: Response;
    try {
      dvlaRes = await fetch("https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles", {
        method: "POST",
        headers: {
          "x-api-key": DVLA_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ registrationNumber: registration }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e: unknown) {
      console.error("DVLA unreachable:", e instanceof Error ? e.name : "error");
      return jsonResponse({ success: false, error: "DVLA_UNAVAILABLE" });
    }

    if (!dvlaRes.ok) {
      const errText = await dvlaRes.text().catch(() => "");
      console.error("DVLA lookup failed:", dvlaRes.status, errText.slice(0, 300));

      if (dvlaRes.status === 404) {
        return jsonResponse({ success: false, error: "Vehicle not found" });
      }
      if (dvlaRes.status === 401 || dvlaRes.status === 403) {
        return jsonResponse({ success: false, error: "DVLA_AUTH_FAILED" });
      }
      if (dvlaRes.status === 429 || dvlaRes.status >= 500) {
        return jsonResponse({ success: false, error: "DVLA_UNAVAILABLE" });
      }
      return jsonResponse({ success: false, error: "DVLA_ERROR" });
    }

    const vehicle = await dvlaRes.json().catch(() => null);
    if (!vehicle || typeof vehicle !== "object" || Array.isArray(vehicle)) {
      console.error("DVLA returned a non-object response");
      return jsonResponse({ success: false, error: "DVLA_INVALID_RESPONSE" });
    }

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
        taxStatus: typeof vehicle.taxStatus === "string" ? vehicle.taxStatus : null,
        motStatus: typeof vehicle.motStatus === "string" ? vehicle.motStatus : null,
        motExpiryDate: typeof vehicle.motExpiryDate === "string" ? vehicle.motExpiryDate : typeof vehicle.motExpiry === "string" ? vehicle.motExpiry : null,
        taxDueDate: typeof vehicle.taxDueDate === "string" ? vehicle.taxDueDate : null,
        markedAsScrapped: typeof vehicle.markedAsScrapped === "boolean" ? vehicle.markedAsScrapped : null,
        markedForExport: typeof vehicle.markedForExport === "boolean" ? vehicle.markedForExport : null,
        checkedAt: new Date().toISOString(),
      }
    );
  } catch (e: unknown) {
    console.error("vehicle-lookup error:", e instanceof Error ? e.message : e);
    return jsonResponse({ success: false, error: "INTERNAL" }, 500);
  }
});