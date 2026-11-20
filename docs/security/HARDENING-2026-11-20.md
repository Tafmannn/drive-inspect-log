# Production hardening — 20 Nov 2026 (working register)

Resume point for the hardening pass. Prod = `lynkvfduzqdyvlzgriyh`, staging = `mfedxybzajdgavzmajkl`.

| ID | Sev | Evidence | Root cause | Fix | Test | Status |
|----|-----|----------|------------|-----|------|--------|
| H1 | P0 | Live `assign-driver` v94 = repo code; upserts `role:'driver'` with service role | Service role skips `guard_user_profile_privileged_columns`; no target check | `_shared/assignDriverPolicy.ts` guard before any write; audit; revert org on Auth failure | `src/test/assign-driver-policy.test.ts` (12) | Fixed on branch, **not deployed** |
| H2 | P1 | `pg_policies`: "Org members can manage job_activity_log/deviation log" FOR ALL | Over-broad legacy policy; drivers can UPDATE/DELETE audit trail | Migration `20261121130000`: select+insert only, revoke UPDATE/DELETE | Staging 20 Nov: 15/15 role-simulated checks pass (rolled-back fixtures) | Applied on staging; prod pending |
| H3 | P2 | `allocate_invoice_number` only checks org membership | Drivers can burn invoice numbers | Same migration: require admin, like credit notes | Same staging run | Applied on staging; prod pending |
| H4 | P3 | Advisor: anon EXECUTE on `enqueue_customer_notification()` | Default PUBLIC grant on trigger fn (not callable as RPC) | Same migration: revoke (guarded) | Same | Applied on staging; prod pending |
| H5 | P1 | Staging max migration 20260713223138 (73) vs prod 107 | Staging not kept in step | Replay repo migrations onto staging | — | Open |
| H6 | P2 | Advisor: leaked-password protection off | Auth setting | Enable in Dashboard → Auth → Passwords (owner) | — | Open, owner action |
| H7 | P1 | `request-password-reset` (no auth) used `APP_URL \|\| Origin` for the recovery redirect; prod app is on `*.vercel.app` | Attacker-set Origin trusted; only Supabase's redirect allow-list stood in the way | `_shared/appOrigin.ts`: Origin only if explicitly allowed (`APP_ALLOWED_ORIGINS`, default prod app). Also invites, notify-customers, send-pod-email | `src/test/app-origin.test.ts` (8) | Fixed on branch |
| H8 | P2 | `user-lifecycle set_role` accepted any role string; wrote Auth before DB, ignored Auth error | Missing allow-list; wrong write order | Staff roles only; DB first, revert on Auth failure | `edge-admin-active-gate.test.ts` (+2) | Fixed on branch |
| H9 | P3 | `vehicle-lookup` had no rate limit (other lookups do) | Omission | Per-IP limiter | — | Fixed on branch |
| H10 | P3 | `authenticated` held TRUNCATE on both log tables | Default grants | Revoked in 20261121130000 | — | In migration; prod needs the one-line revoke |
| — | info | Edge auth review | gcs-upload/proxy, resolve-signature-url → `callerCanAccessPath`; send-push own-job check; get-org-users/send-invoice-email org-pinned; portal-evidence ownership via `portal_get_job` as caller; promote-admin & google-sheets-sync return 410 | — | — | Reviewed OK |
| — | info | `qr_lookup`/`qr_confirm` anon | Intentional; 192-bit token, 48h expiry, single use | None | — | Accepted |
| — | info | Repo vs prod migration history | PR #123 | Identical (verified 20 Nov) | — | Verified |
| F1 | P1 data | 49/67 completed jobs have no `job_pricing` total; 7 draft invoices, 0 sent; 0 jobs on 2+ live invoices | Historical data entry | Owner to price/issue; software must not guess | — | Open, owner action |

## Not yet audited in this pass
Remaining edge functions (beyond assign-driver), evidence/offline pipeline (Phase 3), admin UI action audit (Phase 5), performance advisors (Phase 7).

## Staging verification of 20261121130000 (20 Nov 2026)
Run as a DO block with temporary org/users/jobs, ended by RAISE so all fixtures rolled back (confirmed 0 residue).
Driver: read own log ✓, insert own activity/deviation ✓, UPDATE/DELETE either log → 42501, insert into other org → 42501, allocate_invoice_number → 42501.
Admin: allocate own org ✓ (AX26-1001), other org → 42501, read other org = 0 rows, UPDATE log → 42501.
Anon: read log → 42501, allocate → 42501.
