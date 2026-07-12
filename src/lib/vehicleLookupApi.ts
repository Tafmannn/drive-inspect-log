import { supabase } from '@/integrations/supabase/client';

export interface VehicleLookupResult {
  success: boolean;
  registration?: string;
  make?: string;
  colour?: string;
  year?: string;
  fuelType?: string | null;
  error?: string;
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
    return { success: false, error: data.error };
  }

  return data as VehicleLookupResult;
}
