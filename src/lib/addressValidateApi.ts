// Advisory UK address check via the address-validate edge function.
// Never throws: any failure comes back as status "unavailable" so the form
// carries on exactly as it did before.

import { supabase } from '@/integrations/supabase/client';

export type AddressCheckStatus = 'ok' | 'corrected' | 'incomplete' | 'unconfirmed' | 'unavailable';

export interface AddressFields {
  line1: string;
  line2: string;
  city: string;
  postcode: string;
}

export interface AddressCheckResult {
  status: AddressCheckStatus;
  message: string;
  missing: string[];
  suggested?: AddressFields;
}

const UNAVAILABLE: AddressCheckResult = {
  status: 'unavailable',
  message: 'Address check unavailable right now.',
  missing: [],
};

export async function validateAddress(address: AddressFields): Promise<AddressCheckResult> {
  try {
    const { data, error } = await supabase.functions.invoke('address-validate', { body: address });
    if (error || !data || typeof data.status !== 'string') return UNAVAILABLE;
    return data as AddressCheckResult;
  } catch {
    return UNAVAILABLE;
  }
}
