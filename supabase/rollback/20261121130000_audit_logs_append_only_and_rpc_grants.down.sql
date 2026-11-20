-- Rollback for 20261121130000_audit_logs_append_only_and_rpc_grants.sql
-- Restores the previous (over-broad) access. Only use if the app breaks.

DROP POLICY IF EXISTS job_activity_log_select_org ON public.job_activity_log;
DROP POLICY IF EXISTS job_activity_log_insert_org ON public.job_activity_log;
DROP POLICY IF EXISTS "Org members can manage job_activity_log" ON public.job_activity_log;
CREATE POLICY "Org members can manage job_activity_log" ON public.job_activity_log
  FOR ALL USING (public.is_super_admin() OR org_id = public.user_org_id())
  WITH CHECK (public.is_super_admin() OR org_id = public.user_org_id());

DROP POLICY IF EXISTS job_deviation_log_select_org ON public.job_deviation_log;
DROP POLICY IF EXISTS job_deviation_log_insert_org ON public.job_deviation_log;
DROP POLICY IF EXISTS "Org members can manage deviation log" ON public.job_deviation_log;
CREATE POLICY "Org members can manage deviation log" ON public.job_deviation_log
  FOR ALL USING (public.is_super_admin() OR org_id = public.user_org_id())
  WITH CHECK (public.is_super_admin() OR org_id = public.user_org_id());

GRANT UPDATE, DELETE ON public.job_activity_log, public.job_deviation_log TO authenticated;

CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_org_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seq  integer;
  v_year text;
BEGIN
  IF NOT (public.is_super_admin() OR p_org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'not authorised to allocate invoice numbers for org %', p_org_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.invoice_number_counters (org_id, last_seq)
  VALUES (p_org_id, 1001)
  ON CONFLICT (org_id)
    DO UPDATE SET last_seq = public.invoice_number_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  v_year := to_char(now(), 'YY');
  RETURN 'AX' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$function$;

DO $$
BEGIN
  IF to_regprocedure('public.enqueue_customer_notification()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.enqueue_customer_notification() TO anon, authenticated;
  END IF;
END $$;
