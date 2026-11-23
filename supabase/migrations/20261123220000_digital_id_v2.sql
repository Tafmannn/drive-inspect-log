-- Axentra Digital ID V2: professional company credential.
-- The credential is NOT a driving-licence or government identity verification.
-- Additive migration; never reassign serials or destroy existing driver records.
CREATE SCHEMA IF NOT EXISTS axentra_private;
REVOKE ALL ON SCHEMA axentra_private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.driver_digital_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.user_profiles(auth_user_id) ON DELETE RESTRICT,
  org_id uuid REFERENCES public.organisations(id),
  serial_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
  credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  photo_path text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS driver_digital_credentials_org_idx
  ON public.driver_digital_credentials(org_id);

CREATE TABLE IF NOT EXISTS public.driver_digital_credential_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  credential_id uuid NOT NULL REFERENCES public.driver_digital_credentials(id) ON DELETE RESTRICT,
  actor_user_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('issued','revoked','reactivated','photo_updated','org_changed')),
  credential_version integer NOT NULL CHECK (credential_version > 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_digital_events_credential_idx
  ON public.driver_digital_credential_events(credential_id, created_at DESC);

ALTER TABLE public.driver_digital_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_digital_credential_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_digital_credentials FROM anon, authenticated;
REVOKE ALL ON public.driver_digital_credential_events FROM anon, authenticated;
GRANT SELECT ON public.driver_digital_credentials TO authenticated;
GRANT SELECT ON public.driver_digital_credential_events TO authenticated;

DROP POLICY IF EXISTS "digital_id_credential_read_self_or_admin" ON public.driver_digital_credentials;
CREATE POLICY "digital_id_credential_read_self_or_admin"
ON public.driver_digital_credentials FOR SELECT TO authenticated
USING (
  (user_id = (SELECT auth.uid()) AND status = 'active'
   AND EXISTS (SELECT 1 FROM public.user_profiles u
               WHERE u.auth_user_id = (SELECT auth.uid())
                 AND u.account_status = 'active' AND u.role = 'driver'))
  OR public.is_super_admin()
  OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
);

DROP POLICY IF EXISTS "digital_id_history_admin_only" ON public.driver_digital_credential_events;
CREATE POLICY "digital_id_history_admin_only"
ON public.driver_digital_credential_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.driver_digital_credentials c
    WHERE c.id = credential_id
      AND (public.is_super_admin()
           OR (public.is_admin_or_super_admin() AND c.org_id = public.user_org_id()))
  )
);

-- Both account-management Edge Functions and database RPCs update user_profiles;
-- database triggers guarantee no route can omit issuing/revoking an ID.
CREATE OR REPLACE FUNCTION axentra_private.sync_driver_digital_credential(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, axentra_private
AS $func$
DECLARE
  v_account public.user_profiles%ROWTYPE;
  v_driver public.driver_profiles%ROWTYPE;
  v_current public.driver_digital_credentials%ROWTYPE;
  v_eligible boolean;
  v_created boolean := false;
  v_event text;
BEGIN
  SELECT * INTO v_account FROM public.user_profiles
  WHERE auth_user_id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_driver FROM public.driver_profiles
  WHERE user_id = p_user_id ORDER BY updated_at DESC LIMIT 1;

  v_eligible := v_account.role = 'driver'
                AND v_account.account_status = 'active'
                AND (v_driver.id IS NULL OR (v_driver.is_active AND v_driver.archived_at IS NULL
                      AND v_driver.org_id IS NOT DISTINCT FROM v_account.org_id));

  SELECT * INTO v_current FROM public.driver_digital_credentials
  WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    -- Pending invitations have no issued credential. First issuance happens on activation.
    IF v_account.role <> 'driver' OR v_account.account_status <> 'active' THEN RETURN; END IF;
    INSERT INTO public.driver_digital_credentials
      (user_id, org_id, status, revoked_at)
    VALUES (p_user_id, v_account.org_id,
      CASE WHEN v_eligible THEN 'active' ELSE 'revoked' END,
      CASE WHEN v_eligible THEN NULL ELSE now() END)
    RETURNING * INTO v_current;
    v_created := true;
    v_event := 'issued';
  ELSIF v_current.org_id IS DISTINCT FROM v_account.org_id THEN
    -- A driver transferred between orgs must not keep an old organisation's
    -- private portrait or access scope. Retain permanent serial, rotate version.
    UPDATE public.driver_digital_credentials
       SET org_id = v_account.org_id, photo_path = NULL,
           credential_version = credential_version + 1,
           status = CASE WHEN v_eligible THEN 'active' ELSE 'revoked' END,
           revoked_at = CASE WHEN v_eligible THEN NULL ELSE now() END,
           updated_at = now()
     WHERE user_id = p_user_id RETURNING * INTO v_current;
    v_event := 'org_changed';
  ELSIF v_eligible AND v_current.status = 'revoked' THEN
    UPDATE public.driver_digital_credentials
       SET status = 'active',
           credential_version = credential_version + 1,
           revoked_at = NULL, updated_at = now(),
           org_id = v_account.org_id
     WHERE user_id = p_user_id RETURNING * INTO v_current;
    v_event := 'reactivated';
  ELSIF NOT v_eligible AND v_current.status = 'active' THEN
    UPDATE public.driver_digital_credentials
       SET status = 'revoked', revoked_at = now(), updated_at = now()
     WHERE user_id = p_user_id RETURNING * INTO v_current;
    v_event := 'revoked';
  END IF;

  IF v_event IS NOT NULL THEN
    INSERT INTO public.driver_digital_credential_events
      (credential_id, actor_user_id, event_type, credential_version, details)
    VALUES (
      v_current.id, auth.uid(), v_event, v_current.credential_version,
      jsonb_build_object('account_status', v_account.account_status,
                         'role', v_account.role, 'active', v_eligible,
                         'initial_issue', v_created)
    );
  END IF;
END;
$func$;
REVOKE ALL ON FUNCTION axentra_private.sync_driver_digital_credential(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION axentra_private.on_digital_id_account_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, axentra_private
AS $func$
BEGIN
  PERFORM axentra_private.sync_driver_digital_credential(NEW.auth_user_id);
  RETURN NEW;
END;
$func$;
REVOKE ALL ON FUNCTION axentra_private.on_digital_id_account_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS digital_id_account_state_change ON public.user_profiles;
CREATE TRIGGER digital_id_account_state_change
AFTER INSERT OR UPDATE OF account_status, role, org_id ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION axentra_private.on_digital_id_account_change();

CREATE OR REPLACE FUNCTION axentra_private.on_digital_id_driver_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, axentra_private
AS $func$
BEGIN
  PERFORM axentra_private.sync_driver_digital_credential(NEW.user_id);
  RETURN NEW;
END;
$func$;
REVOKE ALL ON FUNCTION axentra_private.on_digital_id_driver_change()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS digital_id_driver_state_change ON public.driver_profiles;
CREATE TRIGGER digital_id_driver_state_change
AFTER INSERT OR UPDATE OF is_active, archived_at, org_id ON public.driver_profiles
FOR EACH ROW EXECUTE FUNCTION axentra_private.on_digital_id_driver_change();

-- The existing driver_profiles UPDATE policy permits self-edits. Prevent
-- self-service activation, archiving or unarchiving through direct API calls.
CREATE OR REPLACE FUNCTION public.guard_driver_digital_id_state()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $func$
BEGIN
  IF current_user = 'authenticated'
     AND NOT public.is_admin_or_super_admin()
     AND (NEW.is_active IS DISTINCT FROM OLD.is_active
          OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
          OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
          OR NEW.archive_reason IS DISTINCT FROM OLD.archive_reason
          OR NEW.restored_at IS DISTINCT FROM OLD.restored_at
          OR NEW.restored_by IS DISTINCT FROM OLD.restored_by) THEN
    RAISE EXCEPTION 'DRIVER_STATE_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$func$;
REVOKE ALL ON FUNCTION public.guard_driver_digital_id_state()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_driver_digital_id_state ON public.driver_profiles;
CREATE TRIGGER guard_driver_digital_id_state
BEFORE UPDATE ON public.driver_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_driver_digital_id_state();

-- A private bucket dedicated to company ID photos. The separate general
-- profile-photos bucket remains unchanged, preventing unrelated regressions.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('digital-id-photos','digital-id-photos',false,5242880,
        ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

-- Path convention: organisation_uuid/user_uuid/filename.
-- Only an admin for the same organisation or a super admin may write.
DROP POLICY IF EXISTS "digital_id_photo_admin_insert" ON storage.objects;
CREATE POLICY "digital_id_photo_admin_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'digital-id-photos'
  AND split_part(name, '/', 2) <> ''
  AND (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin()
        AND split_part(name, '/', 1) = public.user_org_id()::text)
  )
  AND EXISTS (
    SELECT 1 FROM public.driver_digital_credentials c
    WHERE c.user_id::text = split_part(name, '/', 2)
      AND (public.is_super_admin() OR c.org_id::text = split_part(name, '/', 1))
  )
);
DROP POLICY IF EXISTS "digital_id_photo_admin_update" ON storage.objects;
CREATE POLICY "digital_id_photo_admin_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'digital-id-photos' AND
       (public.is_super_admin() OR
        (public.is_admin_or_super_admin() AND
          split_part(name, '/', 1) = public.user_org_id()::text)))
WITH CHECK (bucket_id = 'digital-id-photos' AND
       (public.is_super_admin() OR
        (public.is_admin_or_super_admin() AND
          split_part(name, '/', 1) = public.user_org_id()::text)));
DROP POLICY IF EXISTS "digital_id_photo_admin_delete" ON storage.objects;
CREATE POLICY "digital_id_photo_admin_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'digital-id-photos' AND
       (public.is_super_admin() OR
        (public.is_admin_or_super_admin() AND
          split_part(name, '/', 1) = public.user_org_id()::text)));
DROP POLICY IF EXISTS "digital_id_photo_read" ON storage.objects;
CREATE POLICY "digital_id_photo_read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'digital-id-photos' AND (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin()
        AND split_part(name, '/', 1) = public.user_org_id()::text)
    OR (split_part(name, '/', 2) = (SELECT auth.uid())::text
        AND EXISTS (SELECT 1 FROM public.driver_digital_credentials c
                    WHERE c.user_id = (SELECT auth.uid()) AND c.status = 'active')
        AND EXISTS (SELECT 1 FROM public.user_profiles u
                    WHERE u.auth_user_id = (SELECT auth.uid())
                      AND u.account_status = 'active'))
  )
);

-- Admin-only photograph assignment. Validates the object actually exists and
-- belongs to the target credential's org/user path before changing the pointer.
CREATE OR REPLACE FUNCTION public.set_driver_digital_id_photo(
  p_user_id uuid, p_photo_path text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $func$
DECLARE
  v_actor public.user_profiles%ROWTYPE;
  v_credential public.driver_digital_credentials%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.user_profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND OR v_actor.account_status <> 'active'
     OR v_actor.role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_credential FROM public.driver_digital_credentials
    WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR
     (v_actor.role <> 'super_admin' AND
       (v_actor.org_id IS NULL OR v_actor.org_id IS DISTINCT FROM v_credential.org_id)) THEN
    RAISE EXCEPTION 'NOT_AUTHORISED' USING ERRCODE = '42501';
  END IF;
  IF p_photo_path IS NOT NULL THEN
    IF v_credential.org_id IS NULL
       OR position(v_credential.org_id::text || '/' || p_user_id::text || '/' IN p_photo_path) <> 1
       OR NOT EXISTS (
          SELECT 1 FROM storage.objects WHERE bucket_id='digital-id-photos'
          AND name = p_photo_path
       ) THEN
      RAISE EXCEPTION 'INVALID_PHOTO_PATH' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_credential.photo_path IS NOT DISTINCT FROM p_photo_path THEN RETURN; END IF;
  UPDATE public.driver_digital_credentials
    SET photo_path = p_photo_path, updated_at = now() WHERE id = v_credential.id;
  INSERT INTO public.driver_digital_credential_events
    (credential_id, actor_user_id, event_type, credential_version, details)
  VALUES (v_credential.id, auth.uid(), 'photo_updated',
          v_credential.credential_version,
          jsonb_build_object('has_photo', p_photo_path IS NOT NULL));
END;
$func$;
REVOKE ALL ON FUNCTION public.set_driver_digital_id_photo(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_driver_digital_id_photo(uuid,text) TO authenticated;

-- Single authoritative card response, never returns licence fields, DOB,
-- private addresses, internal job information, or bank details.
CREATE OR REPLACE FUNCTION public.get_driver_digital_id(p_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $func$
DECLARE
  v_actor public.user_profiles%ROWTYPE;
  v_target public.user_profiles%ROWTYPE;
  v_driver public.driver_profiles%ROWTYPE;
  v_credential public.driver_digital_credentials%ROWTYPE;
  v_org public.organisations%ROWTYPE;
  v_target_id uuid := COALESCE(p_user_id, auth.uid());
  v_active boolean;
  v_name text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.user_profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND OR v_actor.account_status <> 'active' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_target FROM public.user_profiles WHERE auth_user_id = v_target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_target_id IS DISTINCT FROM auth.uid()
     AND v_actor.role <> 'super_admin'
     AND NOT (v_actor.role = 'admin' AND v_actor.org_id IS NOT NULL
              AND v_actor.org_id = v_target.org_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORISED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_credential FROM public.driver_digital_credentials
    WHERE user_id = v_target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_driver FROM public.driver_profiles
    WHERE user_id = v_target_id ORDER BY updated_at DESC LIMIT 1;
  SELECT * INTO v_org FROM public.organisations
    WHERE id = v_target.org_id;

  v_active := v_target.role = 'driver'
    AND v_target.account_status = 'active'
    AND v_credential.status = 'active'
    AND (v_driver.id IS NULL OR (v_driver.is_active AND v_driver.archived_at IS NULL
      AND v_driver.org_id IS NOT DISTINCT FROM v_target.org_id));

  -- A driver must not receive even an obsolete card when suspended/revoked.
  IF v_target_id = auth.uid() AND NOT v_active THEN
    RAISE EXCEPTION 'CREDENTIAL_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

  v_name := NULLIF(btrim(COALESCE(v_driver.full_name, '')), '');
  IF v_name IS NULL THEN
    v_name := NULLIF(btrim(COALESCE(v_target.full_name, '')), '');
  END IF;
  IF v_name IS NULL THEN
    v_name := NULLIF(btrim(concat_ws(' ', v_target.first_name, v_target.last_name)), '');
  END IF;

  RETURN jsonb_build_object(
    'driver_id', 'AX-' || repeat('0', GREATEST(0, 6 - length(v_credential.serial_number::text))) || v_credential.serial_number::text,
    'credential_id', v_credential.id,
    'user_id', v_credential.user_id,
    'org_id', v_credential.org_id,
    'full_name', v_name,
    'employment_type', v_driver.employment_type,
    'role_label', 'Authorised Driver',
    'photo_path', v_credential.photo_path,
    'credential_version', v_credential.credential_version,
    'status', CASE WHEN v_active THEN 'active' ELSE 'revoked' END,
    'checked_at', v_now,
    'valid_until', CASE WHEN v_active THEN v_now + interval '30 seconds' ELSE NULL END,
    'company_name', 'Axentra Vehicle Logistics',
    'company_website', 'www.axentravehicles.co.uk',
    'company_phone', v_org.main_contact_phone,
    'issued_by', 'Axentra Control'
  );
END;
$func$;
REVOKE ALL ON FUNCTION public.get_driver_digital_id(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_digital_id(uuid) TO authenticated;

-- Assign permanent serials for existing driver accounts without touching
-- their user/driver records. A suspended driver receives a revoked credential.
DO $backfill$
DECLARE v_user record;
BEGIN
  FOR v_user IN
    SELECT auth_user_id FROM public.user_profiles
     WHERE role = 'driver'
     ORDER BY created_at ASC, auth_user_id ASC
  LOOP
    PERFORM axentra_private.sync_driver_digital_credential(v_user.auth_user_id);
  END LOOP;
END;
$backfill$;
