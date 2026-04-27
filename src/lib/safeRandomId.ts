/**
 * Cryptographically-strong random identifier helpers.
 *
 * Use these for any value that influences security, integrity, or
 * collision-resistance: upload references, submission session IDs,
 * client photo IDs, tokens, filenames. Never use Math.random for
 * these — Math.random is predictable and not collision-resistant
 * across concurrent submissions.
 */

/** Returns a RFC4122 v4 UUID using the platform crypto APIs. */
export function safeRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: build a v4 UUID from getRandomValues. Still cryptographically strong.
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // Per RFC4122 §4.4 — version + variant bits.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
  }
  // Last-resort environments without WebCrypto should never run our app
  // (Inspections require crypto for signature handling). Throw loudly.
  throw new Error("Secure random source unavailable: crypto.randomUUID/getRandomValues missing");
}

/** Prefixed variant for human-readable IDs. */
export function safeRandomIdWithPrefix(prefix: string): string {
  return `${prefix}${safeRandomId()}`;
}
