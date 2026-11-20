# Moving job prices out of `jobs` (so drivers cannot read them)

## The problem
A driver can read every column of the jobs assigned to them, including seven price fields:
`total_price`, `rate_per_mile`, `admin_rate`, `caz_ulez_cost`, `pricing_metadata`,
`pricing_suggestion_used_at`, `pricing_suggestion_used_by`. The screens hide them, but a driver's login can
still fetch them. Row-level security cannot hide a column from one role and not another (admins and drivers
both connect as `authenticated`), so the fix is to move the data into its own admin-only table.

## The design
`public.job_pricing` (one row per job, `job_id` is the primary key). Row-level security: admins and the super
admin of the same organisation only (select, insert, update, delete). Drivers get no rows.

Nothing in the live database depends on the old columns (checked: no functions, views, policies, triggers or
constraints mention them), and only 20 of 76 jobs hold any pricing data.

## Three phases, each safe to stop after
| Phase | What | Visible change |
|---|---|---|
| 1. Add | Create `job_pricing`, copy the data across, and mirror any change made to the old columns into it | None. The old columns still work and still hold the data |
| 2. Switch the app | Every price read and write uses `job_pricing`; exports, the JSON backup and the MCP tool include it | None for admins. Prices are the same |
| 3. Seal | Old columns are forced to NULL and any write to them is redirected into `job_pricing` (so an old browser tab can't lose a price or re-expose one); the mirror is removed | Drivers can no longer read any price |

Order matters: apply phase 1 SQL, deploy phase 2, check the screens, then apply phase 3. Each phase has a
rollback. Phase 3 keeps the columns (set to NULL) instead of dropping them, so it can be undone by copying the
values back. Dropping the columns is a later, optional clean-up.

## Why a "seal" rather than a drop
A dropped column breaks any forgotten reader with an error, and any old browser tab that still writes a price
would fail. A sealed column accepts the write, forwards it into `job_pricing`, and stores NULL, so nothing is
lost and nothing readable is left behind.

## Phase 2 consumers (every place that touches the seven fields)
Reads that must come from `job_pricing`: job lists and detail (`api.ts`), Invoice Prep, Invoice Generator,
Attention Center billing checks, profitability, driver performance, operations buckets (it filters on
`total_price > 0`), the Job Master List, CSV exports, the JSON backup, and the MCP tool and edge function.
Writes that must go to `job_pricing`: the job form (create and edit), the price editor, the pricing
suggestion panel, and the CAZ/ULEZ lookup.
Drivers' reads get no pricing rows (row-level security), so their screens are unchanged.
