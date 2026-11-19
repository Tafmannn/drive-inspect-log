import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { checkStaff } from "../_shared/staffAuth.ts";
import { createIpRateLimiter } from "../_shared/rateLimit.ts";
import { parseAutocomplete } from "../_shared/addressAutocomplete.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Staff-only + billed third-party API, called as the user types — see rateLimit.ts.
const rateLimiter = createIpRateLimiter(corsHeaders, { maxPerWindow: 60 });

function json(body: unknown, status = 200) {
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
    // Billed third-party API: only active staff may call it — see _shared/staffGate.ts.
    const denied = await checkStaff(req);
    if (denied) return json({ error: denied.error }, denied.status);

    const KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!KEY) return json({ results: [], degraded: true });

    const body = await req.json().catch(() => ({}));
    const input = typeof body?.input === "string" ? body.input.trim().slice(0, 120) : "";
    if (input.length < 3) return json({ results: [] });

    const resp = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY },
      body: JSON.stringify({
        input,
        languageCode: "en",
        regionCode: "GB",
        includedRegionCodes: ["gb"],
        // Addresses and streets only; businesses are covered by business-search.
        includedPrimaryTypes: ["street_address", "premise", "subpremise", "route"],
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.warn("address-autocomplete: Google refused:", resp.status, data?.error?.status ?? "");
      return json({ results: [], degraded: true });
    }

    return json({ results: parseAutocomplete(data) });
  } catch (e) {
    console.error("address-autocomplete error:", e instanceof Error ? e.message : e);
    return json({ results: [], degraded: true });
  }
});
