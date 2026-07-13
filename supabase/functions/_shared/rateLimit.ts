// Shared in-memory per-IP rate limiter for edge functions.
//
// Deliberately simple (single Map, per-instance, resets to a fresh window
// once expired) — this is a cost/abuse guard for functions that call paid
// or rate-limited third-party APIs, not a distributed rate limiter. Each
// caller gets its own independent limiter instance so one endpoint's
// traffic never affects another's budget.

export interface RateLimiter {
  /** Returns a 429 Response if the caller's IP is over budget, else null. */
  check(req: Request): Response | null;
}

export function createIpRateLimiter(
  corsHeaders: Record<string, string>,
  opts: { maxPerWindow?: number; windowMs?: number } = {},
): RateLimiter {
  const maxPerWindow = opts.maxPerWindow ?? 30;
  const windowMs = opts.windowMs ?? 60_000;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    check(req: Request): Response | null {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const now = Date.now();
      const entry = hits.get(ip);
      if (!entry || now > entry.resetAt) {
        hits.set(ip, { count: 1, resetAt: now + windowMs });
        return null;
      }
      entry.count++;
      if (entry.count > maxPerWindow) {
        return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(Math.ceil(windowMs / 1000)) },
        });
      }
      return null;
    },
  };
}
