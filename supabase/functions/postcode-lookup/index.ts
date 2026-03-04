import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

serve(async (req) => {
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

    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_KEY,
        "X-Goog-FieldMask": "places.id,places.formattedAddress,places.addressComponents,places.displayName",
      },
      body: JSON.stringify({
        textQuery: normalised,
        regionCode: "GB",
        languageCode: "en",
        maxResultCount: 10,
        locationBias: {
          rectangle: {
            low: { latitude: 49.9, longitude: -8.2 },
            high: { latitude: 60.9, longitude: 1.8 },
          },
        },
      }),
    });

    const data = await resp.json();

    if (!data.places?.length) {
      const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      geoUrl.searchParams.set("address", `${normalised}, UK`);
      geoUrl.searchParams.set("components", "country:GB");
      geoUrl.searchParams.set("key", MAPS_KEY);

      const geoResp = await fetch(geoUrl.toString());
      const geoData = await geoResp.json();

      if (geoData.status !== "OK" || !geoData.results?.length) {
        return new Response(
          JSON.stringify({ results: [], error: "No addresses found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results = geoData.results.map((r: any, i: number) => {
        const c = r.address_components || [];
        const streetNum = c.find((x: any) => x.types?.includes("street_number"))?.long_name || "";
        const route = c.find((x: any) => x.types?.includes("route"))?.long_name || "";
        const line1 = [streetNum, route].filter(Boolean).join(" ") || r.formatted_address?.split(",")[0] || "";
        const town = c.find((x: any) => x.types?.includes("postal_town"))?.long_name
          || c.find((x: any) => x.types?.includes("locality"))?.long_name || "";
        const pc = c.find((x: any) => x.types?.includes("postal_code"))?.long_name || normalised;

        return { id: `geo-${i}`, label: r.formatted_address, line1, town, postcode: pc };
      });

      return new Response(
        JSON.stringify({ results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = data.places.map((place: any, i: number) => {
      const components = place.addressComponents || [];
      const getComp = (type: string) =>
        components.find((c: any) => c.types?.includes(type))?.longText || "";

      const streetNum = getComp("street_number");
      const route = getComp("route");
      const subpremise = getComp("subpremise");
      const premise = getComp("premise");
      
      let line1 = [subpremise, premise, streetNum, route].filter(Boolean).join(" ");
      if (!line1) {
        line1 = place.displayName?.text || place.formattedAddress?.split(",")[0] || "";
      }
      
      const town = getComp("postal_town") || getComp("locality") || "";
      const pc = getComp("postal_code") || normalised;

      return {
        id: place.id || `place-${i}`,
        label: place.formattedAddress || `${line1}, ${town}, ${pc}`,
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