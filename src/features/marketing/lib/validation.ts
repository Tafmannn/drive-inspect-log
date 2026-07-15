/** Shared, permissive validation helpers for marketing forms. */

// Deliberately permissive UK postcode check — allows manual review rather than
// rejecting legitimate edge cases. Accepts an optional single internal space.
const UK_POSTCODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

export function isLikelyUkPostcode(value: string): boolean {
  return UK_POSTCODE_RE.test(value.trim());
}

// Permissive phone check: digits, spaces, +, -, ( ) and at least 7 digits.
export function isLikelyPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 && /^[\d\s()+-]+$/.test(value.trim());
}
