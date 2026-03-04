import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgId = data.user.user_metadata?.org_id ?? null;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "NO_ORG" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Original logic ───
    const MAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!MAPS_KEY) {
      return new Response(
        JSON.stringify({ results: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { query, postcode } = await req.json();
    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ results: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If postcode provided, geocode it first for location bias
    let locationBias: any = {
      rectangle: {
        low: { latitude: 49.9, longitude: -8.2 },
        high: { latitude: 60.9, longitude: 1.8 },
      },
    };

    if (postcode && typeof postcode === "string" && postcode.trim().length >= 3) {
      try {
        const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        geoUrl.searchParams.set("address", postcode.trim());
        geoUrl.searchParams.set("components", "country:GB");
        geoUrl.searchParams.set("key", MAPS_KEY);
        const geoResp = await fetch(geoUrl.toString());
        const geoData = await geoResp.json();
        if (geoData.status === "OK" && geoData.results?.[0]?.geometry?.location) {
          const loc = geoData.results[0].geometry.location;
          locationBias = {
            circle: {
              center: { latitude: loc.lat, longitude: loc.lng },
              radius: 15000.0,
            },
          };
        }
      } catch {
        // fallback to UK-wide bias
      }
    }

    // Use Places Text Search (New) for business search
    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.types",
      },
      body: JSON.stringify({
        textQuery: query.trim(),
        regionCode: "GB",
        languageCode: "en",
        maxResultCount: 8,
        locationBias,
        includedType: "establishment",
      }),
    });

    const placesData = await resp.json();

    if (!placesData.places?.length) {
      // Retry without includedType restriction
      const resp2 = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": MAPS_KEY,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.types",
        },
        body: JSON.stringify({
          textQuery: query.trim(),
          regionCode: "GB",
          languageCode: "en",
          maxResultCount: 8,
          locationBias,
        }),
      });
      const data2 = await resp2.json();

      if (!data2.places?.length) {
        return new Response(
          JSON.stringify({ results: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const results = data2.places.map((p: any) => ({
        placeId: p.id,
        name: p.displayName?.text || "",
        address: p.formattedAddress || "",
        types: p.types || [],
      }));

      return new Response(
        JSON.stringify({ results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = placesData.places.map((p: any) => ({
      placeId: p.id,
      name: p.displayName?.text || "",
      address: p.formattedAddress || "",
      types: p.types || [],
    }));

    return new Response(
      JSON.stringify({ results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("business-search error:", e instanceof Error ? e.message : e);
    return new Response(
      JSON.stringify({ results: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});