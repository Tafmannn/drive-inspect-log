

## Full A-Z Analysis & Improvement Plan for Axentra Vehicles

### Current State Summary

**Working well:**
- Push (App → Job Master) syncs all 45 columns correctly
- Pull (Job Entry → App → Job Master) creates jobs and writes back App Job ID
- Inspection flow (pickup/delivery) with photos, damage, signatures
- Expense tracking per job
- Admin dashboard with overview stats, job management, sheets panel
- Autosave drafts, QR handover, CSV exports

**Issues Found:**

1. **JobCard shows pickup contact name as primary identifier** — should show Client Name
2. **No status badge on job cards** — driver can't see job status at a glance
3. **No distance/price summary on cards** — key operational info missing
4. **Phone numbers not tappable** — no `tel:` links on job cards or detail page
5. **No map deep-links** — addresses not linkable to Google Maps
6. **Dashboard "Download Jobs" card is a stub** — should trigger Pull from Job Entry
7. **Job cards missing client_name, job_date** — imported jobs have this data but cards don't show it
8. **No job_date sorting** — active jobs sorted by created_at, should prioritise by job_date
9. **Job types not exported to types.ts** — `client_phone`, `client_email`, `client_company` missing from Job type
10. **Edge function: imported jobs don't get external_job_number auto-generated** — pulled jobs show raw UUID as ref

---

### Implementation Steps

#### 1. Update Job type to include new client fields
Add `client_phone`, `client_email`, `client_company` to the `Job` interface in `src/lib/types.ts`.

#### 2. Redesign JobCard for driver-first UX
Restructure `src/components/JobCard.tsx`:
- **Top-left**: Client name (with avatar initial), not pickup contact
- **Top-right**: Vehicle reg badge (keep)
- **Subtitle line**: `job_date • distance_miles mi • £total_price • STATUS`
- **Status badge**: Coloured chip (green=Ready, blue=In Progress, etc.)
- Add new props: `clientName`, `status`, `jobDate`, `distanceMiles`, `totalPrice`
- Make phone numbers tappable (`<a href="tel:...">`)
- Make addresses tappable (deep-link to Google Maps)

#### 3. Update JobList to pass new card data
In `src/pages/JobList.tsx`:
- Pass `clientName`, `status`, `jobDate`, `distanceMiles`, `totalPrice` to JobCard
- Sort jobs by `job_date` ascending (soonest first), then `created_at`
- Add status badge mapping

#### 4. Update CompletedJobs to pass new card data
Same changes as JobList for consistency.

#### 5. Wire "Download Jobs" dashboard card to Pull
In `src/pages/Dashboard.tsx`:
- Change the "Download Jobs" stub to actually call `pullFromSheet()` and show results
- Invalidate job queries after pull

#### 6. Add tap-to-call and map links on JobDetail
In `src/pages/JobDetail.tsx`:
- Wrap phone numbers in `<a href="tel:...">` links
- Wrap addresses in `<a href="https://maps.google.com/...">` links
- Show client name block if present
- Show pricing block (distance, rate, total, CAZ/ULEZ)

#### 7. Auto-generate external_job_number for pulled jobs
In edge function `handlePull`: after inserting the job, if `external_job_number` is null, generate one (AX#### sequence) and update both the DB and the Job Master row. This ensures imported jobs get proper refs like app-created jobs.

#### 8. Sort active jobs by job_date
In `src/lib/api.ts` `listActiveJobs`: add `.order('job_date', { ascending: true, nullsFirst: false })` as primary sort.

#### 9. Add status colour mapping
Create a shared `STATUS_CONFIG` map used by both JobCard and JobDetail:
```
ready_for_pickup → "Ready" (green)
pickup_in_progress / pickup_complete / in_transit / delivery_in_progress → "In Progress" (blue)
delivery_complete / pod_ready → "Completed" (gray)
cancelled → "Cancelled" (red)
```

#### 10. Minor UX polish
- Disable CTA button while mutations are pending (JobCard)
- Add loading spinner on Pull/Push buttons (already done in GoogleSheetsPanel)
- Ensure no horizontal overflow on iPhone (check card layout max-width)

---

### Files to modify:
1. `src/lib/types.ts` — add 3 client fields to Job interface
2. `src/components/JobCard.tsx` — redesign layout with client name, status, summary line, tap-to-call, map links
3. `src/pages/JobList.tsx` — pass new props, sort by job_date
4. `src/pages/CompletedJobs.tsx` — pass new props
5. `src/pages/Dashboard.tsx` — wire Download Jobs to pull
6. `src/pages/JobDetail.tsx` — add tap-to-call, map links, client block, pricing block
7. `src/lib/api.ts` — sort active jobs by job_date
8. `supabase/functions/google-sheets-sync/index.ts` — auto-generate job numbers for pulled jobs

### Not changing (already working):
- Push flow
- Pull flow (Job Entry → App → Job Master)
- Column mapping (45-header canonical structure)
- Admin dashboard tabs
- Inspection flow
- Expense tracking
- Autosave system

