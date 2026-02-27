// Google Maps route calculation via edge function
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

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

  const url = `https://${PROJECT_ID}.supabase.co/functions/v1/maps-directions`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ origin: origin.trim(), destination: destination.trim() }),
  });

  const data = await resp.json();

  const result: RouteResult = {
    valid: data.valid ?? false,
    distanceMiles: data.distanceMiles ?? null,
    etaMinutes: data.etaMinutes ?? null,
    distanceText: data.distanceText,
    durationText: data.durationText,
    error: data.error,
  };

  if (result.valid) routeCache.set(key, result);
  return result;
}
