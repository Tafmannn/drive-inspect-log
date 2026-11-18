# Complete screen coverage matrix (88 screenshots)

Every one of the 88 captured screenshots was opened and looked at (full size, enlarged sheet or contact sheet — see "Viewed at"). Classification describes **evidence value**, not how long I looked:

- **Fully visually assessed** — final static content rendered (form, auth page, static copy) and inspected at ≥ 67% scale.
- **Partially assessed** — real chrome and controls rendered (shell, KPI frames, filters, search, buttons) but the data region is a skeleton/spinner, so *populated* quality is not evidenced.
- **Loading/empty/error state only** — little beyond the standard shell; skeletons, spinner, empty or error state.
- **Unavailable or inaccessible** — the route did not render its own UI in review mode.

**Skeleton loaders are not evidence of populated dashboard quality.** Populated layouts are assessed separately with fictional-data demonstrations (`10-populated-layout-assessment.md`).

**Packaging note:** only the 26 screenshots needed for comparison are committed under `screenshots/current/`; the other 62 were reviewed but are not packaged (they are reproducible with `tools/capture-current.cjs`). Rows below keep their original file names for traceability.

Fonts: this container resolves `system-ui` to **Inter**, so these screenshots show Inter, not the OS font real users see (see `13-typography-and-font-evaluation.md`).

## Totals (per screenshot)

| Classification | Screenshots | Slugs (×2 viewports) |
|---|---|---|
| Fully visually assessed | 14 | 7 |
| Partially assessed | 44 | 22 |
| Loading/empty/error state only | 26 | 13 |
| Unavailable or inaccessible | 4 | 2 |
| **Total** | **88** | **44** |

## Matrix

| Screenshot | Viewport | Classification | Viewed at | Verified observations |
|---|---|---|---|---|
| `current/desktop-login.png` | desktop | Fully visually assessed | full size (2×) | Static. Dark glass card on gradient; tagline and footer text very faint; footer names the backend vendor. |
| `current/desktop-forgot.png` | desktop | Fully visually assessed | enlarged sheet (67%) | Static. Same dark glass card; tracked-caps subtitle very faint. |
| `current/desktop-welcome.png` | desktop | Fully visually assessed | enlarged sheet (67%) | Static (invalid-invite state). Yellow-on-dark notice readable; same dark glass family. |
| `current/desktop-notfound.png` | desktop | Fully visually assessed | enlarged sheet (67%) | Static. Minimal 404 with bottom nav. |
| `current/desktop-driver-home.png` | desktop | Loading/empty/error state only | contact sheet (44%) | KPI-pill frames + 3 list skeletons. No data. |
| `current/desktop-driver-jobs.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Header stack + 3 card skeletons. Fixed chrome ≈24% (measured at 390×844). |
| `current/desktop-driver-job-detail.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Fake job id → skeletons only. Structure unverifiable. |
| `current/desktop-driver-inspection.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Spinner only (fake job id). Step UIs not rendered. |
| `current/desktop-driver-uploads.png` | desktop | Loading/empty/error state only | enlarged sheet (67%) | Empty state ("No pending uploads. All photos are synced."). Upload icon + one line. |
| `current/desktop-driver-profile.png` | desktop | Partially assessed | enlarged sheet (67%) | Avatar, role chip, 3 KPI frames, Expenses/Digital ID rows render; lower section is a spinner. Expenses row icon reads as "$". |
| `current/desktop-driver-expenses.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Empty state with £0.00 summary and filter chips; chip row clips ("Al…") with no scroll cue; "$"-like receipt icon in a £ app. |
| `current/desktop-driver-completed.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Skeletons only. |
| `current/desktop-admin-home.png` | desktop | Partially assessed | full size (2×) | 4 KPI-pill frames (mobile labels truncate: "UNASSIG…", "POD REVI…") + skeleton lists. Desktop: ~744px column + full-width bottom nav. |
| `current/desktop-admin-dash.png` | desktop | Partially assessed | contact sheet (44%) | Same as admin-home with a back arrow and "Admin" title. |
| `current/desktop-admin-jobs.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Admin sees the driver-style "My Jobs" page with a "+" action; skeletons only. |
| `current/desktop-admin-master.png` | desktop | Partially assessed | enlarged sheet (67%) | Search, status filter, View Archived render; list is skeletons. Mobile stacks the three controls. |
| `current/desktop-admin-job-new.png` | desktop | Fully visually assessed | enlarged sheet (67%) | Real form: Client*, one-off checkbox, Job Number, Registration* + DVLA, Make*, Model*, Colour*, Year… Single narrow column inside mobile shell on desktop. No validation states rendered. |
| `current/desktop-admin-job-detail.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Skeletons only. |
| `current/desktop-admin-users.png` | desktop | Loading/empty/error state only | full size (2×) | Empty state "No users found." No app shell on desktop; filters wrap into uneven rows on mobile. |
| `current/desktop-admin-timesheets.png` | desktop | Partially assessed | enlarged sheet (67%) | Chips (7/14/30 days), stat card (0 / 0 / £0.00), CSV action render; list skeleton. |
| `current/desktop-admin-onboarding.png` | desktop | Partially assessed | contact sheet (44%) | Filter select + New button render; list skeleton. |
| `current/desktop-admin-invoice-new.png` | desktop | Fully visually assessed | enlarged sheet (67%) | Real form (Invoice Details, Bill To…); Save Draft/PDF actions; red error toast. Mobile: header buttons clipped at right edge. |
| `current/desktop-control-overview.png` | desktop | Partially assessed | full size (2×) | Control shell; 7 KPI frames (orphan on row 2 at 1440px; 2-col with odd tile on mobile); shortcut buttons; sections loading. |
| `current/desktop-control-jobs.png` | desktop | Partially assessed | full size (2×) | KPI frames, search, 10 view chips; queues skeleton. Mobile chip row clips. |
| `current/desktop-control-pod.png` | desktop | Partially assessed | contact sheet (44%) | KPI frames (6), search, view chips; skeleton. Mobile chip row clips. |
| `current/desktop-control-drivers.png` | desktop | Partially assessed | contact sheet (44%) | KPI frames (4), search + 6 chips; roster skeleton. |
| `current/desktop-control-compliance.png` | desktop | Partially assessed | contact sheet (44%) | Period chips, KPI frames (4), Alerts/Digest cards; skeleton. |
| `current/desktop-control-finance.png` | desktop | Partially assessed | contact sheet (44%) | Export CSV + New Expense, KPI frames (6), search + chips; skeleton. |
| `current/desktop-control-profit.png` | desktop | Partially assessed | contact sheet (44%) | KPI frames (5), period chips, Jobs table card; skeleton. |
| `current/desktop-control-clients.png` | desktop | Partially assessed | contact sheet (44%) | Link jobs + New Client, KPI frames (3), search, Show archived toggle; skeleton. |
| `current/desktop-control-invoice-prep.png` | desktop | Partially assessed | contact sheet (44%) | Step 1 Select Client; Invoices card "Loading invoices…". |
| `current/desktop-control-admin.png` | desktop | Partially assessed | contact sheet (44%) | Admin dashboard link + User Management card (search, 3 filters, Refresh, New User); empty. |
| `current/desktop-control-exports.png` | desktop | Fully visually assessed | enlarged sheet (67%) | Rich static content: Accounts pack (period select, 2 checkboxes, download), Xero import files, raw data exports. Good form-density evidence. |
| `current/desktop-super-dash.png` | desktop | Partially assessed | full size (2×) | Legacy mobile-shell page: 4 tiles, Quick Actions (4), Recent Audit skeleton. Stretched column + bottom nav on desktop. |
| `current/desktop-super-orgs.png` | desktop | Partially assessed | contact sheet (44%) | Search + Create render; list skeleton. |
| `current/desktop-super-users.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Empty state; filters + Sync Auth + New User wrap on mobile. |
| `current/desktop-super-jobs.png` | desktop | Partially assessed | contact sheet (44%) | Search + 4 chips render; list skeleton. |
| `current/desktop-super-audit.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Skeletons only. |
| `current/desktop-super-errors.png` | desktop | Loading/empty/error state only | contact sheet (44%) | Skeletons only. |
| `current/desktop-super-attention.png` | desktop | Partially assessed | contact sheet (44%) | 4 tiles with "…" counts, severity chips, category/org filters; "Loading exceptions…". |
| `current/desktop-super-settings.png` | desktop | Partially assessed | enlarged sheet (67%) | Identity & Role Model and Platform Controls cards render; Feature switches card shows a spinner (omitted from first prototype). |
| `current/desktop-control-super.png` | desktop | Partially assessed | enlarged sheet (67%) | Control-shell super-admin: 5 KPI frames, 5 quick-action buttons, Global Incident Queue, Organisations, Recent Audit Activity, Error & Warning Feed. Mobile KPI labels truncate to 2–3 characters. |
| `current/desktop-portal-jobs.png` | desktop | Unavailable or inaccessible | contact sheet (44%) | Redirected to the driver home (portal role required) → no portal UI. |
| `current/desktop-portal-invoices.png` | desktop | Unavailable or inaccessible | contact sheet (44%) | Redirected to the driver home → no portal UI. |
| `current/mobile-login.png` | mobile | Fully visually assessed | contact sheet (85%) | Static. Dark glass card on gradient; tagline and footer text very faint; footer names the backend vendor. |
| `current/mobile-forgot.png` | mobile | Fully visually assessed | contact sheet (85%) | Static. Same dark glass card; tracked-caps subtitle very faint. |
| `current/mobile-welcome.png` | mobile | Fully visually assessed | contact sheet (85%) | Static (invalid-invite state). Yellow-on-dark notice readable; same dark glass family. |
| `current/mobile-notfound.png` | mobile | Fully visually assessed | contact sheet (85%) | Static. Minimal 404 with bottom nav. |
| `current/mobile-driver-home.png` | mobile | Loading/empty/error state only | full size (2×) | KPI-pill frames + 3 list skeletons. No data. |
| `current/mobile-driver-jobs.png` | mobile | Loading/empty/error state only | full size (2×) | Header stack + 3 card skeletons. Fixed chrome ≈24% (measured at 390×844). |
| `current/mobile-driver-job-detail.png` | mobile | Loading/empty/error state only | contact sheet (85%) | Fake job id → skeletons only. Structure unverifiable. |
| `current/mobile-driver-inspection.png` | mobile | Loading/empty/error state only | full size (2×) | Spinner only (fake job id). Step UIs not rendered. |
| `current/mobile-driver-uploads.png` | mobile | Loading/empty/error state only | contact sheet (85%) | Empty state ("No pending uploads. All photos are synced."). Upload icon + one line. |
| `current/mobile-driver-profile.png` | mobile | Partially assessed | contact sheet (85%) | Avatar, role chip, 3 KPI frames, Expenses/Digital ID rows render; lower section is a spinner. Expenses row icon reads as "$". |
| `current/mobile-driver-expenses.png` | mobile | Loading/empty/error state only | full size (2×) | Empty state with £0.00 summary and filter chips; chip row clips ("Al…") with no scroll cue; "$"-like receipt icon in a £ app. |
| `current/mobile-driver-completed.png` | mobile | Loading/empty/error state only | contact sheet (85%) | Skeletons only. |
| `current/mobile-admin-home.png` | mobile | Partially assessed | contact sheet (85%) | 4 KPI-pill frames (mobile labels truncate: "UNASSIG…", "POD REVI…") + skeleton lists. Desktop: ~744px column + full-width bottom nav. |
| `current/mobile-admin-dash.png` | mobile | Partially assessed | contact sheet (85%) | Same as admin-home with a back arrow and "Admin" title. |
| `current/mobile-admin-jobs.png` | mobile | Loading/empty/error state only | contact sheet (85%) | Admin sees the driver-style "My Jobs" page with a "+" action; skeletons only. |
| `current/mobile-admin-master.png` | mobile | Partially assessed | contact sheet (85%) | Search, status filter, View Archived render; list is skeletons. Mobile stacks the three controls. |
| `current/mobile-admin-job-new.png` | mobile | Fully visually assessed | contact sheet (85%) | Real form: Client*, one-off checkbox, Job Number, Registration* + DVLA, Make*, Model*, Colour*, Year… Single narrow column inside mobile shell on desktop. No validation states rendered. |
| `current/mobile-admin-job-detail.png` | mobile | Loading/empty/error state only | contact sheet (85%) | Skeletons only. |
| `current/mobile-admin-users.png` | mobile | Loading/empty/error state only | contact sheet (85%) | Empty state "No users found." No app shell on desktop; filters wrap into uneven rows on mobile. |
| `current/mobile-admin-timesheets.png` | mobile | Partially assessed | contact sheet (85%) | Chips (7/14/30 days), stat card (0 / 0 / £0.00), CSV action render; list skeleton. |
| `current/mobile-admin-onboarding.png` | mobile | Partially assessed | contact sheet (85%) | Filter select + New button render; list skeleton. |
| `current/mobile-admin-invoice-new.png` | mobile | Fully visually assessed | contact sheet (85%) | Real form (Invoice Details, Bill To…); Save Draft/PDF actions; red error toast. Mobile: header buttons clipped at right edge. |
| `current/mobile-control-overview.png` | mobile | Partially assessed | contact sheet (85%) | Control shell; 7 KPI frames (orphan on row 2 at 1440px; 2-col with odd tile on mobile); shortcut buttons; sections loading. |
| `current/mobile-control-jobs.png` | mobile | Partially assessed | contact sheet (85%) | KPI frames, search, 10 view chips; queues skeleton. Mobile chip row clips. |
| `current/mobile-control-pod.png` | mobile | Partially assessed | contact sheet (85%) | KPI frames (6), search, view chips; skeleton. Mobile chip row clips. |
| `current/mobile-control-drivers.png` | mobile | Partially assessed | contact sheet (85%) | KPI frames (4), search + 6 chips; roster skeleton. |
| `current/mobile-control-compliance.png` | mobile | Partially assessed | contact sheet (85%) | Period chips, KPI frames (4), Alerts/Digest cards; skeleton. |
| `current/mobile-control-finance.png` | mobile | Partially assessed | contact sheet (85%) | Export CSV + New Expense, KPI frames (6), search + chips; skeleton. |
| `current/mobile-control-profit.png` | mobile | Partially assessed | contact sheet (85%) | KPI frames (5), period chips, Jobs table card; skeleton. |
| `current/mobile-control-clients.png` | mobile | Partially assessed | contact sheet (85%) | Link jobs + New Client, KPI frames (3), search, Show archived toggle; skeleton. |
| `current/mobile-control-invoice-prep.png` | mobile | Partially assessed | contact sheet (85%) | Step 1 Select Client; Invoices card "Loading invoices…". |
| `current/mobile-control-admin.png` | mobile | Partially assessed | contact sheet (85%) | Admin dashboard link + User Management card (search, 3 filters, Refresh, New User); empty. |
| `current/mobile-control-exports.png` | mobile | Fully visually assessed | contact sheet (85%) | Rich static content: Accounts pack (period select, 2 checkboxes, download), Xero import files, raw data exports. Good form-density evidence. |
| `current/mobile-super-dash.png` | mobile | Partially assessed | contact sheet (85%) | Legacy mobile-shell page: 4 tiles, Quick Actions (4), Recent Audit skeleton. Stretched column + bottom nav on desktop. |
| `current/mobile-super-orgs.png` | mobile | Partially assessed | contact sheet (85%) | Search + Create render; list skeleton. |
| `current/mobile-super-users.png` | mobile | Loading/empty/error state only | contact sheet (85%) | Empty state; filters + Sync Auth + New User wrap on mobile. |
| `current/mobile-super-jobs.png` | mobile | Partially assessed | contact sheet (85%) | Search + 4 chips render; list skeleton. |
| `current/mobile-super-audit.png` | mobile | Loading/empty/error state only | contact sheet (85%) | Skeletons only. |
| `current/mobile-super-errors.png` | mobile | Loading/empty/error state only | contact sheet (85%) | Skeletons only. |
| `current/mobile-super-attention.png` | mobile | Partially assessed | contact sheet (85%) | 4 tiles with "…" counts, severity chips, category/org filters; "Loading exceptions…". |
| `current/mobile-super-settings.png` | mobile | Partially assessed | contact sheet (85%) | Identity & Role Model and Platform Controls cards render; Feature switches card shows a spinner (omitted from first prototype). |
| `current/mobile-control-super.png` | mobile | Partially assessed | contact sheet (85%) | Control-shell super-admin: 5 KPI frames, 5 quick-action buttons, Global Incident Queue, Organisations, Recent Audit Activity, Error & Warning Feed. Mobile KPI labels truncate to 2–3 characters. |
| `current/mobile-portal-jobs.png` | mobile | Unavailable or inaccessible | contact sheet (85%) | Redirected to the driver home (portal role required) → no portal UI. |
| `current/mobile-portal-invoices.png` | mobile | Unavailable or inaccessible | contact sheet (85%) | Redirected to the driver home → no portal UI. |
