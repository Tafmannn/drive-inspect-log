-- =====================================================================
-- Verification for 20260701100000_evidence_items_additive
-- =====================================================================
-- Read-only except the wrapped negative tests (all rolled back).

-- (A) Table exists with RLS enabled.
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'evidence_items';

-- (B) Policies: expect exactly the four org-scoped ones, authenticated-only.
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname='public' AND tablename='evidence_items' ORDER BY policyname;

-- (C) Triggers + functions (org derivation, updated_at touch) exist,
--     SECURITY DEFINER where required, search_path pinned.
SELECT p.proname, p.prosecdef, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('set_evidence_org_from_job','touch_evidence_updated_at');
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.evidence_items'::regclass AND NOT tgisinternal;

-- (D) Indexes present.
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='evidence_items' ORDER BY indexname;

-- (E) Existing photos surface untouched (count of photos policies unchanged: 4).
SELECT count(*) AS photos_policies FROM pg_policies
WHERE schemaname='public' AND tablename='photos';

-- (F) BEHAVIOUR: org is server-derived and client-supplied org is ignored.
-- Replace <ORG_A_JOB_ID> with a real job id and <ORG_B_ID> with a DIFFERENT org.
BEGIN;
  SAVEPOINT s;
    INSERT INTO public.evidence_items
      (job_id, org_id, stage, category, storage_path, captured_at)
    VALUES ('<ORG_A_JOB_ID>', '<ORG_B_ID>', 'pickup', 'front',
            'jobs/<ORG_A_JOB_ID>/pickup/front/verify.jpg', now())
    RETURNING org_id;  -- EXPECT: the JOB's org, not <ORG_B_ID>
  ROLLBACK TO SAVEPOINT s;
ROLLBACK;

-- (G) BEHAVIOUR: cross-org INSERT rejected for a normal member.
-- Replace <DRIVER_A_UID> (org A) and <ORG_B_JOB_ID> (job in org B).
BEGIN;
  SET LOCAL role authenticated;
  SET LOCAL request.jwt.claims = '{"sub":"<DRIVER_A_UID>","role":"authenticated"}';
  SAVEPOINT s;
    INSERT INTO public.evidence_items (job_id, org_id, stage, category, storage_path, captured_at)
    VALUES ('<ORG_B_JOB_ID>', null, 'pickup', 'front',
            'jobs/<ORG_B_JOB_ID>/pickup/front/x.jpg', now());
    -- EXPECT: new row violates row-level security policy
  ROLLBACK TO SAVEPOINT s;
ROLLBACK;

-- (H) BEHAVIOUR: captured_at/created_at are immutable on UPDATE.
-- (service-role session) Insert, then try to rewrite audit fields.
BEGIN;
  SAVEPOINT s;
    WITH ins AS (
      INSERT INTO public.evidence_items (job_id, stage, category, storage_path, captured_at)
      SELECT id, 'pickup', 'front', 'jobs/'||id||'/pickup/front/imm.jpg', now() - interval '1 hour'
      FROM public.jobs LIMIT 1
      RETURNING id, captured_at, created_at
    )
    UPDATE public.evidence_items e
       SET captured_at = now(), created_at = now(), review_status = 'approved'
      FROM ins WHERE e.id = ins.id
    RETURNING e.captured_at = ins.captured_at AS captured_preserved,
              e.created_at  = ins.created_at  AS created_preserved,
              e.review_status;  -- EXPECT: true, true, 'approved'
  ROLLBACK TO SAVEPOINT s;
ROLLBACK;
