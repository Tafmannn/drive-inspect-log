/**
 * Builds a collision-resistant public enquiry reference: `AXE-YYYYMMDD-XXXX`
 * where XXXX is a random unambiguous base32 suffix (no I/O/0/1). Deterministic
 * date part aids support; random suffix avoids predictable/sequential IDs.
 *
 * A matching implementation lives in the edge function (Deno) which produces the
 * authoritative reference server-side; this copy exists for reuse and testing.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I, L, O, 0, 1

export function createEnquiryReference(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");

  let suffix = "";
  const cryptoObj = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  const bytes = new Uint8Array(4);
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 4; i++) suffix += ALPHABET[bytes[i] % ALPHABET.length];

  return `AXE-${yyyy}${mm}${dd}-${suffix}`;
}
