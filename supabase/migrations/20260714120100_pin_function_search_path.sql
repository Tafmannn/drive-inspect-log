-- =====================================================================
-- SECURITY-006: functions with mutable (unpinned) search_path
-- =====================================================================
-- DEFECT: the Supabase "function_search_path_mutable" advisor flags six
--   public functions that do not pin search_path. Severity is NOT uniform:
--
--   SECURITY DEFINER (real privilege-escalation surface — a role that can
--   create objects in an earlier-resolving schema could shadow an
--   unqualified name and have it run as the definer/owner `postgres`):
--     * link_unlinked_photos_to_inspection(uuid, uuid, text)
--     * trg_inspections_link_photos()            [trigger -> calls above]
--   Both currently mitigate this only by schema-qualifying every table
--   reference (public.inspections, public.photos, public.link_...), so the
--   live exploitability is low — but a definer function with an unpinned
--   search_path is a latent hazard and should be pinned regardless.
--
--   SECURITY INVOKER (no escalation path — run as the calling role, so
--   pinning is hygiene / clears the advisor, not a vulnerability fix):
--     * role_rank(text)                 IMMUTABLE, pure CASE, no schema refs
--     * normalize_client_name(text)     IMMUTABLE, built-ins only
--     * set_updated_at()                trigger, sets NEW.updated_at
--     * auto_link_job_to_client()       trigger, reads public.clients
--
-- FIX: pin search_path to 'public' on all six via ALTER FUNCTION (bodies
--   untouched). pg_catalog is always implicitly first, so built-ins
--   (now(), lower(), trim(), regexp_replace(), gen_random_uuid()) still
--   resolve; 'public' covers the app tables/functions each one references.
--   This matches the convention already used by every other function in
--   this database (SET search_path TO 'public').
-- =====================================================================

-- SECURITY DEFINER — the ones that actually matter
ALTER FUNCTION public.link_unlinked_photos_to_inspection(uuid, uuid, text)
  SET search_path TO 'public';
ALTER FUNCTION public.trg_inspections_link_photos()
  SET search_path TO 'public';

-- SECURITY INVOKER — hygiene / advisor cleanup
ALTER FUNCTION public.role_rank(text)
  SET search_path TO 'public';
ALTER FUNCTION public.normalize_client_name(text)
  SET search_path TO 'public';
ALTER FUNCTION public.set_updated_at()
  SET search_path TO 'public';
ALTER FUNCTION public.auto_link_job_to_client()
  SET search_path TO 'public';
