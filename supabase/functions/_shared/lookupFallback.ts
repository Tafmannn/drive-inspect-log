// Pure helpers for the postcode and company lookup functions.
//
// The lookups use Google first. When Google refuses a request (billing off on
// the Google Cloud project, API not enabled, quota used up) the functions fall
// back to free services and tell the app the lookup is "degraded", so the form
// can say so instead of silently showing "no results".
//
// Kept free of Deno/Supabase imports so it can be unit-tested under vitest
// (see src/test/lookup-fallback.test.ts).

export interface PostcodeSuggestion {
  id: string;
  label: string;
  line1: string;
  town: string;
  postcode: string;
}

const UK_POSTCODE_COMPACT = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;

/** "ls115qr" or " LS11  5QR " -> "LS11 5QR". Non-postcode input comes back trimmed and upper-cased. */
export function normalisePostcode(pc: string): string {
  const compact = pc.replace(/\s+/g, "").toUpperCase();
  return UK_POSTCODE_COMPACT.test(compact)
    ? `${compact.slice(0, -3)} ${compact.slice(-3)}`
    : pc.trim().toUpperCase();
}

/**
 * Google Places (New) refuses with a non-2xx status (403 for permission or
 * billing, 429 for quota) and an `error` object in the body.
 */
export function placesRefused(httpOk: boolean, body: unknown): boolean {
  if (!httpOk) return true;
  return !!body && typeof body === "object" && !!(body as { error?: unknown }).error;
}

const GEOCODE_REFUSALS = new Set(["REQUEST_DENIED", "OVER_DAILY_LIMIT", "OVER_QUERY_LIMIT"]);

/** Geocoding and legacy Places answer 200 with a `status` field; these values mean "refused", not "no match". */
export function geocodeRefused(status: unknown): boolean {
  return typeof status === "string" && GEOCODE_REFUSALS.has(status);
}

function firstString(...values: unknown[]): string {
  for (const v of values) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

/**
 * postcodes.io answers with the area for a postcode, not street addresses.
 * One suggestion with an empty first line, so picking it fills the town and
 * postcode and leaves the street for the user. The council area stands in for
 * the town (it is usually the same, and the user can edit it).
 */
export function parsePostcodesIo(json: unknown, postcode: string): PostcodeSuggestion[] {
  const result = (json as { result?: Record<string, unknown> } | null)?.result;
  if (!result || typeof result !== "object") return [];
  const pc = firstString(result.postcode) || normalisePostcode(postcode);
  const town = firstString(result.admin_district, result.admin_county, result.region);
  return [
    {
      id: `postcodes-io:${pc}`,
      label: town ? `${pc}, ${town} area (street not available)` : `${pc} (street not available)`,
      line1: "",
      town,
      postcode: pc,
    },
  ];
}

/**
 * A signal that aborts after `ms`, so a slow free service can't hang a lookup.
 * Uses AbortSignal.timeout where the runtime has it, otherwise a plain timer.
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
