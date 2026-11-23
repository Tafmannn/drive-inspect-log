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

## Release steps (need owner approval)

1. Apply the migration to **staging** and run `supabase/tests/job_abort_workflow.sql` there
   (`psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/job_abort_workflow.sql`).
2. Deploy the edge functions `notify-customers` and `send-push` (both changed) to staging; smoke test.
3. Regenerate `src/integrations/supabase/types.ts` once the migration is applied (the new tables
   and RPCs are currently called through an untyped wrapper in `abortApi.ts`).
4. Production: apply the migration, deploy both functions, then the frontend. The frontend must
   not go out before the migration (it calls the new RPCs).
