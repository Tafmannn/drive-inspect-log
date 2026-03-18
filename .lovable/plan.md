

## Diagnosis

### 1. Role Downgrade (Root Cause of "lost" super admin)
The audit log shows that at **22:37:46 today**, a `set_role` action was executed **against your own account**, changing JWT metadata from `super_admin` to `admin`:

```text
action:      set_role
target:      9982e4e3-... (info@axentravehicles.com)
before_state: { role: super_admin }
after_state:  { role: admin, roles: [ADMIN, DRIVER] }
performed_by: info@axentravehicles.com
```

**Database** (`user_profiles.role`) was also set to `admin` by the edge function (line 634-637), but the audit `before_state` shows it was `super_admin` before. However, a subsequent correction may have restored the DB row to `super_admin` — the current DB shows `role = 'super_admin'`.

**JWT metadata** still says `role: admin, roles: ["ADMIN", "DRIVER"]`. Since `AuthContext.deriveAppUser()` reads roles from JWT, the app sees you as ADMIN only. This hides all super-admin-only surfaces and routes.

### 2. Data is NOT lost
- **35 jobs** exist in org `a0000000-...`
- **4 user profiles** exist
- **2 driver profiles** exist

The "disappeared work" is a visibility issue: super-admin-only pages/routes redirect you because the app thinks you're just an admin.

### 3. The `is_protected` flag did not prevent this
The `set_role` edge function checks `is_protected` but only blocks non-super-admin callers. Since you were super_admin at the time of the call, you were allowed to modify your own account. There is no self-modification guard for `set_role`.

---

## Fix Plan

### Step A — Restore JWT metadata to super_admin
The `user_profiles` row already says `super_admin`, but the JWT is stale at `admin`. We need to update the auth user's metadata to match.

**Approach:** Add a self-protection guard to the `set_role` action, then fix the JWT via the edge function.

In `supabase/functions/user-lifecycle/index.ts`, add a guard at line ~603:
```typescript
// Prevent self-demotion
if (user_id === caller.id) {
  return json({ error: "CANNOT_MODIFY_OWN_ROLE" }, 403);
}
```

### Step B — Fix the JWT now
Call the edge function or use a one-time SQL/admin API call to re-sync the JWT metadata for `info@axentravehicles.com` to `super_admin`. The `set_role` action itself can do this — but since you're currently only `admin` in JWT, the edge function will reject escalation to `super_admin` (line 608: `CANNOT_ESCALATE_BEYOND_OWN_ROLE`).

**Solution:** Add a `sync_role_from_db` action to the edge function that reads the `user_profiles.role` and writes it back to JWT metadata. This uses the service-role client so it bypasses the caller's current JWT role. Only super_admin (by DB check) or protected accounts should be eligible.

### Step C — Make AuthContext also check user_profiles role
Currently `handleSession` fetches `account_status` from `user_profiles` but ignores the `role` column. Add the DB role to the derived user so that even if JWT is stale, the correct role is used.

In `AuthContext.tsx` `handleSession`, after fetching `account_status`, also fetch `role` and merge it:
```typescript
const { data } = await supabase
  .from("user_profiles")
  .select("account_status, role")
  .eq("auth_user_id", session.user.id)
  .maybeSingle();

if (data?.role) {
  const dbRole = data.role === 'super_admin' ? 'SUPERADMIN' : data.role.toUpperCase();
  if (['DRIVER', 'ADMIN', 'SUPERADMIN'].includes(dbRole) && !user.roles.includes(dbRole as AppRole)) {
    user.roles.push(dbRole as AppRole);
  }
}
```

This makes `user_profiles` the authoritative role source, with JWT as a fast-path fallback.

---

### Files to change

1. **`supabase/functions/user-lifecycle/index.ts`** — Add self-role-modification guard + `sync_role_from_db` action
2. **`src/context/AuthContext.tsx`** — Merge DB role into derived user roles
3. **One-time data fix** — Call `sync_role_from_db` to restore your JWT to `super_admin`

### Outcome
- JWT metadata restored to `super_admin` with roles `["SUPERADMIN", "ADMIN", "DRIVER"]`
- All super-admin surfaces become visible again
- Future self-demotion prevented by guard
- AuthContext uses DB as role authority, making JWT-only stale role issues impossible

