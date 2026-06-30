# Truth Mode — Phase 2 Audit

Branch: `claude/axentra-audit-kzgo4m`
Subject: the **production release-validation framework** (`release-validation/`,
15 suites + runner + CI), the **Vitest** suite it gates on (suite 09), the
evidence-pipeline (V1–V9) fixes it validates, and the gated staging rollout
script.

> **Every result below was produced by actually executing the named component.**
> Nothing is asserted that was not run. Components that require a live
> Postgres/Deno runtime (the SQL migrations, edge functions, live suites 12–15)
> are explicitly marked *not executed here* — the framework itself reports them
> as `NOT_EXECUTED`, never as passing.

Reproduce:

```bash
npm install                       # NOTE: package-lock.json is stale; npm ci fails — see GAP-4
npm run release:validate          # 15 suites; exit 0 (no critical FAIL)
node release-validation/run.mjs --list
npm test ; npm run typecheck ; npm run build
```

---

## Phase 1 — Inventory

### A. Release-validation framework (`release-validation/`)

Runner + libs are zero-dependency Node ESM. Suites auto-discovered by filename.

| Path | Purpose | Entry / referenced by | Complete | Runs |
|------|---------|-----------------------|:--------:|:----:|
| `run.mjs` | Orchestrator: discovers suites, runs, aggregates, writes reports, sets exit code | `npm run release:validate` | ✅ | ✅ |
| `lib/types.mjs` | Status vocabulary + `pass/warn/fail/notExecuted` helpers | all suites | ✅ | ✅ |
| `lib/exec.mjs` | `spawnSync` wrapper (`run`, `which`, `tail`); never throws, timeouts | suites 07–14 | ✅ | ✅ |
| `lib/env.mjs` | Live-env detection + **hard production-ref refusal** | live suites 12–15 | ✅ | ✅ |
| `lib/report.mjs` | HTML / Markdown / JSON report writers | `run.mjs` | ✅ | ✅ |
| `sql/org-isolation.sql` | Cross-tenant SELECT proof (read-only; temp table `ON COMMIT DROP`) | suite 13 | ✅ | ⛔ live |
| `sql/rls-helpers-no-jwt-meta.sql` | Forged-metadata super-admin returns false | suite 12 | ✅ | ⛔ live |
| `.github/workflows/release-validate.yml` | Runs static suites on every PR to `main`; uploads report | CI | ✅ | (CI) |
| `reports/.gitignore` | Keeps generated reports out of git | — | ✅ | — |

**Suites** (🔒 = critical; a FAIL exits non-zero):

| # | Suite | Type | 🔒 | Complete | Executed here | Result |
|---|-------|------|:--:|:--------:|:-------------:|--------|
| 01 | Environment & configuration | static | 🔒 | ✅ | ✅ | PASS |
| 02 | Migration ordering & naming | static | 🔒 | ✅ | ✅ | PASS |
| 03 | Migration re-apply safety | static | 🔒 | ✅ | ✅ | WARNING (honest) |
| 04 | Rollback coverage | static | 🔒 | ✅ | ✅ | PASS |
| 05 | RLS / security posture | static | 🔒 | ✅ | ✅ | WARNING (honest) |
| 06 | Edge-function authorization | static | 🔒 | ✅ | ✅ | PASS |
| 07 | TypeScript type-check | static | 🔒 | ✅ | ✅ | PASS |
| 08 | Production build | static | 🔒 | ✅ | ✅ | PASS |
| 09 | Unit / regression (vitest) | static | 🔒 | ✅ | ✅ | PASS *(after GAP-1 fix)* |
| 10 | Committed-secret scan | static | 🔒 | ✅ | ✅ | PASS |
| 11 | Dependency vuln audit | static | — | ✅ | ✅ | WARNING (advisory) |
| 12 | RLS helpers runtime proof | live | 🔒 | ✅ | ⛔ no staging | NOT_EXECUTED |
| 13 | Cross-tenant isolation | live | 🔒 | ✅ | ⛔ no staging | NOT_EXECUTED |
| 14 | Storage IDOR path→org | live | 🔒 | ✅ | ⛔ no staging | NOT_EXECUTED |
| 15 | Realtime reachability | live | — | ✅ | ⛔ no staging | NOT_EXECUTED |

No stubs: every suite exports `{ id, critical, requiresLiveEnv, async run }`
and produced real checks when run. No `TODO`/`.skip`/`.todo` anywhere.

### B. Vitest suite (`src/test/`, 33 files / 310 tests) — what suite 09 gates on

Covers: auth/role derivation, edge authz, RLS storage-path guard, pricing
brain + rate cards, lifecycle/inspection transitions, POD/invoice/operations
gating, workflow brain, evidence health/queue/dedupe, and the V2/V3/V4/V7
evidence-pipeline regressions (`evidence-pipeline-fixes.test.ts`). All source
modules under test are referenced by app code (not dead): `submitQueue` (×3),
`pendingUploads` (×7), `internalStorageService` (×1), `evidenceHealth` (×6),
`evidenceQueueBus` (×4).

### C. Server-side fixes under validation (static-checked only — not executed here)

| Artifact | Validates | Static check | Executed |
|----------|-----------|--------------|:--------:|
| `migrations/20260629100000_…replay_ordering.sql` (V1) | `damage_items.submission_index`; replay in input order | present, `.down.sql` present, suites 02/03/04 PASS | ❌ needs Postgres |
| `migrations/20260629100100_…server_side_links_and_org.sql` (V6+V9) | photo↔damage trigger; org from job | present, `.down.sql` present | ❌ needs Postgres |
| `functions/gcs-upload/index.ts` (V5+V7) | deterministic names; 0-byte reject (line 105–109) | present; suite 06 authz PASS | ❌ needs Deno |
| `lib/submitQueue.ts` (V8 partial) | logs `submit_queue_signature_orphaned` | covered by vitest | ✅ (vitest) |
| `scripts/staging/apply-phase1-staging.sh` | gated staging rollout incl. V1/V5/V6/V7/V9 | `bash -n` OK; prod-ref guard; all 6 migrations exist | ❌ needs staging DB |

---

## Phase 2 — Execution & verification (all actually run)

`npm run release:validate` → **exit 0**, OVERALL **WARNING**:
8 PASS · 3 WARNING (03/05/11) · 4 NOT_EXECUTED (12–15, live, correctly gated).

| Verification | Evidence |
|--------------|----------|
| It executes | full 15-suite run completed; `--list` and `--only=NN` work |
| It exits correctly | exit 0 with warnings; **exit 1 proven** when suite 09 (critical) FAILs |
| Pass/fail reporting works | reverting GAP-1 → suite 09 reports `FAIL` "270 passed, 1 failed", OVERALL FAIL, exit 1; restoring → PASS, exit 0 |
| No broken imports / exports | runner auto-discovered & invoked all 15 suites; all export the required shape |
| No broken paths | every migration referenced by staging script + suites exists; both evidence rollbacks present |
| No syntax errors | `tsc --noEmit` clean; `node run.mjs` parses & runs; staging `bash -n` OK; CI yml parses |
| No circular deps | build + typecheck clean; runner+libs are a flat DAG (suites → lib/*; no back-edges) |
| Production build | `vite build` succeeds (~10s) |
| Vitest | 33 files / 310 tests / exit 0 (clean env, post-fix); **no flakiness across 4 consecutive runs** incl. the 20-way concurrency test |
| Prod safety | `lib/env.mjs` hard-refuses the production ref in every live path (`pointsAtProd` ⇒ `hasDb`/`hasHttp` false + REFUSED note) |
| Data safety | live suites are read-only; only DDL is `CREATE TEMP TABLE … ON COMMIT DROP`; no DELETE/UPDATE/DROP/INSERT against live data |

**Genuine defect fixed — GAP-1 (test-infra only, no production/test-logic
change):** Suite 09 runs `npm test` (`vitest run`) with no Supabase env. Six
test files transitively import `src/integrations/supabase/client.ts`, which
throws at module load without `VITE_SUPABASE_*`, and they do not mock it — so
suite 09 (critical) **FAILED**, making the whole release gate exit non-zero.
Fix: inject dummy Supabase values via `vitest.config.ts` `test.env`. They never
reach the network (the Supabase-exercising tests mock the client). This was a
**false-negative generator**, and load-bearing for the gate — verified by
reverting and re-running (FAIL→PASS, exit 1→0).

---

## Phase 3 — External-auditor gap analysis

| ID | Type | Finding | Sev | Disposition |
|----|------|---------|-----|-------------|
| GAP-1 | False negative (FIXED) | Suite 09 / vitest couldn't run green from a clean checkout — missing test env; failed the critical gate. | High | **Fixed** in `vitest.config.ts`. |
| GAP-2 | Coverage (inherent) | Live suites 12–15 + V1/V5/V6/V9 SQL/edge logic are `NOT_EXECUTED` here — need a seeded staging Supabase + `psql`/Deno. Framework reports this honestly; it is not a false pass. | Med | Run on staging via the documented `STAGING_*` envs before prod. |
| GAP-3 | Coverage | Edge functions have no unit-level tests; suite 06 only static-greps for an authz guard (can't prove correctness, only presence). | Med | Acceptable as a static gate; runtime proof is suites 12–14 on staging. |
| GAP-4 | Tooling defect | `package-lock.json` is **stale** — `npm ci` fails (missing `fake-indexeddb`, `jszip`, `@testing-library/dom`, …). Repo's primary lockfile is `bun.lockb`. | Low–Med | Flagged; **not** auto-committed (a ~1k-line regen is out of audit scope and the project tracks bun). Recommend regen or drop in favour of bun; suite 01 could assert lock sync. |
| GAP-5 | V8 partial | Discarding a submission with already-uploaded signatures orphans GCS objects (logged only, no delete). | Med | Pre-existing tracked follow-up (needs storage-delete edge fn). Not a regression. |
| — | WARNING 03 | `DROP/CREATE POLICY` migrations aren't re-runnable. **Accurate** advisory; suite itself notes Supabase tracks applied migrations (forward-safe). | — | Honest output, no action. |
| — | WARNING 05 | `qr_confirmations USING(true)` anon-PII, explicitly deferred to Phase 1.5. **Accurate**. | — | Honest output; tracked. |
| — | WARNING 11 | `npm audit`: 2 critical / 12 high. Advisory, non-critical suite. | — | Review deps before release (overlaps GAP-4). |
| — | Duplicated tests | None harmful. `pending-uploads*`/`evidence-pipeline-fixes` and `pricing-brain*`/`client-rate-card*` overlap by subject but assert distinct layers. | — | — |
| — | False positives | None found. | — | — |
| — | Impossible tests | None. V7's spec honestly avoids one (fake-indexeddb can't round-trip empty Blobs → it asserts the storage-layer guard instead). | — | — |
| — | Staging/prod-only | Correct separation: static suites everywhere; live suites self-gate; prod ref hard-refused. No production-only paths. | — | — |
| — | Data-destroying | None. Vitest uses mocks/fake-indexeddb; live suites read-only; staging script gated + prod-guarded + manual confirm per stage. | — | — |
| — | Flaky | None observed across 4 consecutive full vitest runs and repeated framework runs. | — | — |

---

## Phase 4 — Remaining suites

**No half-finished or interrupted suites exist.** All 15 release-validation
suites are complete and produced real results; the Vitest suite has no
skips/todos; `tsc`/`build` pass. The only concrete deficiency blocking a clean
green gate was GAP-1, now fixed. The live suites (12–15) and the V1/V5/V6/V9
server-side fixes are not unit-testable without staging infrastructure — adding
that would be *new framework infrastructure*, which the Truth-Mode brief
excludes ("do not redesign the framework"); they are validated on staging via
the documented `STAGING_*` envs and the gated rollout script. GAP-2/-3/-4 are
recorded for a future, in-scope task.

### Net change in this audit
- `vitest.config.ts`: inject dummy Supabase test env (GAP-1). **Only code change.**
- `docs/security/TRUTH-MODE-PHASE-2-AUDIT.md`: this report.
