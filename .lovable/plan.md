

# Edge Function Hardening Plan

Three workstreams, no business logic changes.

---

## WORKSTREAM 1 — Remove hardcoded superadmin email checks

**Problem:** Four edge functions check `email === "axentravehiclelogistics@gmail.com"` or `email === "info@axentravehicles.com"` as a superadmin backdoor. The DB `is_super_admin()` function was already migrated to pure role-based checks.

**Fix:** In each file, remove the email variable and email comparison lines from the `isSuperAdmin` logic. Keep only the role-based checks: `directRole === "super_admin" || directRole === "superadmin" || roleSet.has("SUPERADMIN") || roleSet.has("SUPER_ADMIN")`.

**Files:**
1. `supabase/functions/google-sheets-sync/index.ts` (lines 340-347) — remove `email` const and email comparisons
2. `supabase/functions/assign-driver/index.ts` (lines ~44-52) — same pattern
3. `supabase/functions/gcs-proxy/index.ts` (lines 44-48) — replace email-based `isSuperAdmin` with role-based check using `user_metadata`/`app_metadata`
4. `supabase/functions/get-org-users/index.ts` (lines ~44-55) — same pattern

Note: `promote-admin/index.ts` already uses pure role-based `isSuperAdminCheck()` — no change needed.

---

## WORKSTREAM 2 — Rate limiter for 4 edge functions

**Problem:** No rate limiting on expensive endpoints (GCS upload, GCS proxy, Vision OCR, Maps directions).

**Fix:** Add a shared in-memory IP rate limiter (Map of IP → {count, windowStart}). 30 requests per IP per 60-second sliding window. Return HTTP 429 with `Retry-After: 60` header when exceeded. Extract IP from `x-forwarded-for` header or `req.headers.get("cf-connecting-ip")`, falling back to a static key.

**Implementation:** Add the rate limiter as a function at the top of each file (not a shared import — edge functions are isolated). ~15 lines each:

```typescript
const ipHits = new Map<string, { count: number; resetAt: number }>();
function rateLimit(req: Request): Response | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  entry.count++;
  if (entry.count > 30) {
    return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "60" },
    });
  }
  return null;
}
```

Call `const limited = rateLimit(req);` right after the OPTIONS check; return early if non-null.

**Files:**
1. `supabase/functions/gcs-upload/index.ts`
2. `supabase/functions/gcs-proxy/index.ts`
3. `supabase/functions/vision-ocr/index.ts`
4. `supabase/functions/maps-directions/index.ts`

---

## WORKSTREAM 3 — Remove `?token=` auth path from gcs-proxy; return GCS object path from gcs-upload

**Problem:** gcs-proxy accepts JWTs as a `?token=` query parameter (visible in browser history, logs, CDN caches). gcs-upload returns permanent `storage.googleapis.com` URLs.

### Part A: gcs-proxy — remove `?token=` path

In `gcs-proxy/index.ts`, delete lines 26-29 (the `tokenParam` fallback logic). Auth will only come from the `Authorization` header. This means `<img src="...">` tags can no longer use the proxy directly — the client must use the existing `resolveImageUrl()` pattern which already constructs proxy URLs.

**Wait — this breaks `<img>` tags.** Images in `<img src>` cannot send Authorization headers. The current `?token=` param exists precisely for this. The user's Request 1 says: "generate short-lived Supabase signed URLs server-side and return them to the client."

**Revised approach for gcs-proxy:**
- Remove `?token=` query param auth
- Instead of proxying the binary content, generate a **GCS signed URL** server-side (using the service account) with a 15-minute expiry and return it as a 302 redirect. This way:
  - No JWT in URL
  - `<img src>` works via redirect
  - URLs expire quickly
  - The browser caches the image content normally

Implementation: Replace the "Fetch from GCS" section. Instead of fetching the object and piping bytes, generate a V4 signed URL using the service account key and return `302 Found` with `Location` header. The signed URL has a 15-min TTL.

GCS V4 signed URL generation requires HMAC-style signing with the service account — this is moderately complex in Deno but well-documented. We'll implement a `generateSignedUrl()` function.

### Part B: gcs-upload — return object path instead of public URL

In `gcs-upload/index.ts`, change line 127:
```typescript
// Before:
const publicUrl = `https://storage.googleapis.com/${bucket}/${finalName}`;
// After:
// Return the object path, not a public URL. Client resolves via gcs-proxy.
```

Return `url: finalName` (the GCS object path) instead of the full public URL. The `backend` and `backendRef` fields remain the same.

### Part C: Update `src/lib/gcsProxyUrl.ts`

The `resolveImageUrl()` function currently checks for the `GCS_PUBLIC_PREFIX` to rewrite URLs. After Part B, new uploads will store bare paths (e.g., `jobs/xxx/photo.jpg`) instead of full `https://storage.googleapis.com/...` URLs.

Update `resolveImageUrl()` to handle both:
1. Legacy full GCS URLs (strip prefix, proxy)
2. Bare object paths (not starting with `http`) — construct proxy URL directly
3. Other URLs (Supabase, data URIs) — pass through

Remove all `?token=` param logic from this file.

The proxy now returns a 302 redirect to a signed URL, so `<img src>` tags will follow the redirect automatically — no changes needed in PhotoViewer or PodReport beyond what `resolveImageUrl()` already handles.

**Files updated:**
1. `supabase/functions/gcs-proxy/index.ts` — signed URL redirect, remove `?token=`
2. `supabase/functions/gcs-upload/index.ts` — return object path
3. `src/lib/gcsProxyUrl.ts` — handle bare paths, remove token logic

---

## DEPLOYMENT

All 4 modified edge functions (gcs-proxy, gcs-upload, vision-ocr, maps-directions) plus the 3 email-check fixes (google-sheets-sync, assign-driver, get-org-users) will be deployed.

## SUMMARY OF ALL FILES

| File | Changes |
|---|---|
| `supabase/functions/gcs-proxy/index.ts` | Remove `?token=`, add rate limiter, signed URL redirect, role-based superadmin |
| `supabase/functions/gcs-upload/index.ts` | Add rate limiter, return object path not public URL |
| `supabase/functions/vision-ocr/index.ts` | Add rate limiter |
| `supabase/functions/maps-directions/index.ts` | Add rate limiter |
| `supabase/functions/google-sheets-sync/index.ts` | Remove email-based superadmin check |
| `supabase/functions/assign-driver/index.ts` | Remove email-based superadmin check |
| `supabase/functions/get-org-users/index.ts` | Remove email-based superadmin check |
| `src/lib/gcsProxyUrl.ts` | Handle bare object paths, remove token param logic |

