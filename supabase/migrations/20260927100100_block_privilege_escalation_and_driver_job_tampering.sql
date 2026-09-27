-- 20260927100100_block_privilege_escalation_and_driver_job_tampering
--
-- SECURITY — found by a live RLS probe (run inside a rolled-back transaction):
--
--  1. CRITICAL privilege escalation. The user_profiles UPDATE policy lets every
--     user update their own row, and `authenticated` holds UPDATE on every
--     column — including role, org_id and account_status. Any driver could
--     PATCH /rest/v1/user_profiles {"role":"super_admin"} on their own row
--     and immediately pass is_super_admin() (probe: visible profiles 1 -> 6,
--     visible orgs 1 -> 2). The same hole let a suspended user reactivate
--     themselves or hop to another org.
--  2. HIGH. jobs_update_org lets any org member update any column of any job
--     in the org, so a driver could mark jobs completed (skipping POD review),
--     change prices, reassign drivers, or call reopen_job (security invoker)
--     to archive all of a job's evidence.
--  3. MEDIUM. app_settings_write_admin let any org admin rewrite platform-wide
--     settings (pricing_defaults, MAPS_/VISION_AI_ENABLED) for every tenant.
--
-- Legitimate writers are unaffected: privileged profile changes go through the
-- user-lifecycle edge function (service_role) and SECURITY DEFINER RPCs (run as
-- the function owner), which the guards skip; drivers keep the status moves
-- their inspection flow makes (in-progress flips, submit_inspection,
-- rollback_inspection_submission). Guards only apply when the effective role
-- is anon/authenticated, i.e. direct PostgREST calls and invoker RPCs.

-- ── 1. user_profiles: freeze privileged columns ─────────────────────────
CREATE OR REPLACE FUNCTION public.guard_user_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'super_admin' OR COALESCE(NEW.is_protected, false) THEN
      RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
        USING ERRCODE = '42501', HINT = 'Only a super-admin can create super-admin or protected profiles';
    END IF;
    RETURN NEW;
  END IF;

  -- Identity/tenancy columns are never editable from the client.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.is_protected IS DISTINCT FROM OLD.is_protected THEN
    RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
      USING ERRCODE = '42501', HINT = 'id, auth_user_id, org_id and is_protected cannot be changed here';
  END IF;

  IF public.is_admin_or_super_admin() THEN
    -- Org admins manage their org's users but cannot mint, demote or suspend
    -- super-admins, nor change the role/status of protected users.
    IF (NEW.role = 'super_admin' OR OLD.role = 'super_admin')
       AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.account_status IS DISTINCT FROM OLD.account_status) THEN
      RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
        USING ERRCODE = '42501', HINT = 'Only a super-admin can grant, revoke or suspend super-admin';
    END IF;
    IF OLD.is_protected
       AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.account_status IS DISTINCT FROM OLD.account_status) THEN
      RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
        USING ERRCODE = '42501', HINT = 'Protected users can only be changed by a super-admin';
    END IF;
    RETURN NEW;
  END IF;

  -- Everyone else (drivers editing their own row): personal fields only.
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.internal_notes IS DISTINCT FROM OLD.internal_notes
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.activated_by IS DISTINCT FROM OLD.activated_by
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
     OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
      USING ERRCODE = '42501', HINT = 'Only personal details can be changed on your own profile';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_user_profile_privileged_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_profiles_guard_privileged ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_guard_privileged
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_privileged_columns();

-- ── 2. jobs: drivers may only progress their own inspection workflow ─────
CREATE OR REPLACE FUNCTION public.guard_job_driver_writes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_closed text[] := ARRAY['completed','cancelled','archived','failed'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin_or_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Must be the job's assigned driver.
  IF OLD.driver_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.driver_profiles dp
     WHERE dp.id = OLD.driver_id AND dp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Drivers can only update jobs assigned to them';
  END IF;

  -- Only workflow columns may change; everything else is admin-owned.
  IF (to_jsonb(NEW) - ARRAY['status','has_pickup_inspection','has_delivery_inspection','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','has_pickup_inspection','has_delivery_inspection','updated_at']) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Drivers can only change a job''s workflow status';
  END IF;

  -- Closing (or reopening a closed) job is an admin decision.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status = ANY(v_closed) OR OLD.status = ANY(v_closed)) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Only an admin can move a job to or from ' || NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_job_driver_writes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_jobs_guard_driver_writes ON public.jobs;
CREATE TRIGGER trg_jobs_guard_driver_writes
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_job_driver_writes();

-- ── 3. reopen_job: admin only ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reopen_job(p_job_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_from_status text;
  v_new_run uuid := gen_random_uuid();
BEGIN
  -- Reopening archives every inspection, damage item and photo on the job, so
  -- it is an admin action. Before this check, RLS alone let any member of the
  -- job's org (i.e. drivers) call it.
  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501',
            HINT = 'Only an admin or super-admin can reopen a job';
  END IF;

  SELECT org_id, status INTO v_org_id, v_from_status
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- Soft-archive all currently-active evidence
  UPDATE public.inspections SET archived_at = now()
   WHERE job_id = p_job_id AND archived_at IS NULL;

  UPDATE public.damage_items SET archived_at = now()
   WHERE archived_at IS NULL
     AND inspection_id IN (SELECT id FROM public.inspections WHERE job_id = p_job_id);

  UPDATE public.photos SET archived_at = now()
   WHERE job_id = p_job_id AND archived_at IS NULL;

  UPDATE public.jobs
     SET status = 'ready_for_pickup',
         has_pickup_inspection = false,
         has_delivery_inspection = false,
         completed_at = NULL,
         current_run_id = v_new_run,
         updated_at = now()
   WHERE id = p_job_id;

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (p_job_id, v_org_id, 'job_reopened', v_from_status, 'ready_for_pickup',
          COALESCE(p_notes, 'Reopened — previous inspection evidence archived'));

  RETURN jsonb_build_object('runId', v_new_run, 'fromStatus', v_from_status);
END
$function$;

-- ── 4. app_settings: platform-wide, so super-admin writes only ───────────
-- "Super admins can write app_settings" (is_super_admin()) remains.
DROP POLICY IF EXISTS "app_settings_write_admin" ON public.app_settings;
