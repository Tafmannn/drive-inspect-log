import { supabase } from '@/integrations/supabase/client';

export interface VehicleLookupResult {
  success: boolean;
  registration?: string;
  make?: string;
  colour?: string;
  year?: string;
  fuelType?: string | null;
  engineCapacity?: number | null;
  taxStatus?: string | null;
  motStatus?: string | null;
  motExpiryDate?: string | null;
  taxDueDate?: string | null;
  markedAsScrapped?: boolean | null;
  markedForExport?: boolean | null;
  checkedAt?: string | null;
  error?: string;
}

/** User-facing text for the lookup function's error codes (unknown codes are shown as given). */
const LOOKUP_ERRORS: Record<string, string> = {
  BAD_REG: "Enter a valid registration.",
  "Invalid registration": "Enter a valid registration.",
  DVLA_UNAVAILABLE: "DVLA is not responding. Try again shortly; MOT and tax remain unverified.",
  DVLA_AUTH_FAILED: "DVLA lookup is not available (service authentication failed). Contact your admin.",
  DVLA_INVALID_RESPONSE: "DVLA returned an unreadable response. MOT and tax remain unverified.",
  DVLA_ERROR: "DVLA could not check this registration. MOT and tax remain unverified.",
  INTERNAL: "DVLA lookup failed. Please try again.",
};

export function lookupErrorMessage(code: string): string {
  return LOOKUP_ERRORS[code] ?? code;
}

export async function lookupVehicle(registration: string): Promise<VehicleLookupResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    return { success: false, error: 'Please sign in again before using DVLA lookup.' };
  }

  const { data, error } = await supabase.functions.invoke('vehicle-lookup', {
    body: { registration: registration.trim() },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    console.warn('[DVLA] Lookup failed:', error.message);
    if (error.message.includes('401')) {
      return { success: false, error: 'Please sign in again before using DVLA lookup.' };
    }
    return { success: false, error: 'DVLA lookup failed. Please try again.' };
  }

  if (data?.error) {
    return { success: false, error: lookupErrorMessage(String(data.error)) };
  }

  return data as VehicleLookupResult;
}
