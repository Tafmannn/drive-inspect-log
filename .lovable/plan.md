**Current diagnosis (no code changes made):**
- Browser/runtime tools report **no recorded console errors** and **no runtime errors** for the preview snapshot.
- `VITE_SUPABASE_URL` is **set**.
- `VITE_SUPABASE_PUBLISHABLE_KEY` is **set**.
- Recent Vite logs show the dev server is running and only restarted after `.env` changed; no current build/runtime error is visible.

**Plan to resolve the white screen:**
1. Reproduce the blank screen directly against the running app route, including `/index`, `/login`, and `/`, and capture the actual rendered DOM/screenshot state.
2. If React is not mounting, trace the import chain from `src/main.tsx` and report/fix the first thrown module error.
3. If React mounts locally but the Lovable iframe remains white, treat it as a preview-cache/service-worker or route-shell issue and add a minimal safe recovery path without hardcoding secrets.
4. Verify after the fix by loading the same route in a mobile-sized viewport and confirming a visible login/app screen rather than a white page.
5. Report the exact root cause and any changed files after implementation.