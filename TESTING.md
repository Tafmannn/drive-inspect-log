# AXENTRA Driver App – Manual Test Plan

## 1. Job Lifecycle

### 1.1 Create Job
- [ ] Navigate to Dashboard → My Jobs → "+" button
- [ ] Fill all required fields (vehicle reg, make/model, pickup & delivery details)
- [ ] Submit → job appears in My Jobs list
- [ ] Dashboard "My Jobs" count matches list length

### 1.2 Pickup Inspection (6 steps)
- [ ] Open job → tap "Start Pickup"
- [ ] Step 1: Enter odometer (numeric keyboard appears) and fuel level
- [ ] Step 2: Complete collection checklist (vehicle condition, equipment items)
- [ ] Step 3: Add damage via vehicle diagram → damage modal works, damage listed
- [ ] Step 4: Capture photos (standard + additional with labels)
- [ ] Step 5: Sign driver + customer signatures → signatures persist visually
- [ ] Step 6: Review & Submit shows:
  - "✓ Collected" green pill
  - All checklist answers in grouped section
  - Photo counts, damage list, signature status
- [ ] Submit → inspection saved, job status updates

### 1.3 Delivery Inspection (5 steps)
- [ ] Open job → tap "Start Delivery"
- [ ] Step 1: Odometer & fuel
- [ ] Step 2: Damage
- [ ] Step 3: Photos (at least one required)
- [ ] Step 4: Signatures
- [ ] Step 5: Review shows:
  - "✓ Collected" pill (from pickup data)
  - "✓ Delivering" pill
  - Pickup checklist (from collection) displayed
- [ ] Submit → job moves to "Last 14 days"

### 1.4 Counter Consistency
- [ ] Dashboard My Jobs count === My Jobs list length
- [ ] Dashboard Last 14 days count === Completed Jobs list length
- [ ] Dashboard Pending Uploads count === items with pending/failed status

## 2. POD Report & Email

### 2.1 POD Report Screen
- [ ] Open completed job → "View POD Report"
- [ ] Verify sections: Vehicle Details, Pickup Details, Pickup Checklist, Delivery Details, Delivery Checklist, Damage Summary, Photos, Signatures, Expenses, Declaration
- [ ] Signature images display correctly

### 2.2 POD PDF
- [ ] Tap "PDF" button → generates and shares/downloads PDF
- [ ] PDF contains: logo (if uploaded), centered title, aligned tables, checklists, horizontal signatures, page numbers
- [ ] No stray characters or misaligned text

### 2.3 Email POD
- [ ] Tap "Email" → native share sheet opens with PDF attached (iOS/Android)
- [ ] Subject: "Axentra POD – {JobID} – {REG}"
- [ ] Body contains professional message
- [ ] Fallback: opens mailto + downloads PDF if share API unavailable

## 3. Expenses

### 3.1 Add Expense
- [ ] Dashboard → Expenses tile → Add (+) button
- [ ] Select job, category, enter amount (decimal keyboard)
- [ ] Add receipt photos (camera + gallery)
- [ ] Save → expense appears in list with correct totals

### 3.2 Edit Expense
- [ ] Tap existing expense in list → edit form opens pre-filled
- [ ] Modify fields → save → changes reflected

### 3.3 Job-Linked Expenses
- [ ] Job Detail → Expenses section shows count + total
- [ ] "Add Expense" from job pre-selects that job
- [ ] POD Report shows expenses section

### 3.4 Export
- [ ] Dashboard → Exports → Expenses CSV downloads correctly
- [ ] CSV contains: Job Number, Reg, Date, Category, Amount, etc.

### 3.5 Totals
- [ ] Expenses screen shows Today / This Week / This Month totals
- [ ] Totals update after adding/editing expenses

## 4. Offline & Pending Uploads

### 4.1 Offline Photo Capture
- [ ] Enable airplane mode
- [ ] Complete inspection with photos → photos queued locally
- [ ] Toast indicates pending uploads
- [ ] Pending Uploads screen shows queued items

### 4.2 Retry
- [ ] Disable airplane mode
- [ ] Pending Uploads → "Retry All" → items upload successfully
- [ ] Items disappear from pending list
- [ ] Header upload badge count updates

### 4.3 Data Persistence
- [ ] Close and reopen app while offline → pending items still present
- [ ] No data loss on app restart

## 5. Navigation & UX

### 5.1 Back Buttons
- [ ] Every screen has a working back button
- [ ] Back from inspection goes to job detail
- [ ] Back from expenses goes to dashboard
- [ ] AXENTRA logo always navigates to dashboard

### 5.2 Keyboard Behaviour
- [ ] Text inputs maintain focus while typing (no dismissal after one char)
- [ ] Numeric inputs show appropriate keyboard (inputMode="numeric"/"decimal")
- [ ] Signature canvas: touch drawing works on mobile

### 5.3 Photo Viewer
- [ ] Thumbnail grid shows on inspection photo steps
- [ ] Tap → full-screen viewer with swipe + zoom
- [ ] Close button returns to previous view

## 6. Role-Based Gallery Restriction

- [ ] Default role = driver: photo file inputs force camera only
- [ ] Admin role: file inputs allow gallery selection
- [ ] Verify on iOS and Android

## 7. QR Handover Confirmation

- [ ] Job detail: Collection QR and Delivery QR buttons generate tokens
- [ ] QR link is copied to clipboard
- [ ] Opening /confirm?token=... shows handover confirmation page
- [ ] Customer enters name → confirms → status shows confirmed on job detail
- [ ] Expired tokens show expired message
- [ ] Already confirmed tokens show done message

## 8. Admin Dashboard

- [ ] Navigate from main dashboard → Admin Dashboard tile
- [ ] Widgets: Jobs In Progress, Completed Today/Week, Pending Uploads, Week Expenses
- [ ] Quick actions navigate correctly (All Jobs, All Expenses, Timesheets, Pending Uploads)
- [ ] Exports work from admin dashboard

## 9. Timesheets

- [ ] Navigate from Admin Dashboard → Timesheets
- [ ] 7/14/30 day range filters update data
- [ ] Summary row shows total jobs, miles, expenses
- [ ] Per-day rows show first/last activity, job count, mileage, expenses
- [ ] CSV export downloads correctly

## 10. Authentication (Disabled State)

- [ ] No login screen appears
- [ ] App functions normally as driver role
- [ ] AuthContext provides correct defaults
- [ ] Admin Dashboard accessible without login

## 11. CSV Exports

- [ ] Jobs CSV: all fields present, downloads correctly
- [ ] Inspections CSV: linked to correct jobs
- [ ] Expenses CSV: includes job references and receipt counts

## Invoicing with expenses, VAT switch and lifecycle

Needs migrations `20261114120000`, `20261114130000`, `20261114140000`.
See `docs/invoicing-and-accounts.md`.

### Create a multi-job invoice
- [ ] Control → Invoice Prep → pick a client with ≥ 2 completed jobs that have expenses
- [ ] Tick the jobs → "3. Rechargeable Expenses" appears; Fuel is pre-ticked, other categories are not
- [ ] An expense with no receipt shows "No receipt"; ticking it shows the warning
- [ ] A category chip ticks / clears every expense in that category
- [ ] Preview shows one line per job: Transport, Expenses, Total; totals match
- [ ] VAT off: no VAT line, "Total due", "Not VAT registered" note
- [ ] "Preview PDF" downloads a PDF marked PREVIEW with the receipt pages
- [ ] Create Invoice → success card; the jobs leave the eligible list; ticked expenses are no longer offered for those jobs
- [ ] Client marked "PO required": Create is refused until a PO is entered

### The PDF
- [ ] Page 1: header "N jobs | date range", Your Ref / PO, job rows with the grey expense line, payment details beside the total
- [ ] Receipt pages: 6 per page, each captioned R01… matching page 1
- [ ] Footer on every page: business name + address, "Page x of y"
- [ ] A single-job invoice from a POD ("Create Invoice") still looks as before, with no VAT line when VAT is off

### Lifecycle
- [ ] Draft → "Mark as sent": badge becomes Sent; re-download gives the same file
- [ ] Email to client: recipient confirm → email arrives with a working link; badge becomes Sent
- [ ] Sent → "Record payment" → Paid, with the date; "Undo payment" returns it to Sent
- [ ] A sent invoice past its due date shows Overdue
- [ ] Cancel a draft: reason required; badge Cancelled; its jobs are selectable again
- [ ] Cancel a sent invoice: a credit note CNyy-000n appears; both stay listed; jobs + expenses selectable again
- [ ] Download pack: ZIP with the PDF and a `receipts/` folder containing only that invoice's receipts

### VAT switch (super admin)
- [ ] Organisations → organisation → "VAT registered" toggle; warning while no VAT number / address is saved
- [ ] VAT on: Invoice Prep shows the VAT rate and VAT line; PDF has Subtotal / VAT / Total and Schedule A
- [ ] Invoices created before the toggle are unchanged

### Client portal
- [ ] Portal → Invoices: sent invoices only; Paid / Cancelled / Credit note badges
- [ ] Download PDF returns the stored file including receipt pages
- [ ] A draft invoice is not visible; another client's invoice cannot be opened

### Accounts and Xero
- [ ] Control → Exports → Accounts: figures load for "This month"; changing the period updates them
- [ ] Draft invoices dated in the period are reported as not counted
- [ ] Download accounts pack → ZIP opens; `Accounts_Summary.xlsx` opens in Excel with 6 tabs; `Expenses.csv` "Receipt file" names match files in `Receipts/`
- [ ] Xero sales CSV imports into a Xero demo company as Tax Exclusive; totals match the invoices
- [ ] Xero bills CSV imports as Tax Inclusive
- [ ] VAT threshold bar shows the last-12-months figure (hidden once VAT registered)
