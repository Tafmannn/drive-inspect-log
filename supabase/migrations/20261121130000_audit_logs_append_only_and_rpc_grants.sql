-- Hardening found in the 20 Nov 2026 production audit.
--
-- 1. job_activity_log / job_deviation_log were "FOR ALL" to every org member,
--    so a driver could edit or delete the audit trail for their org's jobs
--    (status history, deviation reasons). The app only ever SELECTs and
--    INSERTs these rows; SECURITY DEFINER RPCs (submit_inspection etc.) and
--    edge functions write as owner/service role and are unaffected.
--    Now append-only from the client: read + insert within your own org,
--    no update/delete for anyone but the service role.
--
-- 2. allocate_invoice_number() let ANY org member (drivers included) burn
--    invoice numbers. Invoices are created by admins only; align it with
--    allocate_credit_note_number().
--
-- 3. enqueue_customer_notification() is a trigger function. It cannot be
--    called usefully over RPC, but it should not be in the anon/authenticated
--    API surface at all. Triggers don't need the invoking role to hold EXECUTE.
--
-- Idempotent (applied to staging and prod by hand on 20 Nov 2026 before it
-- had a version; re-running is a no-op).
-- Rollback: supabase/rollback/20261121130000_audit_logs_append_only_and_rpc_grants.down.sql

-- ── 1. append-only audit logs ─────────────────────────────────────────
DROP POLICY IF EXISTS "Org members can manage job_activity_log" ON public.job_activity_log;
DROP POLICY IF EXISTS job_activity_log_select_org ON public.job_activity_log;
CREATE POLICY job_activity_log_select_org ON public.job_activity_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR org_id = public.user_org_id());
DROP POLICY IF EXISTS job_activity_log_insert_org ON public.job_activity_log;
CREATE POLICY job_activity_log_insert_org ON public.job_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR org_id = public.user_org_id());

DROP POLICY IF EXISTS "Org members can manage deviation log" ON public.job_deviation_log;
DROP POLICY IF EXISTS job_deviation_log_select_org ON public.job_deviation_log;
CREATE POLICY job_deviation_log_select_org ON public.job_deviation_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR org_id = public.user_org_id());
DROP POLICY IF EXISTS job_deviation_log_insert_org ON public.job_deviation_log;
CREATE POLICY job_deviation_log_insert_org ON public.job_deviation_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR org_id = public.user_org_id());

REVOKE UPDATE, DELETE, TRUNCATE ON public.job_activity_log FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.job_deviation_log FROM anon, authenticated;
REVOKE ALL ON public.job_activity_log FROM anon;
REVOKE ALL ON public.job_deviation_log FROM anon;

-- ── 2. invoice numbers: admins only ───────────────────────────────────
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
  IF NOT (public.is_super_admin()
          OR (p_org_id = public.user_org_id() AND public.is_admin_or_super_admin())) THEN
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
REVOKE EXECUTE ON FUNCTION public.allocate_invoice_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(uuid) TO authenticated;

-- ── 3. trigger function out of the RPC surface ────────────────────────
-- Guarded: the function only exists once 20261113184311 has run.
DO $$
BEGIN
  IF to_regprocedure('public.enqueue_customer_notification()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.enqueue_customer_notification() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
