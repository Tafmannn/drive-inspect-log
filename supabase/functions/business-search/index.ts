import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;

function parseGeocodeAddress(result: any, fallbackPostcode = "") {
  const components = result?.address_components || [];
  const getComp = (type: string) =>
    components.find((c: any) => c.types?.includes(type))?.long_name || "";
  const streetNum = getComp("street_number");
  const route = getComp("route");
  const premise = getComp("premise");
  const subpremise = getComp("subpremise");
  const postalTown = getComp("postal_town") || getComp("locality") || getComp("administrative_area_level_2") || "";
  const formatted = result?.formatted_address || "";
  const postcode = getComp("postal_code") || formatted.match(UK_POSTCODE_RE)?.[0]?.toUpperCase() || fallbackPostcode.toUpperCase();
  const firstLine = formatted.split(",")[0]?.trim() || "";
  const line1 = [subpremise, premise, streetNum, route].filter(Boolean).join(" ") || firstLine;
  return { line1, city: postalTown, postcode };
}

function parseNominatimAddress(item: any, fallbackPostcode = "") {
  const address = item?.address || {};
  const house = address.house_number || address.house_name || address.building || "";
  const street = address.road || address.pedestrian || address.footway || address.suburb || "";
  const line1 = [house, street].filter(Boolean).join(" ") || item?.name || item?.display_name?.split(",")?.[0]?.trim() || "";
  const city = address.city || address.town || address.village || address.hamlet || address.county || "";
  const postcode = address.postcode || item?.display_name?.match(UK_POSTCODE_RE)?.[0]?.toUpperCase() || fallbackPostcode.toUpperCase();
  return { line1, city, postcode };
}

async function searchNominatim(query: string, postcode?: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "gb");
  url.searchParams.set("limit", "8");
  url.searchParams.set("q", [query.trim(), postcode?.trim()].filter(Boolean).join(" "));

  const resp = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "AxentraVehicleLogistics/1.0 (business-search)",
    },
  });
  if (!resp.ok) return [];
  const data = await resp.json();
  if (!Array.isArray(data)) return [];
  return data.map((item: any, i: number) => {
    const parsed = parseNominatimAddress(item, postcode || "");
    return {
      placeId: item.place_id ? `nominatim:${item.place_id}:${i}` : `nominatim-${i}`,
      name: item.name || query.trim(),
      address: item.display_name || "",
      types: [item.type, item.class].filter(Boolean),
      line1: parsed.line1,
      city: parsed.city,
      postcode: parsed.postcode,
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ─── Optional auth ───
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const isPublicCall = !authHeader || authHeader === `Bearer ${supabaseAnonKey}`;
    if (!isPublicCall) {
      if (!authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error } = await supabase.auth.getClaims(token);
      if (error || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // Public and authenticated sessions can both use company search.

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
      console.log("business-search primary empty. status:", resp.status, "body:", JSON.stringify(placesData).slice(0, 500));
    }

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
        console.log("business-search retry empty. status:", resp2.status, "body:", JSON.stringify(data2).slice(0, 500));
      }

      if (!data2.places?.length) {
        // Legacy Places Text Search fallback (in case Places API New is not enabled)
        const legacyUrl = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
        legacyUrl.searchParams.set("query", [query.trim(), postcode?.trim()].filter(Boolean).join(" "));
        legacyUrl.searchParams.set("region", "gb");
        legacyUrl.searchParams.set("key", MAPS_KEY);
        const legacyResp = await fetch(legacyUrl.toString());
        const legacyData = await legacyResp.json();
        if (legacyData.status !== "OK" || !legacyData.results?.length) {
          console.log("business-search legacy fallback empty. status:", legacyData.status, "err:", legacyData.error_message);
          const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
          geoUrl.searchParams.set("address", [query.trim(), postcode?.trim(), "UK"].filter(Boolean).join(" "));
          geoUrl.searchParams.set("components", "country:GB");
          geoUrl.searchParams.set("key", MAPS_KEY);
          const geoResp = await fetch(geoUrl.toString());
          const geoData = await geoResp.json();
          if (geoData.status !== "OK" || !geoData.results?.length) {
            console.log("business-search geocode fallback empty. status:", geoData.status, "err:", geoData.error_message);
            const nominatimResults = await searchNominatim(query, postcode);
            if (nominatimResults.length) {
              return new Response(
                JSON.stringify({ results: nominatimResults }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
            return new Response(
              JSON.stringify({ results: [] }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const geocodeResults = geoData.results.slice(0, 8).map((r: any, i: number) => {
            const parsed = parseGeocodeAddress(r, postcode || "");
            return {
              placeId: r.place_id ? `geocode:${r.place_id}` : `geocode-${i}`,
              name: query.trim(),
              address: r.formatted_address || "",
              types: r.types || [],
              line1: parsed.line1,
              city: parsed.city,
              postcode: parsed.postcode,
            };
          });
          return new Response(
            JSON.stringify({ results: geocodeResults }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const legacyResults = legacyData.results.slice(0, 8).map((p: any) => {
          const parsed = parseGeocodeAddress({ formatted_address: p.formatted_address, address_components: [] }, postcode || "");
          return {
            placeId: p.place_id,
            name: p.name || "",
            address: p.formatted_address || "",
            types: p.types || [],
            line1: parsed.line1,
            city: parsed.city,
            postcode: parsed.postcode,
          };
        });
        return new Response(
          JSON.stringify({ results: legacyResults }),
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