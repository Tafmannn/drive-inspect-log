-- =====================================================================
-- Verification for 20260630100200_phase1_qr_handover_security_definer_rpcs
-- =====================================================================

-- (A) Functions exist, are SECURITY DEFINER, and have a pinned search_path.
SELECT p.proname, p.prosecdef AS security_definer, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('qr_lookup', 'qr_confirm');

-- (B) anon has EXECUTE on both (expect two rows each granting to 'anon').
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('qr_lookup', 'qr_confirm')
  AND grantee IN ('anon', 'authenticated')
ORDER BY routine_name, grantee;

-- (C) No permissive anon policy remains on the table (expect 0 rows).
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'qr_confirmations';

-- (D) Behaviour as the ANON role (create a fixture token first as service role):
--   INSERT INTO public.qr_confirmations (job_id, event_type) VALUES ('<JOB_ID>','collection')
--   RETURNING token;   -- use <TOKEN> below
BEGIN;
  SET LOCAL role anon;
  -- D1. Direct table read is denied (expect 0 rows / permission error).
  SELECT count(*) AS anon_direct_rows FROM public.qr_confirmations;
  -- D2. Lookup by token works and returns only display fields (expect 'ready').
  SELECT public.qr_lookup('<TOKEN>');
  -- D3. Bad token → not_found.
  SELECT public.qr_lookup('deadbeef');
ROLLBACK;

-- (E) Confirm is idempotent / cannot overwrite (run as anon).
BEGIN;
  SET LOCAL role anon;
  SELECT public.qr_confirm('<TOKEN>', 'Jane Customer', 'left at reception'); -- expect done
  SELECT public.qr_confirm('<TOKEN>', 'Attacker', 'tamper');                -- expect invalid
ROLLBACK;
