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
- **Fee approval is final immediately** — repeat Approve or Reject calls cannot change an already-reviewed claim, even before an invoice exists.
- An exceptional correction to an approved, not-yet-invoiced fee is **Super Admin-only**, requires a 15–500 character explanation, checks that the amount still matches what was reviewed, and records the previous/new fee and actor in the append-only Abort event log. The original approver, original review timestamp and review note remain untouched.
- Once invoiced, the approved amount cannot be amended through the Abort workflow. Follow the invoice/credit-note process for corrections; do not edit historic invoice amounts in place.
- An invoiced Abort job cannot be reopened (rebook instead).
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

- **GitHub:** PR #176 and corrective PR #178 have both been merged into `main`; SonarQube passed at 80% new-code coverage (1,968 tests passed).
- **Production database:** project `lynkvfduzqdyvlzgriyh` has the `20261123100000_job_abort_workflow` migration recorded as applied. Tables, admin/driver RPCs, RLS policies, the job status guard and the two invoice guards have been observed. **Do not re-apply this migration to production.**
- **Production customer email:** `notify-customers` is deployed with the `aborted` event.
- **Production push:** `send-push` was manually deployed as v15 on 23 November 2026 and its deployed source was read back: `abort-requested` and the three shared authorization modules are present. Because `send-push` is deliberately excluded from `supabase/config.toml` automatic deployment (historical bundle 413 issue), future changes to this function need an **explicit targeted deploy and source read-back**.
- **Staging:** project `mfedxybzajdgavzmajkl` has 10 jobs and one user (not an empty disposable database), and 44 repository migrations remain unapplied after accounting for custom migration names. It lacks `job_pricing`, `customer_notifications`, `invoice_items.voided`, `invoices.document_type`, the Abort tables and Edge Function deployments. **Do not apply the standalone Abort migration there; its prerequisites are missing. Do not reset without a restorable backup and owner approval.**
- **Types:** regenerated against the actual production schema and merged in PR #178. The post-merge Vercel deployment for that commit succeeded.
- **Tests:** PR #176's locally stubbed Postgres scenario tests are not a substitute for a clean live staging migration, and current production has not undergone an authenticated end-to-end smoke test.

### Remaining release gates

1. Approve a staging-parity plan after reviewing migration ordering, schema drift, staging data retention and restoration options. Rebuild or synchronize staging safely, then run its SQL scenario tests inside a rollback transaction.
2. Validate with a real driver and admin account that an Abort request produces the intended admin push and never aborts the job until admin confirmation.
3. Exercise admin confirmation, no-name exception, fee review, billing guards and optional customer notification. Check existing job-assigned and POD push paths too.
4. SonarQube passed its 80% new-code coverage requirement on PR #178 and its gate now blocks GitHub Build on failure. Keep that protection active.
5. PR #178 was merged and Vercel reported a successful deployment. Run role-specific authenticated smoke tests before declaring the workflow end-to-end certified. Production schema migrations should only run if a **new, reviewed** migration is needed.

Tracking: [Issue #177](https://github.com/Tafmannn/drive-inspect-log/issues/177), [draft PR #178](https://github.com/Tafmannn/drive-inspect-log/pull/178).

### Staging synchronization safety

`scripts/sync-staging-migrations.sh` is dry-run by default. It understands staging's rebuilt timestamp history **and** its two bare-name catalogue migrations, avoiding duplicate application. Before running any DDL, obtain and verify a **restorable staging backup**, inspect the pending migration list and dependencies in order, and confirm the connected project is `mfedxybzajdgavzmajkl`. The script requires both the known staging project ref in its connection URL and `STAGING_BACKUP_VERIFIED=YES` for `--apply`.

No staging schema or data was modified during the PR #178 release recovery. A fresh, data-less Supabase QA branch would be safer for destructive test fixtures, but creating that branch incurs additional usage charges and requires explicit cost agreement. Do not run `supabase/tests/job_abort_workflow.sql` against production.

## Subsequent fee-approval lock fix (production DB applied; app release pending)

The screenshot-reported issue was that the fee review form used `locked = invoiced` and `review_job_abort_claim` permitted repeated approvals or rejection before invoicing. That meant a fee shown as **Approved · Ready to invoice** still exposed editable controls.

Implemented fix (feature branch `fix/abort-approval-lock-and-audited-amendments`):

- Hide ordinary Approve/Reject inputs as soon as `finance_status` leaves `pending_review`.
- Apply the lock immediately to React Query cache after successful approval.
- At the database level, allow the ordinary review function to make a decision **only once**. Attempts after approval/rejection return `ABORT_CLAIM_ALREADY_REVIEWED`.
- Add `amend_approved_job_abort_claim` for exceptional Super Admin corrections, only on a current approved Abort with no live invoice and with a mandatory reason. Keep original approval metadata and log every amendment with the previous amount.
- Extend the audit event constraint to allow `claim_amended`.
- Preserve all existing approved fee amounts during migration. Historical repeated approval events remain in the immutable history; they are not deleted.
- Deploy the database migration before the updated client so no unprotected API window is introduced.

**Production database verification (23 November 2026, 20:28 UTC):** The additive migration `supabase/migrations/20261123202841_abort_fee_approval_lock.sql` was applied through the connected Supabase migration service, and the generated remote version was matched to this repository filename. Read-only checks confirmed the repeat-approval guard, Super Admin correction procedure, three amendment metadata columns, and the `claim_amended` audit constraint. The existing approved amount remains **£240.00** and all **3** prior approval events remain. No amendments were made. This migration does **not** deploy the React UI. The branch must still be merged and deployed, with authenticated UI smoke testing afterwards. Staging remains drifted from production per the earlier release notes; do not run its SQL scenario tests against production.
