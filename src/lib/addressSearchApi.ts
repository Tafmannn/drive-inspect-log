// Type-ahead UK address search via the address-autocomplete edge function.
// Never throws: any failure returns no suggestions so the form carries on.

import { supabase } from '@/integrations/supabase/client';

export interface AddressPrediction {
  placeId: string;
  main: string;
  secondary: string;
  text: string;
}

export async function searchAddresses(input: string): Promise<AddressPrediction[]> {
  try {
    const { data, error } = await supabase.functions.invoke('address-autocomplete', {
      body: { input },
    });
    if (error) {
      console.warn('[AddressSearch] invoke error:', error.message);
      return [];
    }
    return data?.results ?? [];
  } catch {
    return [];
  }
}
