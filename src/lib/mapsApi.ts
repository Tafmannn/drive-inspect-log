// Google Maps route calculation via edge function
import { supabase } from '@/integrations/supabase/client';

const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

export function isValidUkPostcode(pc: string): boolean {
  return UK_POSTCODE_RE.test(pc.trim());
}

export interface RouteResult {
  valid: boolean;
  distanceMiles: number | null;
  etaMinutes: number | null;
  distanceText?: string;
  durationText?: string;
  error?: string;
}

// In-memory cache keyed by "origin|destination"
const routeCache = new Map<string, RouteResult>();

export async function calculateRoute(
  origin: string,
  destination: string
): Promise<RouteResult> {
  const key = `${origin.trim().toUpperCase()}|${destination.trim().toUpperCase()}`;
  if (routeCache.has(key)) return routeCache.get(key)!;

  const { data, error } = await supabase.functions.invoke('maps-directions', {
    body: { origin: origin.trim(), destination: destination.trim() },
  });

  if (error) {
    console.warn('[MapsDirections] invoke error:', error.message);
    return { valid: false, distanceMiles: null, etaMinutes: null, error: error.message };
  }

  const result: RouteResult = {
    valid: data?.valid ?? false,
    distanceMiles: data?.distanceMiles ?? null,
    etaMinutes: data?.etaMinutes ?? null,
    distanceText: data?.distanceText,
    durationText: data?.durationText,
    error: data?.error,
  };

  if (result.valid) routeCache.set(key, result);
  return result;
}
