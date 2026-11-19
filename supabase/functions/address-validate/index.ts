import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkStaff } from "../_shared/staffAuth.ts";
import { createIpRateLimiter } from "../_shared/rateLimit.ts";
import { assessAddressValidation, type AddressInput } from "../_shared/addressVerdict.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Staff-only + billed third-party API — see rateLimit.ts.
const rateLimiter = createIpRateLimiter(corsHeaders);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const limited = rateLimiter.check(req);
  if (limited) return limited;

  try {
    // ─── Staff only ───
    // Billed third-party API: only active staff may call it — see _shared/staffGate.ts.
    const denied = await checkStaff(req);
    if (denied) return json({ error: denied.error }, denied.status);

    const KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!KEY) return json({ error: "GOOGLE_PLACES_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const input: AddressInput = {
      line1: clean(body?.line1, 120),
      line2: clean(body?.line2, 120),
      city: clean(body?.city, 80),
      postcode: clean(body?.postcode, 12).toUpperCase(),
    };
    if (!input.line1 && !input.postcode) {
      return json({ error: "line1 or postcode required" }, 400);
    }

    const resp = await fetch("https://addressvalidation.googleapis.com/v1:validateAddress", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY },
      body: JSON.stringify({
        address: {
          regionCode: "GB",
          addressLines: [input.line1, input.line2].filter(Boolean),
          locality: input.city || undefined,
          postalCode: input.postcode || undefined,
        },
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // Google refused (billing off, API not on the key, quota). The form
      // carries on without a check, exactly as the other lookups degrade.
      console.warn("address-validate: Google refused:", resp.status, data?.error?.status ?? "");
      return json({ status: "unavailable", message: "Address check unavailable right now.", missing: [] });
    }

    return json(assessAddressValidation(data, input));
  } catch (e) {
    console.error("address-validate error:", e instanceof Error ? e.message : e);
    return json({ status: "unavailable", message: "Address check unavailable right now.", missing: [] });
  }
});
