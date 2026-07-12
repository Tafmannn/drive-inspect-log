import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function parsedDetailsFromGeocodeResult(result: any) {
  const components = result?.address_components || [];
  const getComp = (type: string): string =>
    components.find((c: any) => c.types?.includes(type))?.long_name || "";

  const subpremise = getComp("subpremise");
  const premise = getComp("premise");
  const streetNumber = getComp("street_number");
  const route = getComp("route");
  const city = getComp("postal_town") || getComp("locality") || getComp("administrative_area_level_2") || "";
  const postcode = getComp("postal_code") || "";
  const house = [subpremise, premise, streetNumber].filter(Boolean).join(" ");
  const street = route || "";
  const line1 = [house, street].filter(Boolean).join(" ") || result?.formatted_address?.split(",")?.[0]?.trim() || "";

  return {
    name: result?.formatted_address?.split(",")?.[0]?.trim() || "",
    types: result?.types || [],
    parsedAddress: { house, street, line1, city, postcode },
    phone: null,
  };
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
      const { data: claimsData, error: authError } = await supabase.auth.getClaims(token);
      if (authError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "UNAUTHENTICATED" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    // Public and authenticated sessions can both use place details lookup.

    // ─── Original logic ───
    const MAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!MAPS_KEY) {
      return new Response(
        JSON.stringify({ error: "API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { placeId } = await req.json();
    if (!placeId || typeof placeId !== "string") {
      return new Response(
        JSON.stringify({ error: "placeId required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geocodePlaceId = placeId.startsWith("geocode:") ? placeId.replace("geocode:", "") : "";
    if (geocodePlaceId) {
      const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      geoUrl.searchParams.set("place_id", geocodePlaceId);
      geoUrl.searchParams.set("key", MAPS_KEY);
      const geoResp = await fetch(geoUrl.toString());
      const geoData = await geoResp.json();
      if (geoData.status === "OK" && geoData.results?.[0]) {
        return new Response(
          JSON.stringify(parsedDetailsFromGeocodeResult(geoData.results[0])),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const resp = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}`,
      {
        headers: {
          "X-Goog-Api-Key": MAPS_KEY,
          "X-Goog-FieldMask":
            "displayName,formattedAddress,addressComponents,internationalPhoneNumber,nationalPhoneNumber,types",
        },
      }
    );

    const place = await resp.json();

    if (!place.displayName) {
      const geoUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      geoUrl.searchParams.set("place_id", placeId);
      geoUrl.searchParams.set("key", MAPS_KEY);
      const geoResp = await fetch(geoUrl.toString());
      const geoData = await geoResp.json();
      if (geoData.status === "OK" && geoData.results?.[0]) {
        return new Response(
          JSON.stringify(parsedDetailsFromGeocodeResult(geoData.results[0])),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Place not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const components = place.addressComponents || [];
    const getComp = (type: string): string =>
      components.find((c: any) => c.types?.includes(type))?.longText || "";

    const subpremise = getComp("subpremise");
    const premise = getComp("premise");
    const streetNumber = getComp("street_number");
    const route = getComp("route");
    const postalTown = getComp("postal_town");
    const locality = getComp("locality");
    const postalCode = getComp("postal_code");

    let house = "";
    if (subpremise && streetNumber) {
      house = `${subpremise}, ${streetNumber}`;
    } else if (subpremise) {
      house = subpremise;
    } else if (premise && streetNumber) {
      house = `${premise}, ${streetNumber}`;
    } else if (streetNumber) {
      house = streetNumber;
    } else if (premise) {
      house = premise;
    }

    const street = route || "";

    let line1 = "";
    if (house && street) {
      line1 = `${house} ${street}`;
    } else if (street) {
      line1 = street;
    } else if (house) {
      line1 = house;
    } else {
      line1 = place.formattedAddress?.split(",")[0] || "";
    }

    const city = postalTown || locality || "";
    const postcode = postalCode || "";
    const phone = place.internationalPhoneNumber || place.nationalPhoneNumber || null;

    return new Response(
      JSON.stringify({
        name: place.displayName?.text || "",
        types: place.types || [],
        parsedAddress: { house, street, line1, city, postcode },
        phone,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("place-details error:", e instanceof Error ? e.message : e);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});