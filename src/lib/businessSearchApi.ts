// Business search & place details via Google Places edge functions

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const headers = {
  "Content-Type": "application/json",
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
};

export interface BusinessResult {
  placeId: string;
  name: string;
  address: string;
  types: string[];
}

export interface PlaceDetails {
  name: string;
  types: string[];
  parsedAddress: {
    house: string;
    street: string;
    line1: string; // fallback combined
    city: string;
    postcode: string;
  };
  phone: string | null;
}

export async function searchBusinesses(
  query: string,
  postcode?: string
): Promise<BusinessResult[]> {
  try {
    const url = `https://${PROJECT_ID}.supabase.co/functions/v1/business-search`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, postcode: postcode || undefined }),
    });
    const data = await resp.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}

export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetails | null> {
  try {
    const url = `https://${PROJECT_ID}.supabase.co/functions/v1/place-details`;
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ placeId }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
