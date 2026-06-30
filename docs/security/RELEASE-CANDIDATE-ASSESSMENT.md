# Axentra — Version 1.0 Release-Candidate Assessment (Truth Mode)

**Verdict: ❌ RELEASE REFUSED (Option B).** Not because the codebase is
low-quality — much of it is solid — but because the dimensions that matter most
for a production logistics platform are **unproven**, and at least one concrete
blocker (anonymous `qr_confirmations`/`jobs` access state) cannot be resolved
from the repository alone.

This document separates **what was verified by actually executing it** from
**what could not be executed in this environment**. Nothing green is claimed
without evidence; nothing is hand-waved to "probably fine."

Branch: `claude/axentra-audit-kzgo4m` · Date: 2026-06-30

---

## 1. What was actually executed (hard evidence)

| Gate | Command | Result |
|------|---------|--------|
| Clean install | `npm ci` | ✅ exit 0 (after lockfile regen) |
| Build | `npm run build` | ✅ vite build succeeds |
| Type-check | `npm run typecheck` | ✅ 0 errors |
| Unit/regression | `npm test` | ✅ 33 files / 310 tests, no flakiness over 4 runs |
| Release gate (static) | `npm run release:validate` | ⚠️ exit 0 — 8 PASS / 3 WARNING / 4 NOT_EXECUTED |
| **Lint** | `npm run lint` | ❌ **289 errors, 22 warnings** |

`npm run lint` is **not** part of `npm run ci` (`test + typecheck + build`) nor
the release gate, so this failure does not block any automated gate today — which
is itself a finding (see HIGH-3).

## 2. What could NOT be executed here (and why that blocks RC)

| Phase | Why not run | Consequence |
|-------|-------------|-------------|
| 3 — Provision staging Supabase project, set `STAGING_*`, seed users | I cannot create Supabase projects/infra | Live validation impossible |
| Live suites 12–15 (RLS runtime, cross-tenant isolation, storage IDOR, realtime) | No `STAGING_*` configured; framework correctly gates to `NOT_EXECUTED` | **The core security claims are UNVERIFIED at runtime** |
| 5 — Full regression (25 workflows incl. offline upload, POD, PDF, sheet sync) | No deployed app + live backend | End-to-end correctness unproven |
| 6 — Performance (load, memory, bundle on slow mobile) | No deployed app / devices | Not measured — no honest number to report |

A V1.0 RC for a platform that moves vehicles and customer PII **cannot** be
signed off while cross-org isolation and storage-IDOR have never run against a
real database. Truth Mode forbids fabricating those results.

---

## 3. Security findings

### 🔴 CRITICAL-1 — Anonymous `qr_confirmations` / `jobs` access is in an unknown, contradictory state

`/confirm` (`src/pages/QrConfirm.tsx`) is a **public, unauthenticated** route. It
uses the anon Supabase client to:
1. `SELECT … FROM qr_confirmations WHERE token = ?` (reads token row + `job_id`),
2. `SELECT external_job_number, vehicle_reg FROM jobs WHERE id = ?`,
3. `UPDATE qr_confirmations SET confirmed_at, customer_name, notes WHERE id = ?`.

Per the **repository migrations**, the anon policies for both tables were created
on `20260226215801` and **dropped on `20260303121807`**, and never recreated.
Effective state per repo = RLS enabled, **no anon policy = deny-all**. Yet the
Phase-1 migration `20260628100200` carries a comment asserting
`qr_confirmations USING(true)` is **still live** ("supports the ANONYMOUS customer
handover flow … Reported, not shipped").

These cannot both be true. Therefore **one of the following is the case, and the
repo cannot tell us which**:

- **(A) Functional Critical** — the DB matches the migrations → the public
  handover-confirmation feature is **broken** (anon reads denied → always
  "Invalid or expired link"). A core customer-facing workflow is dead.
- **(B) Security Critical + process Critical** — the production DB has **drifted**
  from the migrations (a permissive policy re-added out-of-band) → the feature
  works, but **any anonymous user can read every handover token and
  `customer_name` and can `UPDATE` confirmations**, and the repo migrations no
  longer describe reality (migration/DB drift — undermines every other RLS claim).

**Resolution requires running live suites 12/13 against staging** (or inspecting
the real DB). This is the single strongest reason the RC cannot be approved
today. *(Note: release-validation suite 05 flags this as a deferred WARNING, but
its static scan matches the already-dropped `0226` policy text — so the warning
is, on the repo alone, a false positive for exposure and a true positive only if
drift exists. Same ambiguity, different direction.)*

### 🟠 HIGH-1 — Runtime security is entirely unverified
Suites 12–15 (`NOT_EXECUTED`) are the only things that *prove* cross-org
isolation, storage IDOR (`gcs-proxy` / `resolve-signature-url`), and forged-JWT
super-admin rejection on a real DB. Static checks (suites 05/06) only confirm
*presence* of guards in source, not their runtime effect. Until 12–15 run on a
seeded staging clone, the platform's tenancy boundary is asserted, not proven.

### 🟡 MEDIUM-1 — `user-lifecycle` edge function: unsafe non-null assertion
`supabase/functions/user-lifecycle/index.ts:267`:
`authUserId = inviteData?.user?.id!;` — the `!` is compile-time only. If an invite
succeeds without returning a user object, `authUserId` is `undefined` at runtime
and is passed to `admin.auth.admin.updateUserById(undefined, …)`. Low probability,
but this is privileged user-provisioning code. **Recommended fix** (guard, do not
ship unverified — this function has no automated test and Deno is unavailable here):
```ts
if (!inviteData?.user?.id) return json({ error: "invite returned no user" }, 500);
authUserId = inviteData.user.id;
```

### 🟡 MEDIUM-2 — `app_metadata.role`/`roles` is written but must never be trusted
`user-lifecycle` writes `role`/`roles` into Supabase Auth `app_metadata`. This is
safe **only** because the RLS helpers derive authz from `user_profiles`
(verified statically by suite 05). If any policy or edge function ever reads
`auth.jwt() -> app_metadata -> role`, it becomes a privilege-escalation vector.
Keep an explicit invariant/test that no policy trusts JWT metadata.

### ✅ Confirmed-good (static)
- The catastrophic foundational `FOR ALL USING(true)` anon policies on `jobs`,
  `inspections`, `damage_items`, `photos`, `job_activity_log`, `expenses` **were**
  dropped (`20260303121807`).
- Committed-secret scan (suite 10) passes; `.env` is gitignored.
- Storage-IDOR path→org guard (`extractJobIdFromPath`) is unit-tested.
- RLS helpers ignore JWT metadata (suite 05, static).

---

## 4. Code-quality / reliability findings

| ID | Sev | Finding |
|----|-----|---------|
| HIGH-3 | High | `npm run lint` fails with **289 errors** (260 × `no-explicit-any` across 93 files) and lint is **not wired into CI or the release gate** → type-unsafety can regress silently. Mass-fixing the `any`s is a 93-file behavior-risk refactor (out of scope for "do not redesign"); the right move is (a) wire lint into CI as a tracked, ratcheting gate and (b) burn down `any` deliberately. |
| MED-3 | Med | **Two lockfiles** (`package-lock.json` + `bun.lockb`). They can drift and produce different dependency trees in CI vs. local. Pick one package manager and delete the other's lockfile. |
| MED-4 | Med | `npm audit`: 1 high advisory remains after lockfile regen (down from 2 critical / 12 high). Triage before GA. |
| MED-5 | Med | Coverage gap: V1/V5/V6/V9 (SQL triggers, gcs-upload naming/0-byte) and all edge functions have **no automated test** — only manual staging SQL. Inherent without a DB/Deno harness, but real. |
| LOW-1 | Low | `react-hooks/exhaustive-deps` (×3: `InspectionFlow.tsx:233`, `InvoicePrepScreen.tsx:128`, `BusinessSearchInput.tsx:42`) — possible stale-closure/re-render bugs; review individually. |
| LOW-2 | Low | `no-control-regex` in `src/lib/invoicePdf.ts:82` (`\x00` in a regex); `no-useless-catch`; `no-var` (×8). Cosmetic but trivially fixable. |

---

## 5. Scorecard

Scores reflect **evidence available**, not optimism. "Unverified" dimensions are
capped because absence of proof is, for a release gate, absence of readiness.

| Dimension | Score | Basis |
|-----------|------:|-------|
| **Security** | **45 / 100** | Good static posture, but runtime tenancy isolation is entirely unproven (HIGH-1) and CRITICAL-1 is an open anon-access/drift question on a PII+token table. |
| **Reliability** | **68 / 100** | 310 green unit tests, no flakiness, clean build/typecheck/CI. No e2e/integration against a live backend; full regression (Phase 5) not run. |
| **Maintainability** | **58 / 100** | Strong docs + validation framework + tests; undercut by 289 lint errors, pervasive `any`, lint absent from CI, dual lockfiles. |
| **Scalability** | **62 / 100** | Reasonable Supabase/edge architecture and org-scoping; unverified under load; no perf data. |
| **Performance** | **N/A — not measured** | Phase 6 needs a deployed app/devices. No honest number can be given. |
| **User Experience** | **N/A — not assessed** | Requires running the app across mobile/offline; not possible here. |
| **OVERALL** | **≈ 62 / 100, GATED** | The average is moot: the run is **blocked**, not merely imperfect. Critical runtime validation never executed. |

---

## 6. Blocker report (ranked)

**CRITICAL (must resolve before RC):**
1. CRITICAL-1 — resolve the `qr_confirmations`/`jobs` anon state (run live suites
   12/13 on staging; reconcile migrations vs. real DB). Fix whichever way it
   falls: restore a **scoped** anon path via `SECURITY DEFINER` RPC (read/confirm
   by token only) + client change, OR repair the broken feature.
2. HIGH-1 — execute live suites 12–15 against a seeded **staging** project; they
   are the only proof of cross-org isolation and storage IDOR.

**HIGH:**
3. No staging environment exists (Phase 3) — blocks all runtime/regression/perf
   validation. Requires provisioning I cannot perform.
4. Full regression (Phase 5) of the 25 critical workflows not performed.
5. HIGH-3 — wire `lint` into CI; it currently fails with 289 errors unguarded.

**MEDIUM:** MED-1 (user-lifecycle guard), MED-2 (never trust JWT metadata),
MED-3 (dual lockfiles), MED-4 (npm audit high), MED-5 (server-side test coverage).

**LOW:** LOW-1 (exhaustive-deps review), LOW-2 (cosmetic lint).

---

## 7. Path to a genuine RC

1. **Provision staging** (separate Supabase project; the framework hard-refuses
   the prod ref `lynkvfduzqdyvlzgriyh`). Apply all migrations to a fresh DB,
   verify rollback, seed a driver + two orgs.
2. Set `STAGING_DB_URL`, `STAGING_SUPABASE_URL`, `STAGING_ANON_KEY`,
   `STAGING_DRIVER_A_JWT`, `STAGING_CROSS_ORG_PATH` and run
   `npm run release:validate` → suites 12–15 must be **PASS**, not `NOT_EXECUTED`.
3. Resolve CRITICAL-1 from the runtime evidence; re-confirm migrations describe
   the real DB (no drift).
4. Execute the Phase-5 regression on staging; record pass/fail per workflow.
5. Apply MED-1; wire lint into CI (HIGH-3); consolidate to one lockfile (MED-3).
6. Re-score. Only then is an Option-A sign-off defensible.

**Until steps 1–4 are done, release is refused.** This protects the business: a
silent broken handover flow, or a silent anonymous PII/token leak, is exactly the
class of failure a V1.0 gate exists to catch.
