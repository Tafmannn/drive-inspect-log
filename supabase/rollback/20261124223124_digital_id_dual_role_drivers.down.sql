-- Revert the dual-role eligibility change only; preserve credential history and serials.
-- Review and test on a disposable database before applying.
BEGIN;
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
  v_approved_name text;
BEGIN
  SELECT * INTO v_account FROM public.user_profiles
  WHERE auth_user_id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_driver FROM public.driver_profiles
  WHERE user_id = p_user_id ORDER BY updated_at DESC LIMIT 1;

  v_approved_name := COALESCE(
    NULLIF(btrim(v_driver.full_name), ''),
    NULLIF(btrim(v_account.full_name), ''),
    NULLIF(btrim(concat_ws(' ', v_account.first_name, v_account.last_name)), ''),
    ''
  );

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
      (user_id, org_id, holder_name, status, revoked_at)
    VALUES (p_user_id, v_account.org_id, v_approved_name,
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

  -- The customer-facing company-ID name is admin-approved and stored in the
  -- credential. A driver may edit their normal profile without impersonating
  -- another person on the company-issued card.
  IF NOT v_created AND v_approved_name <> ''
     AND (auth.uid() IS NULL OR public.is_admin_or_super_admin())
     AND v_current.holder_name IS DISTINCT FROM v_approved_name THEN
    UPDATE public.driver_digital_credentials
      SET holder_name = v_approved_name, updated_at = now()
      WHERE id = v_current.id RETURNING * INTO v_current;
    INSERT INTO public.driver_digital_credential_events
      (credential_id, actor_user_id, event_type, credential_version, details)
    VALUES (v_current.id, auth.uid(), 'name_updated',
            v_current.credential_version, jsonb_build_object('approved_name_updated', true));
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
REVOKE ALL ON FUNCTION axentra_private.sync_driver_digital_credential(uuid) FROM PUBLIC, anon, authenticated;
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
    AND NULLIF(btrim(v_credential.holder_name), '') IS NOT NULL
    AND (v_driver.id IS NULL OR (v_driver.is_active AND v_driver.archived_at IS NULL
      AND v_driver.org_id IS NOT DISTINCT FROM v_target.org_id));

  -- A driver must not receive even an obsolete card when suspended/revoked.
  IF v_target_id = auth.uid() AND NOT v_active THEN
    RAISE EXCEPTION 'CREDENTIAL_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

   RETURN jsonb_build_object(
    'driver_id', 'AX-' || repeat('0', GREATEST(0, 6 - length(v_credential.serial_number::text))) || v_credential.serial_number::text,
    'credential_id', v_credential.id,
    'user_id', v_credential.user_id,
    'org_id', v_credential.org_id,
    'full_name', v_credential.holder_name,
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
REVOKE ALL ON FUNCTION public.get_driver_digital_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_digital_id(uuid) TO authenticated;
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
DO $rollback$
DECLARE r record;
BEGIN
 FOR r IN SELECT u.auth_user_id FROM public.user_profiles u
 JOIN public.driver_digital_credentials c ON c.user_id=u.auth_user_id
 WHERE u.role IN ('admin','super_admin') AND c.status='active'
 LOOP
  PERFORM axentra_private.sync_driver_digital_credential(r.auth_user_id);
 END LOOP;
END;
$rollback$;
COMMIT;
