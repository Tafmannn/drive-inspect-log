// Business search & place details via the Google Places edge functions

import { supabase } from '@/integrations/supabase/client';

export interface BusinessResult {
  placeId: string;
  name: string;
  address: string;
  types: string[];
  line1?: string;
  city?: string;
  postcode?: string;
  phone?: string | null;
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

export interface BusinessSearchOutcome {
  results: BusinessResult[];
  /** Google refused the request (e.g. billing off), so results are limited or missing. */
  degraded: boolean;
  /** The search service couldn't be reached, or answered with an error. */
  failed: boolean;
}

/** Never throws: a search problem is reported in the result so the form can say so. */
export async function searchBusinessesDetailed(
  query: string,
  postcode?: string
): Promise<BusinessSearchOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke('business-search', {
      body: { query, postcode: postcode || undefined },
    });
    if (error) {
      console.warn('[BusinessSearch] invoke error:', error.message);
      return { results: [], degraded: false, failed: true };
    }
    return { results: data?.results ?? [], degraded: data?.degraded === true, failed: false };
  } catch {
    return { results: [], degraded: false, failed: true };
  }
}

export async function searchBusinesses(
  query: string,
  postcode?: string
): Promise<BusinessResult[]> {
  return (await searchBusinessesDetailed(query, postcode)).results;
}

/** The note shown under the company box; empty when the search worked. */
export function businessSearchMessage(o: BusinessSearchOutcome): string {
  if (o.failed) {
    return "Couldn't reach company search. You can enter the company details manually.";
  }
  if (o.degraded) {
    return o.results.length > 0
      ? "Company search is limited right now, so results may be incomplete."
      : "Company search is unavailable right now. You can enter the company details manually.";
  }
  return "";
}

export async function getPlaceDetails(
  placeId: string
): Promise<PlaceDetails | null> {
  try {
    const { data, error } = await supabase.functions.invoke('place-details', {
      body: { placeId },
    });
    if (error) {
      console.warn('[PlaceDetails] invoke error:', error.message);
      return null;
    }
    if (data?.error) return null;
    return data as PlaceDetails;
  } catch {
    return null;
  }
}
