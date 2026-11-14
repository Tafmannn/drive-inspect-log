# Invoicing, expenses and accounts

How multi-job invoicing, rechargeable expenses, the VAT switch, the invoice
lifecycle and the accounts exports work, and how to deploy them.

## Deploying

The frontend on this branch **requires** three database migrations. Apply
them first, in order, then deploy the frontend. Until they are applied,
Invoice Prep cannot create invoices (it reads `organisations.vat_registered`
and `invoice_expenses`); logging expenses and everything else keeps working.

1. Run section (A) of
   `supabase/verification/20261114120000_invoicing_expenses_lifecycle_portal.sql`.
2. Apply, in order:
   - `20261114120000_invoice_expenses_and_vat_setting.sql`
   - `20261114130000_invoice_lifecycle.sql`
   - `20261114140000_portal_invoice_status_and_pdf.sql`
3. Run section (B) of the verification file.
4. Deploy the frontend.

All three are additive. Existing invoices are not modified; the only
existing object that changes is the unique index on `invoice_items(job_id)`,
recreated with an extra `NOT voided` condition (identical for existing rows).
Rollbacks are in `supabase/rollback/`.

`supabase/tests/invoice_lifecycle.test.sql` exercises the rules (double
billing, immutability, cancel/credit, RLS, portal access). It inserts
fixtures — run it only on a scratch database.

### One-off set-up after deploying

- **Business details** (super admin → Organisations → your organisation →
  Edit): legal name and trading address. They print in the footer of every
  invoice. The organisation page warns while they are missing.
- **VAT**: off by default. Turn it on from the organisation page on the date
  the VAT registration takes effect, and add the VAT number.
- **Old draft invoices**: every invoice created before this change is still
  a draft. For each one that was really sent, use *Mark as sent* (then
  *Record payment* if it was paid) so it counts in the accounts.
- **Clients**: set payment terms (drives the due date) and tick *PO required*
  where a client rejects invoices without one.

## Creating an invoice (Control → Invoice Prep)

1. Pick the client.
2. Tick the completed, un-invoiced jobs.
3. Tick the expenses to recharge. Fuel is pre-ticked; category chips tick or
   clear a whole category. An expense with no receipt is flagged.
4. Check the preview, enter the client's PO if they need one, optionally
   *Preview PDF*, then *Create Invoice*.

The invoice has one line per job — transport, that job's expenses, total —
with the expenses itemised underneath and tied to receipt references
(R01, R02 …). Copies of exactly those receipts follow the invoice in the same
PDF, six per page.

An expense can be on one invoice only; a job can be on one invoice only.
The database enforces both.

### VAT

| | VAT off (not registered) | VAT on |
|---|---|---|
| Invoice | No VAT line; "Total due"; "Not registered for VAT" | Subtotal, VAT, Total |
| Expenses recharged at | The amount paid | The amount paid less the VAT recorded on the expense |
| Extra page | — | Schedule A: net / VAT / gross per receipt |

The switch is read when an invoice is created and stored on the invoice, so
turning it on later never changes an existing invoice.

## Invoice lifecycle

`draft → sent → paid`, or `cancelled`.

- **Draft**: created, not yet issued. It can still be cancelled without
  trace beyond its number.
- **Sent**: emailing from the app, or *Mark as sent*, issues the invoice.
  The PDF is stored at that moment and is what every later download, email
  and the client portal serve. The invoice's contents can no longer be
  changed or deleted — by anyone, including directly in the database.
- **Paid**: *Record payment* (date, method, reference). *Undo payment*
  reverses a mistake.
- **Overdue** is shown automatically for a sent invoice past its due date.
- **Cancel**: a draft is simply cancelled. A sent or paid invoice is
  cancelled with a **credit note** (CN26-0001 …) for the full amount; both
  stay on record. Either way the jobs and expenses can be invoiced again.
  Partial credit notes are not supported.

## Accounts (Control → Exports → Accounts)

Pick a period: this/last month, an MTD quarter, a tax year, or custom dates.

- **Accounts pack** — one ZIP for the accountant: `Accounts_Summary.xlsx`,
  `Sales_Invoices.csv`, `Expenses.csv`, the Xero files, a PDF of every issued
  invoice and every receipt (named to match the expenses list).
- **Xero** — *Sales invoices* (import as **Tax Exclusive**) and *Bills from
  expenses* (import as **Tax Inclusive**). Account codes and tax-rate names
  are under *Xero settings* and must match the Xero organisation. Read
  `Xero/README.txt` in the pack before the first import.
- **VAT registration threshold** — invoiced income over the last 12 months
  against £90,000, with warnings at 80% and 95%.

Income is counted by invoice date for invoices that were **issued**. Drafts
are not counted; the page says how many were left out.

### Known limits

- Xero's CSV import cannot take credit notes: cancelled invoices and their
  credit notes are listed for manual entry rather than exported.
- Xero account codes are saved per browser, not per organisation.
- Bank details on the invoice are still fixed in `src/lib/invoicePdf.ts`
  (`AXENTRA_BANK`), not per organisation.
- A receipt that is a PDF file (not a photo) cannot be embedded in the
  invoice PDF; it shows as "image unavailable" there but is included in the
  pack ZIP.
