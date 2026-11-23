# Axentra Abort Fees — Client Agreement and Invoice Corrections

## Confirmed business decisions (23 November 2026)

1. **Client confirmation is required before any Admin fee approval.** A checkbox is an explicit Admin declaration, not independent proof of the client's agreement. This is recorded as the approver, server timestamp and confirmed amount on the Abort record and in the append-only review event. Rejecting a claim does not require confirmation.
2. **Abort fee may exceed the original agreed job price** if the client confirms it. Original `job_pricing.total_price`, the Abort `agreed_price` snapshot and `proposed_amount` remain unchanged. The separate `approved_amount` is the invoiceable charge. The existing approved-fee lock remains immediate.
3. **After invoicing**, do not edit the issued invoice or silently overwrite the approved fee. A Super Admin may perform a *full invoice credit + fee correction* in a single database transaction, with explicit client confirmation and written reason. A revised invoice is then created through the existing Invoice Prep flow and linked to the credit/correction.

## Operational workflow is unchanged

- Driver may request Abort without form; only Admin/Super Admin confirms.
- Confirming contact name normally required, no-name Admin exception allowed.
- Server authoritative Abort sign-off time (not presumed arrival).
- Abort is terminal for operations and immediately releases driver.
- Finance decisions remain separate from job status. No POD required.
- Customer notification remains optional.

## Client-confirmed approval and exceptional amendment

- `review_job_abort_claim` now has a fifth `p_client_confirmed` argument; it defaults to **false** and the old four-argument endpoint is removed. Old clients fail closed rather than approve without confirmation.
- `amend_approved_job_abort_claim` likewise requires confirmation of the **new** fee, and remains Super Admin-only with mandatory reason, expected old amount and no live invoice.
- The original-price cap is removed in UI, SQL review and amendment, and the database constraint.
- Non-negative amounts and exact pounds/pence validation remain.
- Historical approved records are **not retroactively labelled client-confirmed**. The existing £240 approval must remain unchanged.
- `job_aborts.client_fee_confirmed_at/by/amount` is recorded only for new declarations. Append-only events retain the financial decision trail.

## Correction of an invoiced fee

The Abort detail page shows the active invoice. Only Super Admin can begin correction. The dialog requires:

- The revised fee (which can be above the original job price).
- Reason (15–500 characters).
- Affirmation the client confirmed the revised fee.
- Additional acknowledgement if the invoice is **paid**: refund/payment reconciliation is manual, never automatic.
- Additional acknowledgement if the invoice includes **other jobs**: full credit reverses the whole invoice and makes those jobs available for re-invoicing.

On confirmation, `correct_invoiced_job_abort_fee` validates same organisation, latest approved fee, current aborted job, source invoice and administrator. Within one database transaction it calls the existing `cancel_invoice` and then the audited fee amendment function. If any step fails the entire correction rolls back.

- **Issued** invoice: existing `cancel_invoice` creates a full credit note; original invoice and credit note remain historically accessible.
- **Draft** invoice: draft is cancelled without a credit note.
- Credit notes are **full, not partial**; no documents are sent automatically.
- A record in `job_abort_invoice_corrections` links original invoice and credit note; the replacement invoice is attached by existing multi-job/legacy invoice insertion triggers.
- If revised fee is £0, no replacement invoice is required. If positive, the UI links to Invoice Prep with the client and affected job pre-selected. The invoice prep server-side checks still reverify the approved fee and duplicate invoice status.
- Multi-job invoices require the admin to re-invoice other released jobs where appropriate; the new flow does not silently duplicate unrelated charges.
- For paid invoices, a separate refund/payment reconciliation is required and must not be represented as automatically complete.

## Rollout and verification

Migration: `20261123215000_abort_client_confirmed_fee_corrections.sql` (rename to the actual Supabase migration version if applying via connector).

Rollback: guarded; **refuses** if new confirmations, higher fees or credit corrections exist, to avoid destroying history. Use a reviewed forward corrective migration for live financial decisions.

Tests: pending-approval checkboxes, above-original validation, one-time approval, amended fee re-attestation, Super Admin restrictions, paid/multi-job acknowledgement, full-credit invoice correction, replacement invoice linking, draft rollback safety, and invoice prep preselection.

No production claim or invoice should be changed by the migration itself; the correction RPC requires a separate authenticated deliberate user action.
