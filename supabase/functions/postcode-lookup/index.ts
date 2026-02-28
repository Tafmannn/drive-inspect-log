import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

function getComponent(components: any[], type: string): string {
  const c = components.find((c: any) => c.types?.includes(type));
  return c?.long_name ?? "";
}

function getShortComponent(components: any[], type: string): string {
  const c = components.find((c: any) => c.types?.includes(type));
  return c?.short_name ?? "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!MAPS_KEY) {
      return new Response(
        JSON.stringify({ results: [], error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { postcode } = await req.json();
    if (!postcode || !UK_POSTCODE_RE.test(postcode.trim())) {
      return new Response(
        JSON.stringify({ results: [], error: "Invalid UK postcode" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalised = postcode.trim().toUpperCase();

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", `${normalised}, UK`);
    url.searchParams.set("components", "country:GB");
    url.searchParams.set("key", MAPS_KEY);

    const resp = await fetch(url.toString());
    const data = await resp.json();

    if (data.status !== "OK" || !data.results?.length) {
      return new Response(
        JSON.stringify({ results: [], error: "No addresses found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = data.results.map((r: any, i: number) => {
      const c = r.address_components || [];
      const streetNumber = getComponent(c, "street_number");
      const route = getComponent(c, "route");
      const line1 = [streetNumber, route].filter(Boolean).join(" ") || r.formatted_address?.split(",")[0] || "";
      const town =
        getComponent(c, "postal_town") ||
        getComponent(c, "locality") ||
        getShortComponent(c, "administrative_area_level_2") ||
        "";
      const pc = getComponent(c, "postal_code") || normalised;

      return {
        id: `${i}-${pc}`,
        label: r.formatted_address || `${line1}, ${town}, ${pc}`,
        line1,
        town,
        postcode: pc,
      };
    });

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("postcode-lookup error:", msg);
    return new Response(
      JSON.stringify({ results: [], error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
