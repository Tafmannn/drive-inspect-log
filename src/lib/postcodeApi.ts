// UK Postcode lookup via Google Maps Geocoding edge function

import { supabase } from '@/integrations/supabase/client';

export interface AddressSuggestion {
  id: string;
  label: string;
  line1: string;
  town: string;
  postcode: string;
}

export async function lookupPostcode(postcode: string): Promise<AddressSuggestion[]> {
  try {
    const { data, error } = await supabase.functions.invoke('postcode-lookup', {
      body: { postcode: postcode.trim() },
    });
    if (error) {
      console.warn('[PostcodeLookup] invoke error:', error.message);
      return [];
    }
    return data?.results ?? [];
  } catch {
    return [];
  }
}
