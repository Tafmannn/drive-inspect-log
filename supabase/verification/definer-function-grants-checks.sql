-- Verification for 20260716170000_lockdown_security_definer_function_grants.sql
-- Run each block against the target environment; expected results inline.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. No SECURITY DEFINER function in public is executable by anon except
--    the two intentional QR handover RPCs.
--    EXPECT: exactly qr_confirm, qr_lookup.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. authenticated can execute ONLY the intended app surface.
--    EXPECT: allocate_invoice_number, is_admin_or_super_admin,
--            is_super_admin, next_job_number, qr_confirm, qr_lookup,
--            user_org_id, user_role.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('authenticated', p.oid, 'EXECUTE')
order by p.proname;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. service_role keeps EXECUTE on all 27 definer functions (edge functions
--    and admin tooling unaffected).
--    EXPECT: count = 27 (adjust if definer functions are added/removed later).
select count(*) as service_role_executable
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('service_role', p.oid, 'EXECUTE');

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS helper predicates still work for signed-in users: policies on
--    core tables must evaluate without 42501. Smoke-check via a definer-free
--    probe is not possible from SQL editor (runs as postgres); instead
--    verify in-app: sign in as a driver → job list loads; sign in as an
--    admin → invoices page loads and "Generate invoice number" works.

-- ─────────────────────────────────────────────────────────────────────────
-- 5. QR handover flow still works unauthenticated: open a fresh handover QR
--    link in a private window → page shows job ref + vehicle reg (qr_lookup),
--    and confirming records the confirmation (qr_confirm).

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Signup trigger unaffected (handle_new_user fires as trigger despite
--    revoked EXECUTE): create a fresh user via the app's signup flow →
--    a user_profiles row appears.
select count(*) as trigger_present
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where p.proname = 'handle_new_user' and not t.tgisinternal;
-- EXPECT: 1
