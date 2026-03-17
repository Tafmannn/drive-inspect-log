/**
 * Context-aware back navigation.
 *
 * Pages reachable from multiple entry points (driver app, control centre, admin)
 * accept a `?from=` search param. This helper reads it and returns the correct
 * back-navigation target, falling back to a sensible default.
 */

const ALLOWED_BACK_PREFIXES = ["/control", "/admin", "/super-admin", "/jobs", "/expenses", "/invoice"];

export function resolveBackTarget(
  searchParams: URLSearchParams,
  fallback: string,
): string {
  const from = searchParams.get("from");
  if (from && ALLOWED_BACK_PREFIXES.some((p) => from.startsWith(p))) {
    return from;
  }
  return fallback;
}

/**
 * Propagates the `from` context when navigating deeper
 * (e.g. Job Detail → POD, Job Detail → Edit).
 */
export function withFrom(
  path: string,
  searchParams: URLSearchParams,
): string {
  const from = searchParams.get("from");
  if (!from) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}from=${encodeURIComponent(from)}`;
}
