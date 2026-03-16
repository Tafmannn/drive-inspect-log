

## End-to-End Fix Plan: Broken Integrations

### Root Causes Identified

**Issue 1 — CORS blocks all edge function calls from the preview domain**

Every single edge function (11 functions) uses a hardcoded `ALLOWED_ORIGINS` list containing only `localhost:5173`, `*.lovable.app`, and `axentra.lovable.app`. The actual preview runs on `*.lovableproject.com`, which is NOT in this list. When the origin doesn't match, the function returns `Access-Control-Allow-Origin: http://localhost:5173`, which the browser rejects. This silently breaks DVLA lookup, company search, postcode lookup, maps directions, GCS upload/proxy, vision OCR, sheet sync, and all admin functions.

**Issue 2 — Client APIs send anon key instead of user session token**

Four client-side API modules (`businessSearchApi.ts`, `postcodeApi.ts`, `mapsApi.ts`, `sheetSyncApi.ts`) use raw `fetch()` with `Authorization: Bearer ${ANON_KEY}`. The edge functions then call `supabase.auth.getUser()` which returns null for anon keys, causing a 401 UNAUTHENTICATED response. Only `vehicleLookupApi.ts`, `adminApi.ts`, `visionApi.ts`, and `gcsStorageService.ts` correctly use `supabase.functions.invoke()` which sends the real user token.

---

### Fix Plan

#### Part 1: Fix CORS in all 11 edge functions

Replace the restrictive `ALLOWED_ORIGINS` + `cors()` function in every edge function with the standard Lovable CORS pattern:

```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
```

**Files to update (CORS block, lines 4-16 in each):**
- `supabase/functions/vehicle-lookup/index.ts`
- `supabase/functions/business-search/index.ts`
- `supabase/functions/place-details/index.ts`
- `supabase/functions/postcode-lookup/index.ts`
- `supabase/functions/maps-directions/index.ts`
- `supabase/functions/gcs-upload/index.ts`
- `supabase/functions/gcs-proxy/index.ts`
- `supabase/functions/gcs-fix-acl/index.ts`
- `supabase/functions/vision-ocr/index.ts`
- `supabase/functions/promote-admin/index.ts`
- `supabase/functions/assign-driver/index.ts`
- `supabase/functions/get-org-users/index.ts`
- `supabase/functions/google-sheets-sync/index.ts` (same pattern, slightly different location)

Also replace `cors(req.headers.get("Origin"))` in catch blocks with just `corsHeaders`.

#### Part 2: Switch client APIs to use `supabase.functions.invoke()`

**`src/lib/businessSearchApi.ts`** — Replace raw fetch calls with `supabase.functions.invoke('business-search', ...)` and `supabase.functions.invoke('place-details', ...)`. This sends the user's real auth token.

**`src/lib/postcodeApi.ts`** — Replace raw fetch with `supabase.functions.invoke('postcode-lookup', ...)`.

**`src/lib/mapsApi.ts`** — Replace raw fetch with `supabase.functions.invoke('maps-directions', ...)`.

**`src/lib/sheetSyncApi.ts`** — Replace raw fetch `callSync` function with `supabase.functions.invoke('google-sheets-sync', ...)`.

#### Part 3: Deploy all edge functions

All 13 edge functions must be redeployed after CORS fixes.

---

### Summary of what this fixes

| Feature | Broken because | Fix |
|---|---|---|
| DVLA Lookup | CORS block | Fix CORS headers |
| Company Search | CORS + anon key auth | Fix CORS + use `supabase.functions.invoke` |
| Postcode Lookup | CORS + anon key auth | Fix CORS + use `supabase.functions.invoke` |
| Maps/Route Calc | CORS + anon key auth | Fix CORS + use `supabase.functions.invoke` |
| Google Sheets Sync | CORS + anon key auth | Fix CORS + use `supabase.functions.invoke` |
| GCS Photo Upload | CORS block | Fix CORS headers |
| GCS Photo Proxy | CORS block | Fix CORS headers |
| Vision OCR | CORS block | Fix CORS headers |
| Admin user mgmt | CORS block | Fix CORS headers |

No database, RLS, routing, or business logic changes needed.

