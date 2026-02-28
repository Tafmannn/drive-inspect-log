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

    // Use Places (New) API to get details
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
      return new Response(
        JSON.stringify({ error: "Place not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse address components
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

    // Build house (number/name) and street separately
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

    // Fallback combined line1 for when split isn't clean
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

    // Phone: prefer international, then national
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
