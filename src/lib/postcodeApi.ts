// UK Postcode lookup via Google Maps Geocoding edge function

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export interface AddressSuggestion {
  id: string;
  label: string;
  line1: string;
  town: string;
  postcode: string;
}

export async function lookupPostcode(postcode: string): Promise<AddressSuggestion[]> {
  try {
    const url = `https://${PROJECT_ID}.supabase.co/functions/v1/postcode-lookup`;
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ postcode: postcode.trim() }),
    });

    const data = await resp.json();
    return data.results ?? [];
  } catch {
    return [];
  }
}
