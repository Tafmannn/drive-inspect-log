# Axentra staging schema parity snapshot — 24 November 2026

Read-only catalog inspection; no user data or database mutations.

| Metric | Production | axentra-staging |
|---|---:|---:|
| Migration-history records | 120 | 77 |
| Public columns | 729 | 528 |
| Public/storage policies | 147 | 101 |
| Public functions | 90 | 30 |
| Public indexes | 157 | 110 |
| Public triggers | 68 | 29 |
| `public.job_aborts` | exists | missing |
| `public.request_job_abort` | exists | missing |
| `public.driver_digital_credentials` | missing | missing |

Counts are evidence of drift, **not** an executable schema-reconciliation plan. The Digital ID migration is only in draft PR #185, not deployed to either hosted project. A genuinely restorable backup of hosted staging is still required before any schema repair.
