## Google Sheets ↔ App Sync Architecture (Updated)

### Current Implementation (Working)

**Push (App → Sheet):** Writes all app jobs to the Job Master tab. Unchanged.

**Pull (Sheet → App):** Reads from the **Job Entry** tab (auto-detected), creates new jobs in the app, writes back `App Job ID` + `Imported At` to Job Entry, then upserts the job to Job Master with all system-generated fields.

### Pull Workflow

1. Auto-detect "Job Entry" and "Job Master" tabs (case-insensitive, partial match)
2. Auto-add "App Job ID" and "Imported At" columns to Job Entry if missing
3. For each row in Job Entry:
   - Skip if `App Job ID` already set (already imported)
   - Skip if `Sync to App?` / `Import?` is not YES (when column exists)
   - Map headers dynamically via `JOB_ENTRY_HEADER_MAP`
   - Validate required fields (pickup address, delivery address, vehicle reg)
   - Check for duplicates by `external_job_number`
   - Insert job with status `ready_for_pickup`
   - Write back `App Job ID` + `Imported At` to Job Entry row
   - Upsert corresponding row in Job Master tab

### Duplicate Protection

- Primary: `App Job ID` column in Job Entry (written after import)
- Secondary: `external_job_number` dedup check in database

### Files Modified

- `supabase/functions/google-sheets-sync/index.ts` — Complete pull redesign
- `src/components/GoogleSheetsPanel.tsx` — Improved pull notifications + query invalidation
