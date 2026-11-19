// Pure parsing of a Google Places Autocomplete (New) response.
//
// Kept free of Deno/Supabase imports so it can be unit-tested under vitest
// (see src/test/address-autocomplete.test.ts) and reused by address-autocomplete.

export interface AddressPrediction {
  placeId: string;
  /** Headline, e.g. "10 Downing Street" */
  main: string;
  /** Rest of the address, e.g. "London, UK" */
  secondary: string;
  /** Full one-line text */
  text: string;
}

const MAX_RESULTS = 8;

export function parseAutocomplete(json: unknown): AddressPrediction[] {
  const suggestions = (json as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(suggestions)) return [];

  const out: AddressPrediction[] = [];
  for (const s of suggestions) {
    const p = (s as { placePrediction?: Record<string, any> } | null)?.placePrediction;
    if (!p || typeof p.placeId !== "string" || !p.placeId) continue;
    const text = typeof p.text?.text === "string" ? p.text.text : "";
    const main = typeof p.structuredFormat?.mainText?.text === "string" ? p.structuredFormat.mainText.text : text;
    const secondary = typeof p.structuredFormat?.secondaryText?.text === "string" ? p.structuredFormat.secondaryText.text : "";
    if (!main) continue;
    out.push({ placeId: p.placeId, main, secondary, text: text || [main, secondary].filter(Boolean).join(", ") });
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}
