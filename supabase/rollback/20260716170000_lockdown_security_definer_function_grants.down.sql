-- Rollback for 20260716170000_lockdown_security_definer_function_grants.sql
-- Restores the pre-migration EXECUTE grants (Supabase defaults: anon +
-- authenticated + service_role on every function; several also carried an
-- implicit PUBLIC grant, restored here only where it existed before).
-- The COMMENTs added by the migration are informational and are cleared too.

-- ── Group A ──────────────────────────────────────────────────────────────
-- These previously had PUBLIC + anon + authenticated (trigger functions and
-- helpers created with the implicit PUBLIC default grant):
GRANT EXECUTE ON FUNCTION public.handle_new_user()                    TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_photo_to_inspection_on_insert() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_photo_to_inspection_on_update() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_evidence_org_from_job()          TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_photo_org_from_job()             TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_damage_photo_url()              TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_inspections_link_photos()        TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_unlinked_photos_to_inspection(uuid, uuid, text) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.same_org_as_target(uuid)             TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_account_status()                TO PUBLIC, anon, authenticated;

-- These previously had anon + authenticated (no PUBLIC entry):
GRANT EXECUTE ON FUNCTION public.activate_user_account(uuid)                             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_user_account(uuid, text)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_driver_profile(uuid, text, boolean)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_driver_profile(uuid, text, boolean)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_permission_override(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_permission_override(uuid, text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_permission_override(uuid, text, text)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_actor_manage_permission(uuid, uuid, text, text)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_actor_manage_target_user(uuid, uuid)                TO anon, authenticated;

-- ── Group B ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.is_super_admin()               TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin()      TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_org_id()                  TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_role()                    TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(uuid)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_job_number()              TO anon, authenticated;

-- ── Group C ──────────────────────────────────────────────────────────────
-- anon + authenticated grants were kept by the migration; nothing to restore
-- beyond clearing the comments.
COMMENT ON FUNCTION public.qr_lookup(text) IS NULL;
COMMENT ON FUNCTION public.qr_confirm(text, text, text) IS NULL;
COMMENT ON TABLE public.invoice_number_counters IS NULL;
