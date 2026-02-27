

## Current State of AX0006

| Field | Value |
|-------|-------|
| Status | `pickup_complete` |
| Pickup Inspection | ✅ Done |
| Delivery Inspection | ❌ Not yet |
| Completed At | Not set |

## What to Test Next (Manual)

AX0006 needs a **delivery inspection** to complete the full lifecycle. Steps:

1. **Open AX0006** → tap "Start Delivery Inspection"
2. **Fill required fields** — odometer, fuel level, checklist items
3. **Add a photo** (optional but recommended for full coverage)
4. **Draw signature** and submit
5. **Verify status** transitions to `pod_ready` and `completed_at` is set
6. **Check "Last 14 Days"** tab — AX0006 should appear
7. **Check Google Sheet** — row should update with delivery data

Switch to default mode and I can navigate the app to attempt this flow, or you can test it manually in the preview.

