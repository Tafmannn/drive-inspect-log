// UK postcode lookup via the postcode-lookup edge function (Google first, with
// free fallbacks when Google refuses the request).

import { supabase } from '@/integrations/supabase/client';

export interface AddressSuggestion {
  id: string;
  label: string;
  line1: string;
  town: string;
  postcode: string;
}

export interface PostcodeLookupResult {
  results: AddressSuggestion[];
  /** Google refused the request (e.g. billing off), so results, if any, come from a free fallback. */
  degraded: boolean;
  /** The lookup service couldn't be reached, or answered with an error. */
  failed: boolean;
  /** Where the results came from: 'google', 'openstreetmap' or 'postcodes.io'. */
  source?: string;
}

/** Never throws: a lookup problem is reported in the result so the form can say so. */
export async function lookupPostcodeDetailed(postcode: string): Promise<PostcodeLookupResult> {
  try {
    const { data, error } = await supabase.functions.invoke('postcode-lookup', {
      body: { postcode: postcode.trim() },
    });
    if (error) {
      console.warn('[PostcodeLookup] invoke error:', error.message);
      return { results: [], degraded: false, failed: true };
    }
    return {
      results: data?.results ?? [],
      degraded: data?.degraded === true,
      failed: false,
      source: typeof data?.source === 'string' ? data.source : undefined,
    };
  } catch {
    return { results: [], degraded: false, failed: true };
  }
}

export async function lookupPostcode(postcode: string): Promise<AddressSuggestion[]> {
  return (await lookupPostcodeDetailed(postcode)).results;
}

/**
 * The one-line note shown under "Find Address". Empty when everything worked,
 * so a genuine "no match" and a lookup outage never read the same.
 */
export function postcodeLookupMessage(r: PostcodeLookupResult): string {
  if (r.failed) {
    return "Couldn't reach address lookup. Check your connection and enter the address manually.";
  }
  if (r.results.length === 0) {
    return r.degraded
      ? "Address lookup is unavailable right now. Please enter the address manually."
      : "No addresses found. Please enter the address manually.";
  }
  if (r.source === 'postcodes.io') {
    return "Street addresses aren't available right now, so only the area for this postcode was found. Please enter the street manually.";
  }
  if (r.degraded) {
    return "Address lookup is limited right now, so these results may be incomplete. You can edit the address below.";
  }
  return "";
}
