---
name: axentra-weekly-numbers
description: Axentra's weekly CEO numbers from the live database — jobs done, recorded revenue, contribution, unbilled work, draft/outstanding/overdue invoices, client mix, and data-quality gaps that make the numbers untrustworthy. Use when the user asks how the business is doing, for the weekly/Monday review, "who owes us", "what's unbilled", or which customers are worth most. Read-only.
---

# Axentra weekly numbers

## Run

1. Execute `weekly.sql` (this folder) **unchanged** with the Supabase MCP `execute_sql` tool on the production project (`project_id` = `project_id` in `supabase/config.toml`). It is SELECT-only and returns no personal data. Never run any other write or DDL from this skill.
2. If the Supabase tool is unavailable, say so and stop — do not estimate figures.

## Report (≤ 12 lines, in this order)

1. **Data you can't trust yet** — first, if any apply: `price_capture_pct` < 95, `client_link_pct` < 95, `unpriced_completed_jobs_180d` > 0, `drivers_without_pay_basis` > 0. Say what each blocks (below).
2. **Cash** — `unbilled_value` (completed, priced, on no invoice; all time), `draft_value` (drafted, never issued), `outstanding_value`, `overdue_value`, `paid_last_28d`.
3. **Activity** — this week vs `trailing_4_weeks.avg_jobs_per_week`; recorded revenue; contribution on priced jobs.
4. **Clients and sources (90 days)** — top clients by contribution, flag any with unpriced jobs; `sources_90d` compares Movex / Revilo / direct (`jobs.job_source`, set on the job form). `(not recorded)` means the job predates the source field or was never tagged.
5. **One next action** — the largest £ item above, with the page to fix it in.

## KPI definitions → decision

| KPI | Definition | Decision it drives |
|---|---|---|
| Unbilled value | Σ `jobs.total_price`, completed/closed, priced, no non-voided `invoice_items` row and no non-cancelled `invoices.job_id` (same rule as the duplicate-invoice guard) | Invoice it: /control/invoice-prep |
| Draft value | Σ `invoices.total`, `status='draft'` | Issue or cancel drafts |
| Outstanding / overdue | `status='sent'`; overdue = `due_date` < today | Chase (owner approves every message) |
| Price capture % | completed jobs with `total_price` > 0 ÷ completed jobs | Below 95%, revenue and contribution are understated |
| Client link % | completed jobs with `client_id` ÷ completed jobs | Unlinked jobs are invisible to Invoice Prep and client profitability: /control/clients/link-jobs |
| Contribution (priced jobs) | `total_price` + expenses recharged on a live invoice − logged `expenses` | Excludes driver pay when `pay_basis` is unset, and all overheads. **Not profit, not take-home pay.** |
| Drivers without pay basis | active `driver_profiles` with `pay_basis` null | Profitability page marks every job cost-incomplete until set |

## Limits (state when relevant)

- Quote→job conversion, travel/waiting time and per-hour economics are **not** recorded in the database; use `axentra-offer-check` per offer instead.
- Business is treated as non-VAT-registered unless invoices say otherwise (`vat_registered`).
