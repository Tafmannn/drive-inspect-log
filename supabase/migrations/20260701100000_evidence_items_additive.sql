-- =====================================================================
-- Evidence v1 / Phase 3: additive evidence_items table (+ RLS, triggers)
-- =====================================================================
-- Core-domain evidence record for the new capture pipeline (photos today;
-- evidence_type/metadata are data-only extension points for signatures/
-- documents/videos later — no behaviour keyed on them yet).
--
-- STRICTLY ADDITIVE:
--   * No existing table, policy, trigger, or bucket is modified.
--   * No backfill — legacy public.photos remains the read source for old jobs
--     (merged at read time by the client's legacyAdapter).
--   * Storage: REUSES the existing private `vehicle-photos` bucket; new object
--     paths are `jobs/<jobId>/<stage>/<category>/<evidenceId>.jpg`, which the
--     already-live org/job-scoped storage policies cover verbatim. No storage
--     changes are required or made.
--
-- SECURITY MODEL (identical to the proven photos pattern):
--   * org_id is SERVER-AUTHORITATIVE: a BEFORE INSERT trigger derives it from
--     the owning job; any client-supplied value is overwritten.
--   * INSERT is authorized by the JOB's org (caller can insert iff the job
--     belongs to their org); SELECT/UPDATE/DELETE are org-scoped.
--   * Helpers is_super_admin()/user_org_id() read user_profiles only.
-- =====================================================================

-- ── 1) Table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.evidence_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES public.jobs(id),
  inspection_id  uuid REFERENCES public.inspections(id),
  org_id         uuid NOT NULL REFERENCES public.organisations(id),
  -- Reopen/run-isolation semantics (must mirror photos so reopened jobs never
  -- leak stale evidence into PODs).
  run_id         uuid,
  archived_at    timestamptz,

  stage          text NOT NULL CHECK (stage IN ('pickup','delivery')),
  -- Extension point: only 'photo' is written today. New kinds are new VALUES,
  -- never new tables. Deliberately no CHECK so future kinds need no DDL.
  evidence_type  text NOT NULL DEFAULT 'photo',
  category       text NOT NULL,
  damage_item_id uuid REFERENCES public.damage_items(id),

  storage_bucket text NOT NULL DEFAULT 'vehicle-photos',
  storage_path   text NOT NULL,
  thumbnail_path text,

  original_filename text,
  mime_type      text,
  file_size      integer,
  width          integer,
  height         integer,
  -- sha-256 of the stored bytes: integrity + duplicate detection + a stable
  -- key for future annotations (AI/OCR) without schema change.
  hash           text,

  -- Extension point: future attributes (capture session, device, OCR, AI)
  -- live here as data. Empty today; no behaviour branches on it.
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,

  review_status  text NOT NULL DEFAULT 'pending',

  captured_by    uuid,
  -- TRUE capture time (client clock at shutter), immutable; distinct from
  -- created_at (server insert time). The gap between them is the offline
  -- window — auditable, never rewritten.
  captured_at    timestamptz NOT NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 2) Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_evidence_items_job_stage
  ON public.evidence_items(job_id, stage);
CREATE INDEX IF NOT EXISTS idx_evidence_items_inspection
  ON public.evidence_items(inspection_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_damage_item
  ON public.evidence_items(damage_item_id);
CREATE INDEX IF NOT EXISTS idx_evidence_items_hash
  ON public.evidence_items(hash);
CREATE INDEX IF NOT EXISTS idx_evidence_items_captured_at
  ON public.evidence_items(captured_at);
CREATE INDEX IF NOT EXISTS idx_evidence_items_org
  ON public.evidence_items(org_id);

-- ── 3) Server-authoritative org (mirror of set_photo_org_from_job) ───
CREATE OR REPLACE FUNCTION public.set_evidence_org_from_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ignore any client-supplied org; the job is the source of truth.
  SELECT j.org_id INTO NEW.org_id FROM public.jobs j WHERE j.id = NEW.job_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'EVIDENCE_JOB_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evidence_set_org ON public.evidence_items;
CREATE TRIGGER trg_evidence_set_org
  BEFORE INSERT ON public.evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.set_evidence_org_from_job();

-- ── 4) updated_at maintenance (pinned search_path; immutables untouched) ─
CREATE OR REPLACE FUNCTION public.touch_evidence_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  -- Immutable audit fields: never rewritable after insert.
  NEW.created_at  := OLD.created_at;
  NEW.captured_at := OLD.captured_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evidence_touch_updated ON public.evidence_items;
CREATE TRIGGER trg_evidence_touch_updated
  BEFORE UPDATE ON public.evidence_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_evidence_updated_at();

-- ── 5) RLS (deny-by-default; verbatim copy of the photos model) ──────
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evidence_items_select_org" ON public.evidence_items;
CREATE POLICY "evidence_items_select_org"
ON public.evidence_items FOR SELECT TO authenticated
USING (public.is_super_admin() OR org_id = public.user_org_id());

-- Insert authorized by the JOB's org (a caller may insert iff they can access
-- the job); the trigger then stamps the authoritative org.
DROP POLICY IF EXISTS "evidence_items_insert_job_org" ON public.evidence_items;
CREATE POLICY "evidence_items_insert_job_org"
ON public.evidence_items FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_id AND j.org_id = public.user_org_id()
  )
);

DROP POLICY IF EXISTS "evidence_items_update_org" ON public.evidence_items;
CREATE POLICY "evidence_items_update_org"
ON public.evidence_items FOR UPDATE TO authenticated
USING (public.is_super_admin() OR org_id = public.user_org_id())
WITH CHECK (public.is_super_admin() OR org_id = public.user_org_id());

DROP POLICY IF EXISTS "evidence_items_delete_org" ON public.evidence_items;
CREATE POLICY "evidence_items_delete_org"
ON public.evidence_items FOR DELETE TO authenticated
USING (public.is_super_admin() OR org_id = public.user_org_id());
