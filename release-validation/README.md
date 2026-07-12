# Axentra — Production Release Validation Framework

An automated, dependency-free gate that runs every release check that can be
honestly automated, and **clearly marks the ones that cannot** (Truth Mode).
It never reports `PASS` for something it did not actually execute.

```bash
npm run release:validate          # full run (build + tests + typecheck + static + live-if-configured)
npm run release:validate:fast     # skip the heavy build/test/typecheck suites
node release-validation/run.mjs --list          # show the suite catalogue
node release-validation/run.mjs --only=02,03,04  # run a subset
node release-validation/run.mjs --skip=11         # run all but one
```

Exit code: **non-zero iff a _critical_ suite produced a `FAIL`.** `WARNING` and
`NOT_EXECUTED` never fail the run, so a missing staging environment cannot mask a
real regression and cannot manufacture a green light either.

## What it produces

Each run writes three reports to `release-validation/reports/` (git-ignored):

| File | Use |
| --- | --- |
| `release-validation.html` | human-readable dashboard (open in a browser) |
| `release-validation.md`   | PR / job-summary friendly |
| `release-validation.json` | machine-readable for downstream tooling |

## Status vocabulary (Truth Mode)

| Status | Meaning |
| --- | --- |
| ✅ `PASS` | actually executed here and met its criteria |
| ⚠️ `WARNING` | executed; non-blocking concern for human review |
| ❌ `FAIL` | executed; criteria not met (blocks if the suite is critical) |
| ⏭️ `NOT_EXECUTED` | could not run here (no live env / missing tool) — **never** counted as passing |
| ⚪ `SKIPPED` | intentionally filtered out via `--only` / `--skip` |

## Suites

Static suites run anywhere (laptop, CI, container). Live suites require a
**staging** Supabase project and self-gate to `NOT_EXECUTED` when unconfigured.
🔒 = critical (a `FAIL` makes the run exit non-zero).

| # | Suite | Type | 🔒 | What it proves |
| --- | --- | --- | --- | --- |
| 01 | Environment & configuration | static | 🔒 | Node version, npm scripts, `.env` hygiene, live-env detection |
| 02 | Migration ordering & naming | static | 🔒 | `<ts>_<slug>.sql`, no dup timestamps, lexical == chronological |
| 03 | Migration re-apply safety | static | 🔒 | Release-set migrations use `OR REPLACE` / `IF NOT EXISTS` / guarded triggers |
| 04 | Rollback coverage | static | 🔒 | Every release-set migration has a non-trivial `.down.sql` |
| 05 | RLS / security posture | static | 🔒 | Latest helper defs ignore JWT metadata; signature IDOR closed; flags deferred Phase 1.5 items |
| 06 | Edge-function authorization | static | 🔒 | Every privileged function enforces caller identity in-code |
| 07 | TypeScript type-check | static | 🔒 | `tsc --noEmit` clean |
| 08 | Production build | static | 🔒 | `vite build` succeeds |
| 09 | Unit / regression tests | static | 🔒 | `vitest run` green (incl. storage path authz, 0-byte guard) |
| 10 | Committed-secret scan | static | 🔒 | No PEM keys / service-role keys / SA JSON committed; `.env` untracked |
| 11 | Dependency vulnerability audit | static | | `npm audit` summary (advisory) |
| 16 | ESLint (lint backlog ratchet) | static | | `npm run lint`; WARNING while a backlog exists, PASS when clean. Promote to 🔒 once errors reach 0 |
| 12 | RLS helpers — runtime proof | **live** | 🔒 | Forged-metadata super-admin returns false on the real DB |
| 13 | Cross-tenant isolation | **live** | 🔒 | A driver sees zero cross-org jobs / receipts under RLS |
| 14 | Storage IDOR path→org | **live** | 🔒 | `gcs-proxy` / `resolve-signature-url` return 403 cross-org |
| 15 | Realtime reachability | **live** | | Realtime websocket upgrade accepted; e2e delivery flagged manual |

## Enabling the live suites (staging only)

The framework **refuses the production project ref** (`lynkvfduzqdyvlzgriyh`) in
every code path — like the gated staging rollout script, it cannot be pointed at
prod. To execute the live suites against a seeded staging clone, export:

```bash
# Use the Session pooler string (Dashboard → Connect → Session pooler), not the
# direct db.<ref>.supabase.co host: the direct host is IPv6-only, and GitHub
# Actions runners have no outbound IPv6 route to it — suites 12/13 will fail
# with "Network is unreachable" if STAGING_DB_URL points at the direct host.
export STAGING_DB_URL="postgresql://postgres.<staging-ref>:***@aws-<region>.pooler.supabase.com:5432/postgres"
export STAGING_SUPABASE_URL="https://<staging-ref>.supabase.co"
export STAGING_ANON_KEY="<staging anon key>"
# Optional, sharpen suites 13/14 with explicit identities instead of auto-select:
export STAGING_DRIVER_SUB="<a driver auth_user_id>"
export STAGING_ORG_A="<that driver's org uuid>"
export STAGING_DRIVER_A_JWT="<a signed-in driver access token>"
export STAGING_CROSS_ORG_PATH="jobs/<jobB>/pickup/odometer/x.jpg"   # a foreign-org object
npm run release:validate
```

Requirements for the DB suites: `psql` on `PATH`. For the realtime suite: a Node
runtime with a global `WebSocket` (Node 22+). When a prerequisite is missing the
suite reports exactly what was absent and stays `NOT_EXECUTED`.

## CI

`.github/workflows/release-validate.yml` runs the static suites on every PR to
`main` and uploads the report as an artifact + job summary. Live suites activate
only if the corresponding `STAGING_*` repository secrets are configured.

## Design notes

- **Zero runtime dependencies.** The runner and suites are Node ESM (`.mjs`),
  so `npm run release:validate` works without installing anything beyond the
  repo's existing toolchain.
- **Add a suite** by dropping `NN-name.mjs` into `suites/`. Export a default
  object `{ id, name, critical, requiresLiveEnv, async run(ctx) }` returning
  `{ checks: [...], note? }`. The runner auto-discovers it by filename order.
- The SQL the live DB suites execute lives in `release-validation/sql/` so it can
  also be run by hand during the gated staging rollout.
