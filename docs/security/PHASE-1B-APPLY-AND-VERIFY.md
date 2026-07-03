# Phase 1B — Apply & Verify Runbook (Commits 1–7)

This runbook operationalizes the security commits on branch
`claude/axentra-full-audit-x6xmv8`. Do it on **staging first**, gate on each
verification, then repeat on production. Nothing takes effect until you apply
the migrations and deploy the functions/client — the commits alone change only
source.

**Golden rule:** apply one migration, run its verification, confirm the gate,
then proceed. If a gate fails, run the paired rollback (in `supabase/rollback/`)
and stop.

---

## Order of operations

Do it in this order so no live path breaks mid-deploy:

1. **Edge functions** (adds `create_org`; retires two legacy functions)
2. **Migrations** (5, in timestamp order)
3. **Client** (Vite build/deploy — read paths + QR + POD email)
4. **Final smoke test**

---

## 1) Edge functions

```bash
# Adds the create_org action the Super Admin dashboard now depends on (Commit 2).
supabase functions deploy user-lifecycle

# Retire the legacy/disabled functions (Commit 7). Deleting the source does NOT
# undeploy them — you must run these explicitly.
supabase functions delete promote-admin
supabase functions delete gcs-fix-acl
```

Deploy `user-lifecycle` **before** the client relies on `create_org`, and
before deleting `promote-admin` (so there's no window with neither).

---

## 2) Migrations (timestamp order, one at a time)

### 2a. `20260630100000` — vehicle-photos private + org-scoped  ⚠️ has a pre-check
- **BEFORE applying**, run section **(A)** of
  `supabase/verification/vehicle-photos-lockdown-checks.sql`.
  - **Gate A3 (blocker):** `non_conforming_objects` must be `0`. If > 0, those
    photos have no owning job and become super-admin-only after lockdown. Stop
    and re-home them (or accept), do not apply yet.
  - Confirm **A2** shows the four `Allow public … vehicle-photos` policies exist.
  - Record **A4** (total object count).
- Apply the migration.
- Run sections **(B)** and **(C)**. Gates: bucket `public=false`; four public
  policies gone; four `vehicle_photos_*_org` policies present; count == A4
  (nothing deleted); anon sees 0; ORG-A driver sees ORG-A only; cross-org = 0;
  super-admin sees all; driver INSERT under an ORG-B path is rejected.
- Rollback if needed: `supabase/rollback/20260630100000_*.down.sql`.

### 2b. `20260630100100` — jobs INSERT/DELETE admin-only
- Apply, then run `supabase/verification/jobs-write-scope-checks.sql`.
  - Gates: 4 command-scoped policies, no `FOR ALL` "Org members can manage jobs";
    driver UPDATE(status) succeeds; driver INSERT/DELETE rejected; admin INSERT
    succeeds.
- Rollback: `.../20260630100100_*.down.sql`.

### 2c. `20260630100200` — QR handover RPCs
- Apply, then run `supabase/verification/qr-handover-checks.sql`.
  - Gates: both functions `SECURITY DEFINER` with pinned `search_path`; anon has
    EXECUTE; no anon table policy remains; `qr_lookup(valid)`→`ready`,
    `qr_lookup(bad)`→`not_found`; second `qr_confirm` on the same token→`invalid`.
- Rollback: `.../20260630100200_*.down.sql` (drops the two functions).

### 2d. `20260630100300` — pod-pdfs private + org-scoped
- Apply, then run `supabase/verification/pod-pdfs-checks.sql`.
  - Gates: bucket `public=false`; four `pod_pdfs_*_org` policies; **(C)**
    `non_org_prefixed` = 0 (no legacy `shared/` objects); **(D)**
    `other_org_visible` = 0.
- Rollback: `.../20260630100300_*.down.sql`.

> Migration `20260629100100` (photos server-side org) and the Phase-1 helper
> migrations are assumed already applied (they predate this branch). If your live
> DB drifted, confirm `is_super_admin()/user_org_id()/is_admin_or_super_admin()`
> read from `user_profiles` before trusting the storage policies above.

---

## 3) Client

Build and deploy the frontend (Commits 1, 4, 5 change client read/QR/POD paths):

```bash
npm ci && npm run ci   # test + typecheck + build
# then deploy the built assets via your normal pipeline
```

The client is backward-compatible with a not-yet-migrated DB (signed-URL reads
also work against a public bucket), so a brief ordering skew won't break display.

---

## 4) Final smoke test (as a real ORG-scoped user)

- Open a completed job's **POD review** → collection/delivery photos render
  (signed URLs), signatures render, PDF generates with photos embedded.
- Run a **pickup inspection** end-to-end on a phone → photos upload, status
  advances (driver UPDATE on jobs still works).
- **Email POD** → link resolves; object lands under `<orgId>/…`, not `shared/`.
- Scan a **QR handover** link as an anonymous browser → job ref + reg show,
  confirm works once, a second confirm is rejected.
- As a **super admin**, change a user's role → the change actually sticks
  (visible after their next session refresh; RLS now honors it).

---

## Rollback summary

Every migration has a paired `.down.sql` in `supabase/rollback/`. The storage
rollbacks intentionally do **not** auto-reopen buckets to public. To fully
revert the branch, roll back migrations in reverse timestamp order, redeploy the
previous client build, and (if desired) re-deploy the retired functions from
git history.
