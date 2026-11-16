# 08 — Break-glass: recovering the owner (Super Admin) account

Use this only if the Super Admin can no longer sign in or no longer has owner powers: locked out, suspended, demoted, or the password is lost. Nothing here is available from inside the app, on purpose: no screen, function or password can restore the owner, so there is no way for an attacker to use one.

## Who can do it

Only someone who can sign in to the **Supabase dashboard** for this project. In the dashboard the SQL editor runs as the database owner, which is the one place the privileged-column guard (`guard_user_profile_privileged_columns`) lets through. Keep that login safe: turn on two-factor authentication for Supabase and for GitHub, and store the recovery codes offline. Those accounts are your real recovery path.

Never put the service-role key in the app, in chat, or in a ticket.

## Why a lock-out can't happen by accident

* The owner account is `is_protected`. `user-lifecycle` refuses to suspend a protected account, nobody can suspend themselves, and nobody can change their own role.
* Only a super admin can change anyone's role, and the database trigger enforces it.
* If all of those were bypassed, steps 1–3 below put it right.

## Steps

Replace `<OWNER_EMAIL>` with the owner's sign-in email. Run in the Supabase dashboard → SQL Editor.

**1. Find the account and see what's wrong**

```sql
select p.auth_user_id, p.email, p.role, p.account_status, p.is_protected,
       u.banned_until, u.last_sign_in_at
from public.user_profiles p
join auth.users u on u.id = p.auth_user_id
where lower(p.email) = lower('<OWNER_EMAIL>');
```

Typical faults: `role` is not `super_admin`, `account_status` is not `active`, `is_protected` is false, or `banned_until` is set.

**2. Restore it** (one account, matched by id)

```sql
update public.user_profiles
   set role = 'super_admin', account_status = 'active', is_protected = true,
       suspended_at = null, suspended_by = null, suspension_reason = null
 where auth_user_id = '<AUTH_USER_ID_FROM_STEP_1>';

update auth.users set banned_until = null where id = '<AUTH_USER_ID_FROM_STEP_1>';
```

Suspending an account in the app also bans it in the auth system, so both statements are needed.

**3. Leave a trace**

```sql
insert into public.admin_audit_log
  (performed_by, performed_by_email, action, target_user_id, before_state, after_state)
values
  ('<AUTH_USER_ID_FROM_STEP_1>', '<OWNER_EMAIL>', 'break_glass_restore_owner',
   '<AUTH_USER_ID_FROM_STEP_1>',
   jsonb_build_object('note', 'restored via SQL editor'),
   jsonb_build_object('role', 'super_admin', 'account_status', 'active'));
```

**4. Password.** If the password is also lost: Dashboard → Authentication → Users → the owner → **Send password recovery**, or use *Forgot password?* on the sign-in page.

**5. Check it worked.** Re-run step 1: `role = super_admin`, `account_status = active`, `is_protected = true`, `banned_until` empty. Then sign in, fully close and reopen the app, and open Super Admin → Users.

## Checked

The statements in steps 2–3 were tested on 2026-11-16 against the live database inside a transaction that was rolled back. After deliberately locking the owner out (demoted, suspended, unprotected, banned) they restored `super_admin / active / protected / not banned`, and `is_super_admin()` returned true for the owner. The real owner account was not changed.

## A second Super Admin?

Not recommended. The owner is meant to be the only Super Admin, and a spare account is another credential to protect. Dashboard access with two-factor authentication is the recovery path.
