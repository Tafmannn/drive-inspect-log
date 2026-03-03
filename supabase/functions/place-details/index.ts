import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://id-preview--3a41afcd-01f5-4632-9ca9-6cdb511c4f9c.lovable.app",
  "https://axentra.lovable.app",
];

function cors(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, content-type, apikey",
  };
}

serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = cors(origin);

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
      { status: 500, headers: { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" } }
    );
  }
});
