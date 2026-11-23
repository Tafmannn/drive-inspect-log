# Abort workflow

A collection that cannot go ahead (vehicle unavailable, customer cancels, site will not release it)
is **Aborted** by an admin. The agreed fee may then be claimed, after a separate fee review.

## Who does what

| | Driver | Admin / Super Admin |
|---|---|---|
| Request an Abort (one tap on an eligible job) | ✅ | — |
| Confirm an Abort (`Abort Job` → *Abort Collection*) | ❌ | ✅ |
| Dismiss a driver's request | ❌ | ✅ |
| Approve (full / partial / £0) or reject the fee | ❌ | ✅ |
| Notify the customer (optional, never automatic) | ❌ | ✅ |
| Reopen the job / rebook as a linked new job | ❌ | ✅ |

Eligible = before collection: `new`, `pending`, `ready_for_pickup`, `assigned`, `pickup_in_progress`,
with no pickup inspection submitted. Whether the driver has arrived does not matter.

## What confirming does (one transaction, `confirm_job_abort`)

1. Job → `aborted` (operationally closed; not completed, not cancelled, no POD).
2. A `job_aborts` row: contact name **or** the no-name exception, the confirming admin, and
   **Abort confirmed at** = the server's `now()` (timestamptz, shown in Europe/London time).
3. Agreed price copied from `job_pricing` (never changed; unknown stays empty, never £0).
   Proposed claim = agreed price. Fee status = `pending_review`.
4. Any pending driver request → `confirmed`.
5. Driver keeps the assignment for history but the job leaves every active list, and the driver
   loses access to its evidence.

Only `confirm_job_abort` can set `aborted`, and only `reopen_job` can leave it — a database trigger
refuses every other path (direct writes, the status picker, the super-admin override,
`submit_inspection`, `complete_job`, service role).

## Money

- An aborted job is invoice-ready only when its fee is **approved above £0** and the job has billing
  details. No inspections, photos or POD are needed on that path. Ordinary jobs are unchanged.
- The invoice line is *Abort at Collection — ref — reg* at the **approved** amount. The database
  refuses an invoice line for an unapproved Abort, or above the approved fee plus that job's own
  expenses, on both the multi-job and the legacy single-job invoice paths.
- The existing one-live-invoice-per-job guard still prevents double billing.
- Once invoiced, the fee cannot be re-reviewed and the job cannot be reopened (rebook instead).
- Reopening closes the Abort's claim; it stays in the history but can never be invoiced.
- Aborts do not count as completed moves, as cancellations, or against a driver's completion rate.

## Where it lives

- Database: `supabase/migrations/20261123100000_job_abort_workflow.sql`
  (rollback: `supabase/rollback/20261123100000_job_abort_workflow.down.sql`;
  scenario test: `supabase/tests/job_abort_workflow.sql`, runs in a rolled-back transaction).
- App: `src/features/abort` (rules, API, hooks, dialog, panel, Aborts view),
  `src/lib/invoiceReadiness.ts`, `src/features/invoicing/*`, `src/features/portal/lib/portalStatus.ts`.
- Admin queue: **Jobs → Aborts** (`/control/jobs?view=aborts`).

## Release state (verified 23 November 2026)

The original PR #176 release plan is now historical. **Do not run its steps blindly.**

- **GitHub:** PR #176 has been merged into `main`.
- **Production database:** project `lynkvfduzqdyvlzgriyh` has the `20261123100000_job_abort_workflow` migration recorded as applied. Tables, admin/driver RPCs, RLS policies, the job status guard and the two invoice guards have been observed. **Do not re-apply this migration to production.**
- **Production customer email:** `notify-customers` is deployed with the `aborted` event.
- **Production push:** `send-push` was manually deployed as v15 on 23 November 2026 and its deployed source was read back: `abort-requested` and the three shared authorization modules are present. Because `send-push` is deliberately excluded from `supabase/config.toml` automatic deployment (historical bundle 413 issue), future changes to this function need an **explicit targeted deploy and source read-back**.
- **Staging:** project `mfedxybzajdgavzmajkl` is significantly behind production. It lacks `job_pricing`, `customer_notifications`, `invoice_items.voided`, `invoices.document_type`, the Abort tables and Edge Function deployments. **Do not apply the standalone Abort migration there; its prerequisites are missing.**
- **Types:** generated against the actual production schema in draft PR #178; release only after checks pass.
- **Tests:** PR #176's locally stubbed Postgres scenario tests are not a substitute for a clean live staging migration, and current production has not undergone an authenticated end-to-end smoke test.

### Remaining release gates

1. Approve a staging-parity plan after reviewing migration ordering, schema drift, staging data retention and restoration options. Rebuild or synchronize staging safely, then run its SQL scenario tests inside a rollback transaction.
2. Validate with a real driver and admin account that an Abort request produces the intended admin push and never aborts the job until admin confirmation.
3. Exercise admin confirmation, no-name exception, fee review, billing guards and optional customer notification. Check existing job-assigned and POD push paths too.
4. Review SonarQube coverage/reliability findings. Do not confuse a successful scanner upload with a passing quality gate; draft PR #178 makes the gate blocking in GitHub CI.
5. After validating PR #178 and staging parity, merge the follow-up PR and verify the new release. Production schema migrations should only run if a **new, reviewed** migration is actually needed.

Tracking: [Issue #177](https://github.com/Tafmannn/drive-inspect-log/issues/177), [draft PR #178](https://github.com/Tafmannn/drive-inspect-log/pull/178).
