// Business search & place details via Google Places edge functions

import { supabase } from '@/integrations/supabase/client';

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
    const { data, error } = await supabase.functions.invoke('business-search', {
      body: { query, postcode: postcode || undefined },
    });
    if (error) {
      console.warn('[BusinessSearch] invoke error:', error.message);
      return [];
    }
    return data?.results ?? [];
  } catch {
    return [];
  }
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
