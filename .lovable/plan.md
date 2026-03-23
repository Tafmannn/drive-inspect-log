

## Problem Analysis

The photo viewer on both JobDetail and PodReport pages silently drops photos when `resolveMediaUrlAsync` fails to resolve their URLs. The resolution pipeline (`mediaResolver.ts`) returns `null` for any photo where the GCS proxy token cannot be obtained (e.g., brief auth token expiry, network hiccup). These failures are caught silently — no error is shown and no retry is attempted.

Both pages filter out photos with empty URLs (`.filter((p) => !!p.url)`), meaning any photo that failed resolution simply disappears from the gallery.

## Root Causes

1. **Silent null returns**: `getTokenizedProxyUrl` returns `null` on auth failure instead of retrying or surfacing the error
2. **No retry logic**: Neither page retries failed photo resolutions
3. **Single-shot resolution in PodReport**: All photos are resolved once via `Promise.allSettled`, committed as a batch — failures are permanently excluded
4. **Incremental resolution in JobDetail**: Each photo sets state independently, but failures are caught and skipped with no retry

## Plan

### 1. Add retry logic to `getTokenizedProxyUrl` in `mediaResolver.ts`
- If the first auth token retrieval fails, wait briefly and retry once (session refresh may still be in-flight)
- Add a small retry (1 attempt with 500ms delay) before returning `null`

### 2. Add retry with back-off to photo resolution in `PodReport.tsx`
- Wrap the photo resolution loop: after the initial `Promise.allSettled`, identify failed/null photos
- Run a second pass (1 retry) for any photos that returned `null`
- Add diagnostic logging for photos that fail both attempts

### 3. Add retry with back-off to photo resolution in `JobDetail.tsx`
- After the initial `Promise.all`, collect photo IDs that failed
- Schedule a delayed retry (e.g., 2 seconds) for failed photos
- Add diagnostic logging for photos that fail both attempts

### 4. Show "X of Y photos loaded" indicator
- Update both pages to show a count when not all photos resolved (e.g., "5 of 8 photos loaded — tap to retry")
- Add a manual "Retry" button that re-triggers resolution for missing photos

## Files Changed
- `src/lib/mediaResolver.ts` — add retry to `getTokenizedProxyUrl`
- `src/pages/PodReport.tsx` — add retry pass for failed photos
- `src/pages/JobDetail.tsx` — add retry pass for failed photos, add loading indicator with retry
- `src/components/PhotoViewer.tsx` — accept optional `totalExpected` prop to show partial-load state

## What Will NOT Change
- Photo upload/capture flow
- Inspection workflow
- Invoice/PDF generation
- Photo types or database schema
- GCS proxy edge function

