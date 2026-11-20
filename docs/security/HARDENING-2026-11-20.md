# Production hardening — 20 Nov 2026 (working register)

Resume point for the hardening pass. Prod = `lynkvfduzqdyvlzgriyh`, staging = `mfedxybzajdgavzmajkl`.

| ID | Sev | Evidence | Root cause | Fix | Test | Status |
|----|-----|----------|------------|-----|------|--------|
| H1 | P0 | Live `assign-driver` v94 = repo code; upserts `role:'driver'` with service role | Service role skips `guard_user_profile_privileged_columns`; no target check | `_shared/assignDriverPolicy.ts` guard before any write; audit; revert org on Auth failure | `src/test/assign-driver-policy.test.ts` (12) | **Deployed** v97 (20 Nov 14:53 UTC, PR #143); live source verified, boots clean |
| H2 | P1 | `pg_policies`: "Org members can manage job_activity_log/deviation log" FOR ALL | Over-broad legacy policy; drivers can UPDATE/DELETE audit trail | Migration `20261121130000`: select+insert only, revoke UPDATE/DELETE | Staging 20 Nov: 15/15 role-simulated checks pass (rolled-back fixtures) | Applied on staging and prod (by hand, 20 Nov) |
| H3 | P2 | `allocate_invoice_number` only checks org membership | Drivers can burn invoice numbers | Same migration: require admin, like credit notes | Same staging run | Applied on staging and prod (by hand, 20 Nov) |
| H4 | P3 | Advisor: anon EXECUTE on `enqueue_customer_notification()` | Default PUBLIC grant on trigger fn (not callable as RPC) | Same migration: revoke (guarded) | Same | Applied on staging and prod (by hand, 20 Nov) |
| H5 | P1 | Staging max migration 20260713223138 (73) vs prod 107 | Staging not kept in step | Replay repo migrations onto staging | — | Open |
| H6 | P2 | Advisor: leaked-password protection off | Auth setting | Enable in Dashboard → Auth → Passwords (owner) | — | Open, owner action |
| H7 | P1 | `request-password-reset` (no auth) used `APP_URL \|\| Origin` for the recovery redirect; prod app is on `*.vercel.app` | Attacker-set Origin trusted; only Supabase's redirect allow-list stood in the way | `_shared/appOrigin.ts`: Origin only if explicitly allowed (`APP_ALLOWED_ORIGINS`, default prod app). Also invites, notify-customers, send-pod-email | `src/test/app-origin.test.ts` (8) | **Deployed** request-password-reset v21; portal-access v20 auto-deployed. notify-customers / send-pod-email still old |
| H8 | P2 | `user-lifecycle set_role` accepted any role string; wrote Auth before DB, ignored Auth error | Missing allow-list; wrong write order | Staff roles only; DB first, revert on Auth failure | `edge-admin-active-gate.test.ts` (+2) | Merged (#143); user-lifecycle still v75 (old) |
| H9 | P3 | `vehicle-lookup` had no rate limit (other lookups do) | Omission | Per-IP limiter | — | Merged (#143); vehicle-lookup still v112 (old) |
| H10 | P3 | `authenticated` held TRUNCATE on both log tables | Default grants | Revoked in 20261121130000 | — | In migration; prod needs the one-line revoke |
| — | info | Edge auth review | gcs-upload/proxy, resolve-signature-url → `callerCanAccessPath`; send-push own-job check; get-org-users/send-invoice-email org-pinned; portal-evidence ownership via `portal_get_job` as caller; promote-admin & google-sheets-sync return 410 | — | — | Reviewed OK |
| E1 | P1 | `purgeStaleRunUploads` / `retryUpload` purged queued photos when the job row came back empty; drivers only read jobs assigned to them; `stale_run_purged` is hidden from Attention | "No row" treated as "different run" (current_run_id is never null in prod) | `classifyRunCheck()`: purge only a visible job on another run; otherwise keep as blocked + `run_job_not_visible` log | `pending-uploads.test.ts` (+4; reassigned case fails on old code) | **Merged #144** (ships with frontend deploy) |
| E2 | P2 | Queue drain only logs when 0 photos promoted; partial loss undetected | No expected-count stored | Recommendation: store expected photo count; refuse RPC if staged count is short (care with crash-replay) | — | Open |
| F2 | P1 | Legacy `/invoice/new/:jobId` writes invoices.job_id only; DB unique index covers invoice_items only | Two invoice formats, one guarded | Migration 20261121140000: trigger enforces one live invoice per job across both, advisory lock, 23505 | `one-live-invoice-per-job.test.ts` (4) + prod rolled-back test 10/10 | **Merged #144; applied to prod 20 Nov, verified** |
| F3 | P1 | 43/50 unpriced completed jobs older than the 180-day billing lookback appear nowhere | Lookback hides them by design; no fallback | One summary exception per org; excludes `is_test` jobs (PR #148) | `attention-stale-unpriced.test.ts` (3) | **Merged #144** (ships with frontend deploy) |
| F4 | info | AX26-1001 (£240) & AX26-1002 (£300) drafts have 0 invoice_items | Legacy page stores lines as JSON — not a failed rollback | None; owner to issue or cancel | — | Owner decision |
| S1 | P1 | photos/inspections/damage_items/evidence_items/qr_confirmations: org-wide UPDATE/DELETE policies + full grants incl. TRUNCATE, no guard triggers; any org member could read all QR tokens and mark a handover confirmed | Over-broad legacy policies/grants | Migration 20261121160000: revoke DELETE/TRUNCATE, revoke UPDATE on evidence_items/qr, scoped QR select/insert (no pre-confirmed), photo job/org/run guard | `evidence-write-lockdown.test.ts` (5) + prod rolled-back test 17/17 | **Merged #147; applied to prod 20 Nov, verified** |
| — | info | Phase 5 sweep: unchecked client writes / silent 0-row updates | organisations writes are super-admin-only routes matching RLS; remaining unchecked writes are best-effort logs/caches | — | — | Reviewed OK |
| — | info | `qr_lookup`/`qr_confirm` anon | Intentional; 192-bit token, 48h expiry, single use | None | — | Accepted |
| — | info | Repo vs prod migration history | PR #123 | Identical (verified 20 Nov) | — | Verified |
| F1 | P1 data | 49/67 completed jobs have no `job_pricing` total; 7 draft invoices, 0 sent; 0 jobs on 2+ live invoices | Historical data entry | Owner decision 20 Nov: all 49 unpriced completed jobs are test data. Already flagged `jobs.is_test` by #146's one-off marking (72/76 jobs are test); nothing deleted | — | **Closed** (0 non-test unpriced completed jobs) |

## Not yet audited in this pass
Remaining edge functions (beyond assign-driver), evidence/offline pipeline (Phase 3), admin UI action audit (Phase 5), performance advisors (Phase 7).

## Staging verification of 20261121130000 (20 Nov 2026)
Run as a DO block with temporary org/users/jobs, ended by RAISE so all fixtures rolled back (confirmed 0 residue).
Driver: read own log ✓, insert own activity/deviation ✓, UPDATE/DELETE either log → 42501, insert into other org → 42501, allocate_invoice_number → 42501.
Admin: allocate own org ✓ (AX26-1001), other org → 42501, read other org = 0 rows, UPDATE log → 42501.
Anon: read log → 42501, allocate → 42501.

## Status after PR #143 (merged 96fec85, 20 Nov 2026)
- Prod schema_migrations does not yet record 20261121120000 (job_pricing_drop_columns, #142) or 20261121130000 (this work, already applied by hand; idempotent).
- TRUNCATE revoke on log tables: applied 20 Nov (verified).
- Redeploy outstanding (lower severity): user-lifecycle, notify-customers, send-pod-email, vehicle-lookup.
- Phases 3–5 audited (see E1–E2, F2–F4, S1). Not yet: performance advisors (Phase 7), physical-iPhone acceptance.

## Manual iPhone acceptance checklist (cannot be verified in CI/emulation)
Run on a real iPhone (Safari and home-screen PWA), signed in as a test driver on a test job:
1. Airplane mode → capture all collection photos + a damage item + signatures → Submit → "saved offline" shown → reconnect → inspection and every photo appear for admin; Pending Uploads empty.
2. Mid-inspection: lock phone 10 min / switch apps / rotate → return → draft, photos and signature strokes intact.
3. Submit offline, then have an admin reassign the job before reconnecting → photos stay on the phone as "blocked" with the "no longer assigned" message; nothing silently disappears. Reassign back → they upload.
4. Kill Safari during upload → reopen → uploads resume; no duplicate photos on the job.
5. Deny then allow camera permission mid-flow → capture still works; no lost photos.
6. Weak signal (Settings → Developer → Network Link Conditioner "Very Bad Network" or rural test) → submit → no false "submitted" while photos are still pending.
7. Customer QR handover: scan from a second phone, confirm → driver/admin see confirmation; a reused/expired QR shows invalid.
8. POD PDF opens with every photo and both signatures.
