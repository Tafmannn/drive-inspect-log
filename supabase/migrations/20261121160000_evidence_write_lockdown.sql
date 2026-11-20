-- Evidence write lock-down (20 Nov 2026 audit).
--
-- photos / inspections / damage_items / evidence_items / qr_confirmations had
-- org-wide UPDATE/DELETE policies plus full table grants (incl. TRUNCATE) for
-- `authenticated`, with no guard triggers. Read policies limit a driver to
-- their own open jobs, but within those a driver could delete a submitted
-- inspection or photos, or re-point a photo's job_id at another job in the
-- org. qr_confirmations had a single FOR ALL org policy, so any org member
-- could read every handover token in the org and mark one "confirmed by
-- customer" directly.
--
-- What legitimately writes (checked against code and pg_proc):
--   • clients: photos insert/upsert (retry idempotency → needs UPDATE),
--     evidence_items insert, qr_confirmations insert.
--   • submit_inspection (SECURITY INVOKER) UPDATEs inspections/damage_items.
--   • reopen_job (INVOKER, admin) UPDATEs photos.
--   • qr_confirm and the photo-link triggers are SECURITY DEFINER.
--   • nothing DELETEs or TRUNCATEs these tables.
--
-- Rollback: supabase/rollback/20261121160000_evidence_write_lockdown.down.sql

-- 1. No client deletes or truncates evidence.
REVOKE DELETE, TRUNCATE ON public.photos, public.inspections, public.damage_items,
  public.evidence_items, public.qr_confirmations FROM anon, authenticated;

-- 2. Nobody updates these directly.
REVOKE UPDATE ON public.evidence_items, public.qr_confirmations FROM anon, authenticated;

-- 3. qr_confirmations: scoped read, driver creates only for their own job, never pre-confirmed.
DROP POLICY IF EXISTS "Org members can manage qr_confirmations" ON public.qr_confirmations;
DROP POLICY IF EXISTS qr_confirmations_select_scoped ON public.qr_confirmations;
CREATE POLICY qr_confirmations_select_scoped ON public.qr_confirmations
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.jobs j
                WHERE j.id = qr_confirmations.job_id AND j.org_id = public.user_org_id()
                  AND (public.is_admin_or_super_admin() OR public.driver_can_read_job_evidence(j.id)))
  );
DROP POLICY IF EXISTS qr_confirmations_insert_scoped ON public.qr_confirmations;
CREATE POLICY qr_confirmations_insert_scoped ON public.qr_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (
    confirmed_at IS NULL AND customer_name IS NULL
    AND (
      public.is_super_admin()
      OR EXISTS (SELECT 1 FROM public.jobs j
                  WHERE j.id = qr_confirmations.job_id AND j.org_id = public.user_org_id()
                    AND (public.is_admin_or_super_admin() OR public.driver_owns_job(j.id)))
    )
  );

-- 4. photos: non-admins can't move a photo to another job/org/run.
CREATE OR REPLACE FUNCTION public.guard_photo_identity_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Owner-run code (definer link triggers, service role) and admins pass.
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin_or_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id THEN
    RAISE EXCEPTION 'PHOTO_IDENTITY_LOCKED'
      USING ERRCODE = '42501', HINT = 'A photo cannot be moved to another job, org or run';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.guard_photo_identity_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_photos_guard_identity ON public.photos;
CREATE TRIGGER trg_photos_guard_identity
  BEFORE UPDATE OF job_id, org_id, run_id ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.guard_photo_identity_columns();
