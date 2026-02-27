

## Validation Plan: Google Sheets ↔ Supabase ↔ App Sync Architecture

### Current State Analysis

After reviewing the edge function (`google-sheets-sync/index.ts`), the codebase has three working actions (`test`, `pull`, `setup_job_master`) but is **missing the `push` action entirely** (line 288 falls through to "Unknown action"). The pull logic, header validation, and Job Master tab setup are all implemented.

### Key Issues Found

1. **No `push` action handler** — The edge function returns `Unknown action: push` (400 error). This is the root cause of the Push Jobs → Sheet failure.
2. **No `Vehicle Make`/`Vehicle Model` in required fields for Job Master pull** — Jobs pulled from the sheet may have empty make/model, which are NOT NULL in the DB but default to empty string in the pull logic (acceptable).
3. **Pull logic works** but the sheet is currently empty (no data rows), so pull returns "Sheet is empty" correctly.

### Implementation Steps

#### Step 1: Implement the `push` action in the edge function

Add a complete `handlePush` function to `supabase/functions/google-sheets-sync/index.ts` that:

- Queries all jobs from Supabase (optionally filtered by `jobIds` array)
- For each job, maps fields to the 47 Job Master columns
- Checks if the job already has a `sheet_row_index` — if so, updates that row in-place
- If no `sheet_row_index`, appends a new row and writes back the row index to Supabase
- Updates `last_push_at` timestamp in config
- Logs the sync operation to `sheet_sync_logs`
- Handles expenses aggregation (sum from `expenses` table for each job)

The column mapping for push (Job Master 47 headers):
- Columns like "Job ID" → `external_job_number`
- "Job Date" → `job_date`  
- "Job Status" → reverse status mapping
- All address, vehicle, pricing fields mapped from the `jobs` table columns
- "App Job ID" → `id` (the Supabase UUID)
- "Sync to App?" → always "YES" for pushed jobs
- Formula columns ("Total", "Alerts", "Bid Phrase") left untouched

#### Step 2: Wire the `push` action into the main handler

In the `if/else` chain (around line 286-290), add:
```
else if (action === "push") {
  const { jobIds } = body;  // optional filter
  return await handlePush(supabase, token, spreadsheet_id, sheetName, jobIds);
}
```

This requires parsing `jobIds` from the request body alongside `action`.

#### Step 3: Deploy and test

- Deploy the updated edge function
- Run Test Connection via curl → expect PASS
- Run Push via curl → expect rows written to sheet
- Run Pull via curl → expect "Sheet is empty" or successful pull if test rows exist

### Technical Details

**Push flow data mapping (47 columns):**

| Column | Source |
|--------|--------|
| Job ID | `external_job_number` |
| Job Date | `job_date` or `created_at` |
| Job Status | Reverse map from app status |
| Job Priority | `priority` |
| Job Type | `job_type` |
| Job Source | `job_source` |
| Created At | `created_at` |
| Updated At | `updated_at` |
| Client Name | `client_name` |
| Client Notes | `client_notes` |
| Pickup/Delivery fields | Direct mapping |
| Vehicle fields | Direct mapping |
| Distance/Rate/Price | Direct mapping |
| Driver Name/ID | Direct mapping |
| Sync to App? | "YES" |
| App Job ID | `id` (UUID) |
| Sync to Map? | `sync_to_map` |
| Map Job ID | empty |

**Duplicate prevention:** Before appending, scan existing "App Job ID" column. If the UUID already exists in the sheet, update that row instead of appending.

**Request body change:** The handler must destructure both `action` and `jobIds` from the request JSON (line 222 currently only reads `action`).

### Files Modified

1. `supabase/functions/google-sheets-sync/index.ts` — Add `handlePush` function (~120 lines), update request parsing, add reverse status map

### No schema changes needed

The existing Supabase tables already have all required columns (`sheet_row_index`, `sheet_job_id`, etc.).

