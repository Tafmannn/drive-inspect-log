
# Validation Plan: Axentra Super Admin + Attention System

## Summary of Findings

After inspecting the full codebase, database functions, RLS policies, edge function code, and storage configuration, here is the validation result:

---

### TEST 1 — Super Admin Role System

**Status: ISSUES FOUND**

1. **DB `is_super_admin()` still has hardcoded emails** — The edge function (`promote-admin`) was correctly updated to use only `app_metadata` roles, and `AuthContext.tsx` no longer has email arrays. However, the **database function** `is_super_admin()` still checks against `axentravehiclelogistics@gmail.com` and `info@axentravehicles.com`. This means RLS policies across ALL tables still grant super admin via email match, undermining Move 4.
   - **Fix**: Migration to replace `is_super_admin()` removing the email array, keeping only the `app_metadata`/`user_metadata` role checks.

2. **No self-deactivation guard** — `promote-admin` does not check if the caller is deactivating themselves. If a super admin passes their own `user_id` to the `deactivate` action, the function will ban them.
   - **Fix**: Add `if (user_id === caller.id) return jsonRes({ error: "CANNOT_DEACTIVATE_SELF" }, 400)` before deactivate logic.

3. **No self-promotion guard** — An admin cannot currently call `set_role` (the edge function requires super admin), so this is safe. No fix needed.

4. **Role changes correctly update both `user_metadata` and `app_metadata`** — Verified in `set_role` action (line 151-174). The `roles` array is also rebuilt. PASS.

5. **JWT reflects updated role** — Only after the user re-authenticates (Supabase JWTs are not refreshed on metadata change). This is expected behavior. PASS (with caveat).

---

### TEST 2 — Admin Audit Logging

**Status: PASS with minor issue**

1. **`writeAudit()` is called for all 6 actions** — Verified: `create_org` (line 94), `create_user` (line 122/133), `set_role` (line 176), `deactivate`/`reactivate` (line 197), and legacy `promote` (line 225). PASS.

2. **All required fields are populated** — `performed_by`, `performed_by_email`, `action`, `target_user_id`, `target_org_id`, `before_state`, `after_state`. PASS.

3. **Audit failure does not block action** — `writeAudit` wraps in try/catch with empty catch. PASS.

4. **Audit tab renders correctly** — `AuditLogTab` queries with `.limit(100)`. PASS.

5. **RLS: only super admins can read** — Policy uses `is_super_admin()`. PASS (but inherits the hardcoded email issue from Test 1).

6. **No audit entries exist yet** — Query returned empty. This is expected (no actions have been performed since deployment). NOT A BUG.

---

### TEST 3 — Attention Exception Acknowledgement

**Status: PASS**

1. **`attention_acknowledgements` table exists** with correct schema. PASS.

2. **RLS policy** — `user_role() IN ('admin', 'super_admin')` for ALL operations. PASS.

3. **AttentionQueue has Acknowledge + Snooze buttons** — Verified in `AttentionQueue.tsx` (line 100-107 for mobile, line 150-157 for desktop). PASS.

4. **Dialog with optional note** — Verified (line 161-189). PASS.

5. **Snooze sets `snoozed_until` to 24h** — Line 72: `new Date(Date.now() + 24 * 3600_000).toISOString()`. PASS.

6. **`useAttentionData` filters acknowledged exceptions** — Lines 138-157 correctly separate active vs acknowledged, handling snooze expiry. PASS.

7. **Acknowledged section renders in collapsed state** — `AttentionCenter.tsx` lines 55-76. PASS.

8. **Insert uses `as any` cast** — Line 72 in AttentionQueue. This works but is fragile. The `attention_acknowledgements` table is not in the generated types file. Minor risk, not blocking.

---

### TEST 4 — Expense Save + Receipt Upload

**Status: PASS**

1. **`expense-receipts` bucket exists** — Confirmed in storage buckets list. PASS.

2. **Storage RLS policies exist** — INSERT, SELECT, DELETE policies for `expense-receipts` bucket confirmed. PASS.

3. **`uploadReceipt` uses `expense-receipts` bucket** — Line 221 in `expenseApi.ts`. PASS.

4. **Signed URL generated for private access** — Line 225-228, 1-year signed URL. PASS.

5. **Error messages now surface real error text** — `ExpenseForm.tsx` line 261: `msg` from `err.message` shown in toast. PASS.

6. **No partial save on upload failure** — The expense is created first, then receipt upload. If upload fails, the expense row exists without a receipt. This is the expected behavior (expense is valid without receipt). Acceptable.

---

### SECURITY CHECKS

1. **`admin_audit_log` RLS** — SELECT only for `is_super_admin()`. No INSERT/UPDATE/DELETE for authenticated users. Service role bypasses RLS for edge function writes. PASS.

2. **`attention_acknowledgements` RLS** — `user_role() IN ('admin', 'super_admin')` for ALL. `acknowledged_by` is set from `user.id` client-side. PASS.

3. **`is_super_admin()` DB function** — STILL CONTAINS HARDCODED EMAILS. This is the single remaining security issue.

---

### PERFORMANCE CHECK

- `JobsMonitorTab` → `.limit(100)`. PASS.
- `AuditLogTab` → `.limit(100)`. PASS.
- `ErrorLogTab` → `.limit(100)`. PASS.
- `useAttentionData` → `.limit(500)` for jobs, `.limit(200)` for sync_errors, `.limit(500)` for logs. These are bounded. PASS.
- Acknowledgements query has no limit (line 87-88 in `useAttentionData.ts`). Minor risk — could grow unbounded over time. Low priority.

---

## Issues to Fix

### Issue 1 (Critical): `is_super_admin()` DB function still has hardcoded emails
- **Affected**: `supabase/functions` (DB function `is_super_admin`)
- **Root cause**: Move 4 updated AuthContext and the edge function but missed the database function
- **Fix**: Migration to replace `is_super_admin()` removing the email array

### Issue 2 (Medium): No self-deactivation guard in `promote-admin`
- **Affected**: `supabase/functions/promote-admin/index.ts`
- **Root cause**: Missing validation check
- **Fix**: Add caller === target check before deactivate/reactivate

### Issue 3 (Low): Acknowledgements query unbounded
- **Affected**: `src/features/attention/hooks/useAttentionData.ts` line 87-88
- **Root cause**: No `.limit()` on acknowledgements fetch
- **Fix**: Add `.limit(1000)` to prevent unbounded growth

---

## Implementation

### Migration: Remove hardcoded emails from `is_super_admin()`

```sql
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    lower(coalesce(
      auth.jwt() -> 'user_metadata' ->> 'role',
      auth.jwt() -> 'app_metadata' ->> 'role',
      ''
    )) IN ('super_admin', 'superadmin')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        coalesce(auth.jwt() -> 'user_metadata' -> 'roles', '[]'::jsonb)
      ) AS r(role)
      WHERE upper(r.role) IN ('SUPERADMIN', 'SUPER_ADMIN')
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb)
      ) AS r(role)
      WHERE upper(r.role) IN ('SUPERADMIN', 'SUPER_ADMIN')
    );
$$;
```

### Edge function fix: Self-deactivation guard

In `promote-admin/index.ts`, inside the `deactivate`/`reactivate` block, add before the `getUserById` call:
```typescript
if (user_id === caller.id) return jsonRes({ error: "CANNOT_MODIFY_SELF" }, 400);
```

### Acknowledgements limit

In `useAttentionData.ts` line 87-88, add `.limit(1000)`.

---

## Remaining Risks

1. **Existing super admin accounts MUST have `app_metadata.role = 'super_admin'` set** before deploying the `is_super_admin()` migration. If not, they will lose all access. Verify via Supabase dashboard first.
2. **JWT caching** — Role changes via `set_role` won't take effect until the user's JWT expires (~1 hour) or they re-login. No fix possible without custom JWT refresh logic.
3. **`attention_acknowledgements` not in generated types** — The `as any` cast works but will break if strict type checking is enabled later. Regenerate types after migration.
