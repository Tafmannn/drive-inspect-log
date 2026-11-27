/**
 * Client name hygiene: names are stored trimmed with single spaces, and a new or
 * renamed client is checked against existing ones for near-duplicates
 * ("Revillo Automotive" vs "Revilo Automotive") so jobs aren't split across two profiles.
 */

/** Trim and collapse internal whitespace. Null/empty stays as given (null or ""). */
export function tidyName<T extends string | null | undefined>(value: T): T {
  if (typeof value !== "string") return value;
  return value.replace(/\s+/g, " ").trim() as T;
}

/** Apply tidyName to the name and company fields of a client payload, leaving others alone. */
export function tidyClientNames<T extends { name?: string | null; company?: string | null }>(input: T): T {
  const out = { ...input };
  if ("name" in out) out.name = tidyName(out.name);
  if ("company" in out) out.company = tidyName(out.company);
  return out;
}

const LEGAL_SUFFIX = /\b(ltd|limited|plc|llp|inc|co|uk)\b/g;

/** Lowercase letters and digits only, legal suffixes dropped: "Revillo Automotive Ltd." → "revilloautomotive". */
export function normaliseClientName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(LEGAL_SUFFIX, " ").replace(/[^a-z0-9]/g, "");
}

/** Levenshtein distance, stopping early once above `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** True when two client names are probably the same business. */
export function namesLookAlike(a: string, b: string): boolean {
  const x = normaliseClientName(a);
  const y = normaliseClientName(b);
  if (x.length < 3 || y.length < 3) return false;
  if (x === y) return true;
  const shorter = Math.min(x.length, y.length);
  if (shorter >= 6 && (x.includes(y) || y.includes(x))) return true;
  const allowed = shorter >= 12 ? 2 : shorter >= 5 ? 1 : 0;
  return allowed > 0 && editDistance(x, y, allowed) <= allowed;
}

export interface NamedClient {
  id: string;
  name: string;
  company?: string | null;
}

/** Existing clients whose name or company looks like `candidate` (excluding `excludeId`). */
export function findSimilarClients<C extends NamedClient>(candidate: string, clients: C[], excludeId?: string | null): C[] {
  if (!candidate.trim()) return [];
  return clients.filter(
    (c) => c.id !== excludeId && [c.company, c.name].some((n) => !!n && namesLookAlike(candidate, n)),
  );
}
