-- =====================================================================
-- client_logs: server-side stamping of user_id and context.org_id
-- =====================================================================
-- The Attention Center's log-derived notifications (upload failures,
-- signature failures) are RLS-gated for org admins on
-- (context->>'org_id')::uuid = user_org_id(). The client logger resolves
-- org_id from the auth session at write time, which races during error
-- storms/startup — live data shows 107 rows with BOTH user_id and org_id
-- null, all invisible to org admins (super admins see everything).
--
-- Fix at the source: a BEFORE INSERT trigger stamps user_id from
-- auth.uid() and context.org_id from the caller's user_profiles row
-- whenever the client failed to supply them. Genuinely anonymous writes
-- (no session at all) stay null — they cannot be attributed to an org.
--
-- SECURITY INVOKER is sufficient: the self-read of user_profiles is
-- permitted by user_profiles_select_self_admin_super for the inserting
-- authenticated role; anon callers skip the lookup entirely.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.stamp_client_log_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_org uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL THEN
    NEW.user_id := v_uid::text;
  END IF;

  IF (NEW.context->>'org_id') IS NULL THEN
    SELECT org_id INTO v_org
    FROM public.user_profiles
    WHERE auth_user_id = v_uid;

    IF v_org IS NOT NULL THEN
      NEW.context := jsonb_set(
        COALESCE(NEW.context, '{}'::jsonb),
        '{org_id}',
        to_jsonb(v_org::text)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_client_log_identity ON public.client_logs;
CREATE TRIGGER stamp_client_log_identity
  BEFORE INSERT ON public.client_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.stamp_client_log_identity();
