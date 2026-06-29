## Problem

The inspection submit fails on the 9th photo with the "Photos could not be saved on this device" card. The logged error has:

- `reason_code: "unknown"`, `raw: ""`, `queuedSoFar: 8`, `phase: "stage"`

This is two compounding bugs:

### Bug 1 — Single-key queue forces a full rewrite on every stage

`src/lib/pendingUploads.ts` keeps the entire pending-uploads queue in **one IndexedDB key** (`QUEUE_KEY`). Every `stagePendingUpload` call does `loadAll → push → saveAll`, which re-serializes and rewrites all previously staged blobs. On the 9th photo it's rewriting 9 compressed JPEGs (often 8–15 MB total) in a single transaction. On iOS Safari this routinely fails — sometimes with `QuotaExceededError`, but often with an opaque `DOMException` whose `.message` is empty.

### Bug 2 — Error classifier loses the DOMException

`classifyStorageError` only inspects `err.message` / `err.name`. When idb-keyval rejects with a `DOMException` that has an empty message and a name Safari doesn't expose (or with the underlying `IDBRequest.error` whose `code` is the only signal), we fall through to `"unknown"` and log `raw: ""`. That's why the user sees the generic "Photos could not be saved on this device" card with no actionable detail and why our logs can't tell quota apart from a transient abort.

## Fix Plan

Scope is local-storage reliability only. No schema changes, no submit/RPC changes, no GCS work.

### 1. Store each pending upload under its own IDB key

In `src/lib/pendingUploads.ts`:

- Add a per-item store layout: keep the existing `QUEUE_KEY` index as a lightweight array of **metadata only** (no `fileBlob`), and write each blob under a separate key `pu_blob_<id>` in the same store.
- `stagePendingUpload` writes the blob first under its own key, then appends a metadata entry to the index. The hot path becomes "one small index write + one blob write" instead of "rewrite every blob".
- `loadAll` reads the index, lazy-loads blobs on demand (workers already process one item at a time).
- `removeOne` / discard paths delete both keys.
- One-time migration: on first load after deploy, if the legacy single-key array exists, split it into the new layout, then delete the legacy key. Gated by a `MIGRATION_V2_FLAG_KEY` so it runs once.

This alone removes the cliff at ~8 photos.

### 2. Make `classifyStorageError` understand `DOMException`

In `src/lib/storageDiagnostics.ts`:

- Inspect `err.code` and `err.constructor.name` in addition to `err.name` / `err.message`. Map `DOMException.QUOTA_EXCEEDED_ERR` (code 22), `name === "QuotaExceededError"`, and Safari's `name === "UnknownError"` with code 0 on writes to `quota_exceeded`.
- When the message is empty, synthesize a `raw` string from `${name || "DOMException"}#${code ?? "?"}` so logs are never blank.
- Add a `kind: "device_full"` branch that uses `navigator.storage.estimate()` (when available) to differentiate a true quota hit from a transient abort, and surface that in the card copy.

### 3. Pre-flight quota estimate before staging

In `src/pages/InspectionFlow.tsx`, before the staging loop:

- Call `navigator.storage.estimate()` when available.
- If `(quota - usage) < photoCount * ~3 MB` budget, show the storage card up-front with `kind: "quota_exceeded"` and skip the loop — instead of failing partway through and leaving 8 staged items behind.

### 4. Tighten failure logging

Already correct in shape, but ensure `failPreflight` includes `errorName`, `errorCode`, and `storageEstimate` (used / quota) in `context` so future "raw: empty" reports tell us which device hit which limit.

## Files affected

- `src/lib/pendingUploads.ts` — per-item key layout + migration
- `src/lib/storageDiagnostics.ts` — DOMException-aware classifier
- `src/pages/InspectionFlow.tsx` — pre-flight quota check + richer log context

## What is explicitly NOT changed

- `submit_inspection` RPC, RLS policies, photos schema, signature flow.
- The submit queue (`src/lib/submitQueue.ts`) and retry orchestrator.
- The "Try again" / StorageFailureCard UI surface (it already works correctly — we're just feeding it better classifications).

## Rollout / rollback

- Pure client-side change. Refresh picks up the new module; the one-time migration converts existing staged items in place.
- Rollback = revert the three files. Migration is forward-only but the legacy reader stays for one release so a partial rollback won't strand evidence.

## Verification

- Manually stage 12+ photos on an inspection — should no longer fail at photo 9.
- Force a quota error in DevTools (Application → Storage → "Simulate custom storage quota" set very low) — card should show "Device storage is full" with non-empty `raw` in logs.
- Unit-test additions for `classifyStorageError` covering `DOMException` with code 22 and with empty message.
