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
  const { data, error } = await supabase.functions.invoke('vehicle-lookup', {
    body: { registration: registration.trim() },
  });

  if (error) {
    console.warn('[DVLA] Lookup failed:', error.message);
    return { success: false, error: error.message };
  }

  if (data?.error) {
    return { success: false, error: data.error };
  }

  return data as VehicleLookupResult;
}
