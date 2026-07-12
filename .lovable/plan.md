## Fix postcode-lookup & business-search 401 errors

Both edge functions use `supabase.auth.getUser()` for auth, which fails on the new Supabase JWT signing-keys system with `missing sub claim` → returns 401 → search dropdown appears broken.

### Changes

**`supabase/functions/postcode-lookup/index.ts`** (auth block, ~lines 19-32)
- Strip `Bearer ` prefix from `Authorization` header.
- Replace `supabase.auth.getUser()` with `supabase.auth.getClaims(token)`.
- Validate `claims?.sub` instead of `data.user`.
- Keep same 401 response shape on failure.

**`supabase/functions/business-search/index.ts`** (auth block, ~lines 16-29)
- Same swap: `getUser()` → `getClaims(token)` with `sub` check.

No client-side changes. CORS headers, query params, response shapes, and Places API logic remain untouched.

### Verification
- Deploy both functions.
- Curl each with the preview session token: expect 200 with `results`.
- Confirm in preview: postcode search returns addresses; business search returns companies.
