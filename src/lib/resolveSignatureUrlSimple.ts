Treat the current fix as a viewer-scoped rendering fix, not a universal signature architecture.

OBJECTIVE
Stabilize signature rendering in the live POD viewer by ensuring that every resolved GCS-backed signature becomes a browser-safe image source, while keeping the behavior explicit and safe for cleanup.

WHY
The remaining failure is no longer signature persistence or URL normalization. It is terminal browser rendering. A GCS proxy URL or redirect chain can be unstable for <img src>. A blob URL created from actual image bytes is browser-stable for the viewer.

SCOPE
Apply this change to the online viewer path only unless another consumer explicitly needs the same behavior.
Do not assume blob URLs are appropriate for PDF/export/admin consumers.

IMPLEMENTATION REQUIREMENTS

1. In `src/lib/resolveSignatureUrlSimple.ts`:
- normalize raw signature references into a storage path
- try Supabase signed URL first
- if Supabase signing fails, fetch the GCS proxy as raw bytes
- validate:
  - HTTP status is OK
  - `content-type` contains `image`
  - blob size is non-zero
- return `URL.createObjectURL(blob)` for the viewer path
- log:
  - raw input
  - normalized path
  - Supabase signing success/failure
  - GCS content-type
  - blob size

2. In `src/pages/PodReport.tsx`:
- resolve each signature slot independently
- accept only:
  - `https://...`
  - `blob:...`
- reject null or malformed values before setting state
- log per slot:
  - raw DB value
  - resolved value prefix
  - final img src
  - onLoad with `naturalWidth` / `naturalHeight`
  - onError

3. Blob URL lifecycle:
- track created blob URLs inside the effect
- revoke them in cleanup
- ensure stale effect runs cannot overwrite good URLs with null

4. Consumer boundary:
- do not automatically switch PDF/export/review helpers to blob URLs unless they are verified to support them
- if another consumer needs signatures, it must either:
  - fetch bytes directly, or
  - use a stable remote URL path appropriate for that consumer

5. Pass criteria for the live viewer:
- pickup_driver image loads
- pickup_customer image loads
- delivery_driver image loads
- delivery_customer image loads
- `naturalWidth` and `naturalHeight` are both > 0
- no raw `jobs/.../signatures/...` path reaches `<img src>`

IMPORTANT
This is a browser rendering stabilization step for the live viewer. Do not represent it as the final canonical media architecture for every signature consumer.