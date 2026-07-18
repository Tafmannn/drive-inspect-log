-- =====================================================================
-- SECURITY-007: SECURITY DEFINER functions executable by anon/authenticated
-- =====================================================================
-- DEFECT: the Supabase advisors "anon_security_definer_function_executable"
--   and "authenticated_security_definer_function_executable" flag all 27
--   SECURITY DEFINER functions in `public`: every one of them carries the
--   Supabase default EXECUTE grants (PUBLIC + anon + authenticated +
--   service_role), so every one is callable by the UNAUTHENTICATED anon
--   role via `/rest/v1/rpc/<name>` — including trigger bodies, internal
--   helpers, and superseded admin/user-lifecycle RPCs that no client code
--   path calls at all. Concretely exploitable today with just the publishable
--   anon key:
--     * next_job_number()            — anyone can burn the global job-number
--                                      sequence (no internal auth check; its
--                                      only gate IS the EXECUTE grant)
--     * activate_user_account(uuid) / suspend_user_account(uuid,text) /
--       archive_driver_profile / restore_driver_profile /
--       upsert_user_permission_override / delete_user_permission_override —
--       definer-privileged user-lifecycle mutations reachable by anon (their
--       internal checks depend on auth.uid()/caller-role lookups, so the
--       grant surface should still be closed defence-in-depth; the app has
--       used the service-role `user-lifecycle` edge function for all of this
--       since it was introduced — NO client or edge-function code calls
--       these RPCs)
--     * trigger functions (handle_new_user, set_photo_org_from_job, ...) —
--       directly invocable as RPCs even though they only make sense fired
--       from their triggers.
--
-- FIX: least-privilege EXECUTE grants per function, in three groups:
--
--   Group A — internal only (trigger bodies, trigger-called helpers, dead
--     helpers, RPCs superseded by the user-lifecycle edge function):
--     revoke PUBLIC/anon/authenticated. postgres (owner) and service_role
--     keep EXECUTE. Trigger firing is unaffected: EXECUTE on a trigger
--     function is checked when the trigger is created, not per-statement
--     at fire time, and the functions run SECURITY DEFINER regardless.
--
--   Group B — authenticated app surface (RLS helper predicates + RPCs the
--     frontend actually calls): revoke PUBLIC/anon, re-grant authenticated
--     explicitly. NOTE: a handful of legacy PUBLIC-role RLS policies
--     (damage_items, expenses, inspections, job_activity_log,
--     job_deviation_log, expense_receipts, driver_onboarding) reference
--     is_super_admin()/user_org_id() and also apply to anon; anon queries
--     against those tables now fail with 42501 (permission denied on the
--     helper) instead of returning zero rows. That is fail-closed and no
--     unauthenticated app path queries those tables (the only anon surfaces
--     are the QR RPCs and the bounded client_logs INSERT policy, which uses
--     no definer helpers).
--
--   Group C — intentional anon surface: qr_lookup / qr_confirm stay
--     executable by anon+authenticated. They are token-keyed (24-byte
--     unguessable token, no enumerable ids) per
--     20260630100200_phase1_qr_handover_security_definer_rpcs.sql. The
--     advisor will keep flagging them; that is accepted and documented via
--     COMMENT ON FUNCTION below.
--
-- Also documents (COMMENT) that `invoice_number_counters` intentionally has
-- RLS enabled with NO policies ("rls_enabled_no_policy" INFO lint): the only
-- supported write path is the self-authorizing allocate_invoice_number()
-- definer RPC, so direct client access is deny-all by design.
--
-- NOT covered here (dashboard setting, no SQL surface): the
-- "auth_leaked_password_protection" WARN — enable "Prevent use of leaked
-- passwords" under Authentication → Passwords in the Supabase dashboard.
--
-- Rollback: supabase/rollback/20260716170000_lockdown_security_definer_function_grants.down.sql
-- =====================================================================

-- ── Group A: internal only (postgres owner + service_role) ──────────────

-- Trigger bodies
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_photo_to_inspection_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_photo_to_inspection_on_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_evidence_org_from_job()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_photo_org_from_job()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_damage_photo_url()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_inspections_link_photos()        FROM PUBLIC, anon, authenticated;

-- Helper called only from trg_inspections_link_photos (runs as postgres)
REVOKE EXECUTE ON FUNCTION public.link_unlinked_photos_to_inspection(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- User-lifecycle RPCs superseded by the service-role `user-lifecycle` edge
-- function; no client or edge-function code calls them
REVOKE EXECUTE ON FUNCTION public.activate_user_account(uuid)                          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.suspend_user_account(uuid, text)                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_driver_profile(uuid, text, boolean)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.restore_driver_profile(uuid, text, boolean)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_user_permission_override(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_user_permission_override(uuid, text)          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_user_permission_override(uuid, text, text)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_actor_manage_permission(uuid, uuid, text, text)  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_actor_manage_target_user(uuid, uuid)             FROM PUBLIC, anon, authenticated;

-- Dead definer helpers: referenced by NO policy, view, function, or client
-- code (verified against live catalog + repo). Left in place but locked down.
REVOKE EXECUTE ON FUNCTION public.same_org_as_target(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_account_status()    FROM PUBLIC, anon, authenticated;

-- ── Group B: authenticated app surface ───────────────────────────────────

-- RLS helper predicates (evaluated as the querying role inside policies —
-- authenticated MUST keep EXECUTE or every policy referencing them errors)
REVOKE EXECUTE ON FUNCTION public.is_super_admin()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_org_id()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_role()               FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_super_admin()          TO authenticated;
GRANT  EXECUTE ON FUNCTION public.is_admin_or_super_admin() TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_org_id()             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.user_role()               TO authenticated;

-- RPCs the frontend calls while signed in.
-- allocate_invoice_number self-authorizes (raises 42501 unless the caller is
-- super admin or a member of p_org_id). next_job_number has NO internal
-- check — the authenticated-only EXECUTE grant is its gate, which this
-- migration is what finally enforces.
REVOKE EXECUTE ON FUNCTION public.allocate_invoice_number(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_job_number()             FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.allocate_invoice_number(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.next_job_number()             TO authenticated;

-- ── Group C: intentional anon surface (QR handover) ─────────────────────

-- Make the grants explicit (drop reliance on any implicit PUBLIC grant) and
-- record WHY anon keeps EXECUTE, so future audits don't "fix" this.
REVOKE EXECUTE ON FUNCTION public.qr_lookup(text)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.qr_confirm(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.qr_lookup(text)              TO anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.qr_confirm(text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.qr_lookup(text) IS
  'INTENTIONALLY anon-executable (advisor: anon_security_definer_function_executable is accepted). '
  'Token-keyed public customer handover lookup: returns only status/event_type/job_ref/vehicle_reg '
  'for an unguessable 24-byte token. See 20260630100200_phase1_qr_handover_security_definer_rpcs.sql.';
COMMENT ON FUNCTION public.qr_confirm(text, text, text) IS
  'INTENTIONALLY anon-executable (advisor: anon_security_definer_function_executable is accepted). '
  'Token-keyed public customer handover confirmation; single-use (rejects confirmed/expired tokens). '
  'See 20260630100200_phase1_qr_handover_security_definer_rpcs.sql.';

-- ── invoice_number_counters: document the intentional no-policy RLS ──────

COMMENT ON TABLE public.invoice_number_counters IS
  'Per-org invoice sequence counters. RLS is intentionally enabled with NO policies '
  '(advisor: rls_enabled_no_policy INFO is accepted): direct client access is deny-all '
  'by design; the only supported access path is the self-authorizing SECURITY DEFINER '
  'RPC allocate_invoice_number(p_org_id). '
  'See 20260713140000_invoice_number_atomic_allocation_and_constraints.sql.';
