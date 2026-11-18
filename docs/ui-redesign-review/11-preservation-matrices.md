# Field and control preservation matrices (six screens)

Purpose: prove that **no existing element silently disappears** in the Concept A prototypes. For each screen, every element extracted from the source (`ControlOverview.tsx`, `ControlJobs.tsx`+`JobsColumns.tsx`, `JobDetail.tsx`, `InspectionFlow.tsx`+`inspectionFormConfig.ts`, `AdminDashboard.tsx`, `SuperAdminDashboard.tsx`+`SuperAdminPages.tsx`+`ControlSuperAdmin.tsx`) is listed with:

- **v1** — present in the first-pass prototype (`mockups/v1-first-pass/0N-*.html`)? Computed by searching that HTML.
- **v2** — present in the refined prototype (`mockups/v2/*.html`)? Computed the same way.
- **Status** — *Preserved* (found in v2) · *Placeholder* (shown as a labelled stand-in because its content was not reviewed) · *Not drawn* (documented, not prototyped; must be restyled via shared components, no evidence yet) · *MISSING* (would be a defect).

The status column is **computed by `tools/preservation-matrix.py` from the prototype HTML**, not asserted by hand. A match means the label text/attribute exists in the file (substring search, so a common word can over-match; Command Center and Jobs were also checked by eye in the screenshots); it does not prove visual quality. Elements tagged *Placeholder* or *Not drawn* are **not verified** and must be checked against the real component before implementation.

## Summary

| Screen | Preserved | Placeholder | Not drawn | MISSING |
|---|---|---|---|---|
| 1. Main dashboard — Command Center (`/control`) | 39 | 1 | 2 | 0 |
| 2. Jobs management (`/control/jobs`) | 32 | 1 | 2 | 0 |
| 3. Job detail — mobile (`/jobs/:jobId`) | 26 | 5 | 4 | 0 |
| 4. Vehicle inspection — mobile (`/inspection/:jobId/:type`) | 28 | 0 | 3 | 0 |
| 5. Admin dashboard (`/admin`, `/`) | 13 | 0 | 2 | 0 |
| 6. Super-admin (`/control/super-admin`, `/super-admin`, `/super-admin/settings`) | 13 | 1 | 1 | 0 |
| **Total** | **151** | **8** | **14** | **0** |

First-pass prototypes (v1) were missing **104** of the elements below that are present in v2 — including the whole set of Command Center shortcuts, the real Command Center KPIs, the real Admin Management items and the super-admin Quick Actions. v1 also *added* elements that do not exist in the source (chip counts, "Users / Timesheets / Create invoice" Management items, mismatched KPI labels); those were removed in v2.

## 1. Main dashboard — Command Center (`/control`)

| Area | Existing element | Type | Source | In v1 | In v2 | Status | Note |
|---|---|---|---|---|---|---|---|
| Shell | Left sidebar with 7 nav groups (Platform only for super-admin) | nav | `ControlLayout / navigation.ts` | yes | yes | **Preserved** |  |
| Shell | Sidebar "Back to App" link | control | `ControlLayout` | **no** | yes | **Preserved** |  |
| Shell | Sidebar collapse control (aria "Collapse sidebar") | control | `ControlSidebar.tsx` | **no** | yes | **Preserved** |  |
| Shell | Global search with ⌘K hint | control | `ControlLayout` | **no** | yes | **Preserved** |  |
| Shell | Notifications bell | control | `NotificationsPopover.tsx` | yes | yes | **Preserved** |  |
| Shell | User avatar / role label | info | `ControlLayout` | yes | yes | **Preserved** |  |
| Shell | Breadcrumb trail | nav | `Breadcrumbs.tsx` | yes | yes | **Preserved** |  |
| Header | Title "Command Center" | info | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| Header | Subtitle "Organisation dispatch & operational control" | info | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| Header | Live status chip (Critical / Attention Required / All Clear) | info | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| KPI | Ready to Dispatch (click-through) | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| KPI | In Transit (click-through) | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| KPI | Exceptions (scrolls to Attention) | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| KPI | POD Review (click-through) | control | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| KPI | Completed Today (click-through) | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| KPI | Unassigned (click-through) | control | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| KPI | Stale (>24h) (click-through) | control | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| Quick actions | New Job | control | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| Quick actions | View All Jobs | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Quick actions | Drivers | control | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| Quick actions | Expenses | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Attention Required | Section title + "N active exceptions" | info | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Attention Required | Refresh button | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Attention Required | Exception rows (AttentionQueue) with severity | info | `AttentionQueue` | **no** | yes | **Preserved** |  |
| Attention Required | "Showing top 10 of N exceptions" | info | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Attention Required | "N acknowledged" disclosure toggle | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Attention Required | Acknowledged list (dimmed) after toggle | info | `ControlOverview.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| Needs Assignment | Section + "N active jobs with no driver — oldest first" | info | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Needs Assignment | "View all" | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Needs Assignment | Columns Ref · Vehicle · Route · Status · Updated · actions | info | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| Active Dispatch Board | Section + "N jobs in pipeline" | info | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Active Dispatch Board | Columns Ref · Vehicle · Driver · Route · Status · Updated · actions | info | `ControlOverview.tsx` | yes | yes | **Preserved** |  |
| Row actions | Assign / Reassign | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Row actions | POD (when reviewable) | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Row actions | Row click opens job | control | `ControlOverview.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| POD Review Queue | Section + "N jobs awaiting closure — oldest first" | info | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| POD Review Queue | "Review all" | control | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| POD Review Queue | "Showing top N of M jobs awaiting closure" | info | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Recently Completed | Section + "Latest completed jobs" | info | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Empty states | "All active jobs are assigned." / "No active jobs in pipeline." / "No jobs awaiting POD review." / "No recent completions." | info | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |
| Dialog | Assign driver dialog (AssignDriverModal) | control | `AssignDriverModal` | **no** | yes | **Placeholder** | Shown as a labelled placeholder — content/behaviour not reviewed |
| States | Loading skeleton / "Loading exceptions…" | info | `ControlOverview.tsx` | **no** | yes | **Preserved** |  |

## 2. Jobs management (`/control/jobs`)

| Area | Existing element | Type | Source | In v1 | In v2 | Status | Note |
|---|---|---|---|---|---|---|---|
| Header | Title "Jobs" + subtitle "Triage, dispatch and progress jobs" | info | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| Header | Run order button (aria "Set driver run order") | control | `ControlJobs.tsx` | **no** | yes | **Preserved** |  |
| Header | New job button | control | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| KPI | Unassigned | control | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| KPI | Stale (>24h) | control | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| KPI | Evidence gaps | control | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| KPI | POD Review | control | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| KPI | Active | control | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| KPI | Total jobs | control | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| Toolbar | Search "Search reg, client, driver, postcode…" (aria "Search jobs") | control | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| Toolbar | 10 view chips (group aria "Job views") | control | `jobsView.ts` | yes | yes | **Preserved** |  |
| Toolbar | Sort toggle "By updated" / "By job date" | control | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| Queues view | Needs attention · empty "No jobs need attention." | info | `ControlJobs.tsx` | **no** | yes | **Preserved** |  |
| Queues view | Unassigned · "All jobs are assigned." | info | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| Queues view | Missing evidence · "No evidence gaps found." | info | `ControlJobs.tsx` | **no** | yes | **Preserved** |  |
| Queues view | In progress · "No active jobs with assigned drivers." | info | `ControlJobs.tsx` | yes | yes | **Preserved** |  |
| Queues view | POD review · "No jobs pending review." | info | `ControlJobs.tsx` | **no** | yes | **Preserved** |  |
| Queues view | Recently completed | info | `ControlJobs.tsx` | **no** | yes | **Preserved** |  |
| Queues view | Truncation notice "most recently updated 300 jobs" | info | `ControlJobs.tsx` | **no** | yes | **Preserved** |  |
| Error | "Failed to load jobs: …" + Retry | control | `ControlJobs.tsx` | **no** | yes | **Preserved** |  |
| Table | Columns Ref · Vehicle · Client · Driver · Route · Status · Updated · actions | info | `JobsColumns.tsx` | yes | yes | **Preserved** |  |
| Table | Status badge + Stale cue | info | `JobsColumns.tsx` | **no** | yes | **Preserved** |  |
| Table | Status cue "Blocked" (title tooltip in source) | info | `JobsColumns.tsx` | **no** | yes | **Preserved** |  |
| Table | Status cue "Action needed" | info | `JobsColumns.tsx` | **no** | yes | **Preserved** |  |
| Table | Status cue "Heads up" | info | `JobsColumns.tsx` | **no** | yes | **Preserved** |  |
| Table | Row action View | control | `JobsColumns.tsx` | yes | yes | **Preserved** |  |
| Table | Row action Assign / Reassign | control | `JobsColumns.tsx` | **no** | yes | **Preserved** |  |
| Table | Row action POD (canReviewPod) | control | `JobsColumns.tsx` | **no** | yes | **Preserved** |  |
| Table | Row action Expense (canAddExpense) | control | `JobsColumns.tsx` | **no** | yes | **Preserved** |  |
| Table | Row action "Resolve evidence" (evidence view) | control | `JobsColumns.tsx` | **no** | yes | **Preserved** |  |
| Table | Row click opens job | control | `ControlJobs.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| Table | Empty "No jobs match your filters." | info | `ControlJobs.tsx` | **no** | yes | **Preserved** |  |
| Mobile | Card list with the same actions (renderCard) | control | `ControlJobs.tsx` | **no** | yes | **Preserved** |  |
| Dialog | Run order dialog (RunOrderModal, move up/down) | control | `RunOrderModal.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| Dialog | Assign driver dialog | control | `AssignDriverModal` | **no** | yes | **Placeholder** | Shown as a labelled placeholder — content/behaviour not reviewed |

## 3. Job detail — mobile (`/jobs/:jobId`)

| Area | Existing element | Type | Source | In v1 | In v2 | Status | Note |
|---|---|---|---|---|---|---|---|
| Shell | Back button + title "Job {ref}" | nav | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| Shell | Bottom nav (4 tabs) | nav | `BottomNav.tsx` | **no** | yes | **Preserved** |  |
| Header card | Status badge | info | `JobHeaderCard.tsx` | yes | yes | **Preserved** |  |
| Header card | UK plate | info | `UKPlate.tsx` | yes | yes | **Preserved** |  |
| Header card | "Job {ref}" line | info | `JobHeaderCard.tsx` | **no** | yes | **Preserved** |  |
| Header card | Make · Model — Colour (Year) | info | `JobHeaderCard.tsx` | **no** | yes | **Preserved** |  |
| Header card | Evidence status badges slot | info | `EvidenceStatusBadges.tsx` | **no** | yes | **Placeholder** | Shown as a labelled placeholder — content/behaviour not reviewed |
| Workflow | Pickup → Transit → Delivery progress | info | `JobDetail.tsx` | yes | yes | **Preserved** |  |
| Workflow | Next-step primary CTA | control | `JobDetail.tsx` | yes | yes | **Preserved** |  |
| Workflow | Review-only warning variant of next step | info | `JobDetail.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| Collect From | Contact name · company · address | info | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| Collect From | Time window "Time: from – to" | info | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| Collect From | Notes strip | info | `JobDetail.tsx` | yes | yes | **Preserved** |  |
| Collect From | "Access: …" strip | info | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| Collect From | Call (disabled if no phone) | control | `JobDetail.tsx` | yes | yes | **Preserved** |  |
| Collect From | Navigate | control | `JobDetail.tsx` | yes | yes | **Preserved** |  |
| Deliver To | Same fields as Collect From | info | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| Inspections | Pickup Inspection status line | info | `JobDetail.tsx` | yes | yes | **Preserved** |  |
| Inspections | Delivery Inspection status line | info | `JobDetail.tsx` | yes | yes | **Preserved** |  |
| QR Handover | Collection QR button | control | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| QR Handover | Delivery QR button | control | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| QR Handover | QR display dialog | control | `QrDisplayModal.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| Actions | Expenses button | control | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| Actions | POD Report button | control | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| Notes | Job Notes | info | `JobDetail.tsx` | yes | yes | **Preserved** |  |
| Admin only | Evidence Health banner | info | `EvidenceHealthBanner.tsx` | **no** | yes | **Placeholder** | Shown as a labelled placeholder — content/behaviour not reviewed |
| Admin only | Job price editor | control | `JobPriceEditor.tsx` | **no** | yes | **Placeholder** | Shown as a labelled placeholder — content/behaviour not reviewed |
| Admin only | Pricing suggestion panel | control | `PricingSuggestionPanel.tsx` | **no** | yes | **Placeholder** | Shown as a labelled placeholder — content/behaviour not reviewed |
| Admin only | Pricing audit timeline | info | `PricingAuditTimeline.tsx` | **no** | yes | **Placeholder** | Shown as a labelled placeholder — content/behaviour not reviewed |
| Admin only | Change status… select | control | `JobAdminControls.tsx` | **no** | yes | **Preserved** |  |
| Admin only | Cancel button | control | `JobAdminControls.tsx` | **no** | yes | **Preserved** |  |
| Admin only | Inspection Photos — Collection / Delivery / Damage | info | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| Admin only | Photo viewer (full screen) | control | `PhotoViewer.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| States | "Job not found" | info | `JobDetail.tsx` | **no** | yes | **Preserved** |  |
| States | Driver job locked screen | info | `DriverJobLocked.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |

## 4. Vehicle inspection — mobile (`/inspection/:jobId/:type`)

| Area | Existing element | Type | Source | In v1 | In v2 | Status | Note |
|---|---|---|---|---|---|---|---|
| Shell | Back button · "Pickup inspection" · job ref · plate | nav | `InspectionFlow.tsx` | yes | yes | **Preserved** |  |
| Shell | Step progress (6 pickup / 5 delivery) | info | `InspectionFlow.tsx` | yes | yes | **Preserved** |  |
| Shell | Back / Next buttons | control | `InspectionFlow.tsx` | yes | yes | **Preserved** |  |
| Step 1 | Odometer reading * | control | `InspectionFlow.tsx` | yes | yes | **Preserved** |  |
| Step 1 | Fuel level * (Empty, 1/4, 1/2, 3/4, Full) | control | `FUEL_LEVEL_MAP` | yes | yes | **Preserved** |  |
| Step 2 | Vehicle Condition (Clean, Dirty, Wet, Snow Covered, Iced Over) | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Light (Good, Poor, Dark, Artificial, Raining) | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Oil Level (Ok / Issue) | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Water Level (Ok / Issue) | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Notes textarea ("Notes") | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Handbook · Service Book · MOT · V5 (Yes/No/N/A) | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Parcel Shelf · Spare Wheel · Tool Kit · Tyre Inflation Kit | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Locking Wheel Nut · Sat Nav Working | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Number of Keys * (number input with −/+) | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Alloys or Trims (Alloys / Trims) | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | Alloys Damaged? · Wheel Trims Damaged? (Yes/No) | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 2 | EV Charging Cables · Aerial · Customer Paperwork | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 3 | Vehicle diagram + damage pins | control | `VehicleDiagram.tsx` | **no** | yes | **Preserved** |  |
| Step 3 | Damage modal (VehicleDamageModal) | control | `VehicleDamageModal.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| Step 3 | Damage items list (edit) | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 4 | 7 photo slots (Front, Rear, Driver Side, Passenger Side, Interior, Dashboard, Fuel Gauge) | control | `PHOTO_TYPES_BY_INSPECTION` | yes | yes | **Preserved** |  |
| Step 4 | Additional photos + label | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 5 | Driver Name * + driver signature + Clear | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 5 | Customer Name * + customer signature | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 6 | Review summary (REVIEW_CHECKLIST rows) | info | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 6 | "Please ensure all information is correct…" | info | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Step 6 | Submit inspection | control | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Validation | Toast "Please complete the required fields" + missing list | info | `InspectionFlow.tsx` | **no** | yes | **Preserved** |  |
| Validation | Inline field errors | info | `(new, rendered from the same missing list)` | **no** | yes | **Preserved** |  |
| Safety | Storage-failure card / interrupted-inspection resume / offline banner | info | `StorageFailureCard, ResumeInterruptedInspection, OfflineBanner` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| Flow | Delivery variant (5 steps: no checklist) | info | `inspectionFormConfig.ts` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |

## 5. Admin dashboard (`/admin`, `/`)

| Area | Existing element | Type | Source | In v1 | In v2 | Status | Note |
|---|---|---|---|---|---|---|---|
| Shell | Title "Admin" + back | nav | `AdminDashboard.tsx` | yes | yes | **Preserved** |  |
| Shell | Bottom nav | nav | `BottomNav.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| KPI | Unassigned · Stale · POD Review · Evidence (click-through) | control | `AdminDashboard.tsx` | yes | yes | **Preserved** |  |
| Compliance | Strip: N pending review · N missing docs · N expired → /admin/onboarding | control | `AdminDashboard.tsx` | **no** | yes | **Preserved** |  |
| Needs Action | Ranked "Needs Action" queue (+ "No interventions required.") | info | `AdminDashboard.tsx` | **no** | yes | **Preserved** |  |
| Stale Active | Section list | info | `AdminDashboard.tsx` | yes | yes | **Preserved** |  |
| Awaiting Review | Section list | info | `AdminDashboard.tsx` | yes | yes | **Preserved** |  |
| Operations Buckets | 12 bucket tiles (labels from operationsBuckets.ts) | control | `operationsBuckets.ts` | **no** | yes | **Preserved** |  |
| Management | Full Jobs Queue | control | `AdminDashboard.tsx` | **no** | yes | **Preserved** |  |
| Management | Fleet & Drivers | control | `AdminDashboard.tsx` | yes | yes | **Preserved** |  |
| Management | Driver Onboarding | control | `AdminDashboard.tsx` | **no** | yes | **Preserved** |  |
| Management | POD Closure | control | `AdminDashboard.tsx` | **no** | yes | **Preserved** |  |
| Management | Expenses & Finance | control | `AdminDashboard.tsx` | **no** | yes | **Preserved** |  |
| Management | Super Admin Console (super-admin only) | control | `AdminDashboard.tsx` | **no** | yes | **Preserved** |  |
| States | "Access Denied" screen | info | `AdminDashboard.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |

## 6. Super-admin (`/control/super-admin`, `/super-admin`, `/super-admin/settings`)

| Area | Existing element | Type | Source | In v1 | In v2 | Status | Note |
|---|---|---|---|---|---|---|---|
| /control/super-admin | 5 KPI tiles: Organisations · Total Users · Active Jobs · Platform Exceptions · Audit Events Today | control | `ControlSuperAdmin.tsx` | **no** | yes | **Preserved** |  |
| /control/super-admin | Quick actions: Create Org · Manage Users · Review Audit · Review Exceptions · Export Report | control | `ControlSuperAdmin.tsx` | **no** | yes | **Preserved** |  |
| /control/super-admin | Global Incident Queue + Refresh | info | `ControlSuperAdmin.tsx` | **no** | yes | **Preserved** |  |
| /control/super-admin | Organisations ("All registered tenants") | info | `ControlSuperAdmin.tsx` | **no** | yes | **Preserved** |  |
| /control/super-admin | Recent Audit Activity ("Last 20 administrative actions") | info | `ControlSuperAdmin.tsx` | **no** | yes | **Preserved** |  |
| /control/super-admin | Error & Warning Feed ("Recent system errors") | info | `ControlSuperAdmin.tsx` | **no** | yes | **Preserved** |  |
| /super-admin | 4 tiles: Organisations · Users · Active Jobs · Audit Today | control | `SuperAdminDashboard.tsx` | yes | yes | **Preserved** |  |
| /super-admin | Quick Actions: Create Organisation · Create User · Review Exceptions · Inspect Audit Log | control | `SuperAdminDashboard.tsx` | **no** | yes | **Preserved** |  |
| /super-admin | Recent Audit | info | `SuperAdminDashboard.tsx` | yes | yes | **Preserved** |  |
| /super-admin | Platform Management: Organisations · Users · Jobs Monitor · Errors · Attention · Settings | control | `SuperAdminDashboard.tsx` | **no** | yes | **Preserved** |  |
| /super-admin/settings | Identity & Role Model (Auth source · Roles · Tenant isolation · Manage users) | info | `SuperAdminPages.tsx` | yes | yes | **Preserved** |  |
| /super-admin/settings | Feature switches (FeatureFlagsCard) | control | `FeatureFlagsCard.tsx` | **no** | yes | **Placeholder** | Shown as a labelled placeholder — content/behaviour not reviewed |
| /super-admin/settings | Platform Controls (Bulk operations · Maintenance mode — "Not yet available") | info | `SuperAdminPages.tsx` | yes | yes | **Preserved** |  |
| Sub-pages | Organisations (search · Create) / Users (filters · Sync Auth · New User) / Jobs Monitor (search · chips) / Audit Log / Error Feed / Global Attention (tiles · severity chips · filters) | control | `SuperAdminPages.tsx` | n/a | n/a | **Not drawn** | Documented: restyle via shared components; no prototype evidence |
| Shell | "Platform → Super Admin" nav group visible only to super-admin | nav | `navigation.ts` | yes | yes | **Preserved** |  |

## UI-only improvements required (apply during implementation, no behaviour change)

| ID | Improvement | Elements affected | Traceability |
|---|---|---|---|
| UI-1 | Status badge: dark text on tint + dot; keep label text | every status badge (screens 1,2,3,5) | U01 |
| UI-2 | KPI tiles: label top-left, icon chip top-right, value below; count-aware column rules, last odd tile spans on mobile | all KPI strips (screens 1,2,5,6) | U07, V01, V02 |
| UI-3 | Jobs row actions as 32px icon buttons with accessible names + tooltips (labels return on mobile cards) | screen 2 row actions | U14 and width evidence from the Jobs table render |
| UI-4 | Status secondary cues (Stale · Blocked · Action needed · Heads up) as visible text, not tooltip-only | screen 2 status cell | keyboard/touch users cannot hover (skill: "expose full text to keyboard pointer and touch users") |
| UI-5 | Validation: keep toast **and** render the same `missing` list as an inline summary + per-field messages | screen 4 | skill UX "Focusable Error Summary / Error Placement"; **needs sign-off** because focus management is behaviour-adjacent |
| UI-6 | Chip rows: wrap on desktop; on mobile keep horizontal scroll but add an edge fade | Jobs/POD/Drivers/Expenses chip rows | V04 (clipped chips) |
| UI-7 | Compact labels: `nowrap` + shrink, allow two-line KPI labels instead of "OR G…" truncation | mobile KPI tiles | V01, V02 |
| UI-8 | Ops-role pages inside the shared shell | `/`, `/admin`, `/super-admin*`, `/admin/users` | U03, U04, V05, V08 |
| UI-9 | Driver Job Detail keeps bottom nav **and** sticky next-step CTA (CTA above nav) | screen 3 | restored after review found v2 had replaced the nav |
