-- ─────────────────────────────────────────────────────────────────────
-- Lifecycle integrity: active-only inspection uniqueness, completed_at
-- semantics, validated server-side completion, and stale-evidence guard.
-- Migration is safe on real data: it deterministically resolves any
-- existing duplicate active inspections by keeping the newest and
-- soft-archiving older duplicates, then enforces the rule going forward.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1) Resolve any duplicate active inspections deterministically ────
-- "Active" = archived_at IS NULL. Keep the most recently inspected
-- (or most recently created) row per (job_id, type); soft-archive the
-- rest. Their associated damage_items are also soft-archived so they
-- don't leak into POD/active reads. Photos are job-scoped, not
-- inspection-scoped, so we leave them; their own archive flag is
-- managed by the reopen flow.
WITH ranked AS (
  SELECT
    id,
    job_id,
    type,
    ROW_NUMBER() OVER (
      PARTITION BY job_id, type
      ORDER BY COALESCE(inspected_at, created_at) DESC, id DESC
    ) AS rn
  FROM public.inspections
  WHERE archived_at IS NULL
),
losers AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE public.inspections i
SET archived_at = now()
FROM losers l
WHERE i.id = l.id;

UPDATE public.damage_items d
SET archived_at = now()
WHERE d.archived_at IS NULL
  AND d.inspection_id IN (
    SELECT id FROM public.inspections WHERE archived_at IS NOT NULL
  );

-- ── 2) Drop any prior unsafe constraints/indexes on (job_id, type) ───
-- We deliberately do NOT use UNIQUE(job_id, type, archived_at): NULL
-- semantics in Postgres allow multiple rows where archived_at IS NULL,
-- which is exactly the failure mode we are trying to prevent.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.inspections'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.inspections DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.inspections_job_type_unique;
DROP INDEX IF EXISTS public.inspections_job_type_archived_unique;
DROP INDEX IF EXISTS public.uq_inspections_active;

-- ── 3) Correct active-only uniqueness via partial unique index ───────
-- Postgres treats partial unique indexes as a true uniqueness rule
-- only across rows matching the predicate. archived_at IS NULL →
-- exactly one active inspection per (job_id, type) is permitted; any
-- number of archived rows are allowed for full audit history.
CREATE UNIQUE INDEX uq_inspections_active_per_job_type
  ON public.inspections (job_id, type)
  WHERE archived_at IS NULL;

-- Helper indexes for the active-read filters now used everywhere
CREATE INDEX IF NOT EXISTS idx_inspections_active_job
  ON public.inspections (job_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_active_job
  ON public.photos (job_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_damage_items_active_inspection
  ON public.damage_items (inspection_id) WHERE archived_at IS NULL;

-- ── 4) Fix submit_inspection to use the active-only conflict target ──
-- The previous version did a manual SELECT + UPDATE/INSERT branch; we
-- keep that shape because the partial unique index gives us atomic
-- safety (concurrent inserts will fail with 23505 on the loser),
-- and the SELECT FOR UPDATE on jobs serializes per-job submission.
-- We also explicitly set archived_at = NULL on insert/update to make
-- the active row obvious.
CREATE OR REPLACE FUNCTION public.submit_inspection(
  p_job_id uuid,
  p_type text,
  p_inspection jsonb,
  p_damage_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id uuid;
  v_run_id uuid;
  v_existing_id uuid;
  v_existing_inspected_at timestamptz;
  v_current_status text;
  v_has_pickup boolean;
  v_inspection_id uuid;
  v_to_status text;
  v_damage_ids uuid[] := ARRAY[]::uuid[];
  v_item jsonb;
  v_new_id uuid;
  v_blocking_statuses text[] := ARRAY[
    'pickup_complete','in_transit','delivery_in_progress',
    'delivery_complete','pod_ready','completed'
  ];
BEGIN
  IF p_type NOT IN ('pickup','delivery') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  -- Serializing on the parent job prevents two drivers from writing
  -- the same (job_id, type) active row at once.
  SELECT org_id, status, has_pickup_inspection, current_run_id
    INTO v_org_id, v_current_status, v_has_pickup, v_run_id
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- Active row only (matches uq_inspections_active_per_job_type)
  SELECT id, inspected_at INTO v_existing_id, v_existing_inspected_at
    FROM public.inspections
   WHERE job_id = p_job_id AND type = p_type AND archived_at IS NULL
   LIMIT 1;

  IF v_existing_inspected_at IS NOT NULL
     AND v_current_status = ANY(v_blocking_statuses) THEN
    RAISE EXCEPTION 'INSPECTION_ALREADY_SUBMITTED'
      USING ERRCODE = '23514',
            HINT = 'Cannot overwrite a completed inspection while job is in ' || v_current_status;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.inspections
       SET aerial             = COALESCE((p_inspection->>'aerial'), aerial),
           alloys_damaged     = COALESCE((p_inspection->>'alloys_damaged'), alloys_damaged),
           alloys_or_trims    = COALESCE((p_inspection->>'alloys_or_trims'), alloys_or_trims),
           customer_name      = COALESCE((p_inspection->>'customer_name'), customer_name),
           customer_paperwork = COALESCE((p_inspection->>'customer_paperwork'), customer_paperwork),
           customer_signature_url = COALESCE((p_inspection->>'customer_signature_url'), customer_signature_url),
           driver_signature_url   = COALESCE((p_inspection->>'driver_signature_url'), driver_signature_url),
           ev_charging_cables = COALESCE((p_inspection->>'ev_charging_cables'), ev_charging_cables),
           fuel_level_percent = COALESCE((p_inspection->>'fuel_level_percent')::int, fuel_level_percent),
           handbook           = COALESCE((p_inspection->>'handbook'), handbook),
           inspected_by_name  = COALESCE((p_inspection->>'inspected_by_name'), inspected_by_name),
           light_condition    = COALESCE((p_inspection->>'light_condition'), light_condition),
           locking_wheel_nut  = COALESCE((p_inspection->>'locking_wheel_nut'), locking_wheel_nut),
           mot                = COALESCE((p_inspection->>'mot'), mot),
           notes              = COALESCE((p_inspection->>'notes'), notes),
           number_of_keys     = COALESCE((p_inspection->>'number_of_keys'), number_of_keys),
           odometer           = COALESCE((p_inspection->>'odometer')::int, odometer),
           oil_level_status   = COALESCE((p_inspection->>'oil_level_status'), oil_level_status),
           parcel_shelf       = COALESCE((p_inspection->>'parcel_shelf'), parcel_shelf),
           sat_nav_working    = COALESCE((p_inspection->>'sat_nav_working'), sat_nav_working),
           service_book       = COALESCE((p_inspection->>'service_book'), service_book),
           spare_wheel_status = COALESCE((p_inspection->>'spare_wheel_status'), spare_wheel_status),
           tool_kit           = COALESCE((p_inspection->>'tool_kit'), tool_kit),
           tyre_inflation_kit = COALESCE((p_inspection->>'tyre_inflation_kit'), tyre_inflation_kit),
           v5                 = COALESCE((p_inspection->>'v5'), v5),
           vehicle_condition  = COALESCE((p_inspection->>'vehicle_condition'), vehicle_condition),
           water_level_status = COALESCE((p_inspection->>'water_level_status'), water_level_status),
           wheel_trims_damaged= COALESCE((p_inspection->>'wheel_trims_damaged'), wheel_trims_damaged),
           inspected_at       = now(),
           has_damage         = (jsonb_array_length(COALESCE(p_damage_items,'[]'::jsonb)) > 0),
           run_id             = COALESCE(run_id, v_run_id),
           archived_at        = NULL,
           updated_at         = now()
     WHERE id = v_existing_id
     RETURNING id INTO v_inspection_id;
  ELSE
    INSERT INTO public.inspections (
      job_id, type, org_id, run_id, inspected_at, has_damage, archived_at,
      aerial, alloys_damaged, alloys_or_trims, customer_name, customer_paperwork,
      customer_signature_url, driver_signature_url, ev_charging_cables,
      fuel_level_percent, handbook, inspected_by_name, light_condition,
      locking_wheel_nut, mot, notes, number_of_keys, odometer,
      oil_level_status, parcel_shelf, sat_nav_working, service_book,
      spare_wheel_status, tool_kit, tyre_inflation_kit, v5,
      vehicle_condition, water_level_status, wheel_trims_damaged
    ) VALUES (
      p_job_id, p_type, v_org_id, v_run_id, now(),
      (jsonb_array_length(COALESCE(p_damage_items,'[]'::jsonb)) > 0), NULL,
      p_inspection->>'aerial', p_inspection->>'alloys_damaged', p_inspection->>'alloys_or_trims',
      p_inspection->>'customer_name', p_inspection->>'customer_paperwork',
      p_inspection->>'customer_signature_url', p_inspection->>'driver_signature_url',
      p_inspection->>'ev_charging_cables',
      (p_inspection->>'fuel_level_percent')::int, p_inspection->>'handbook',
      p_inspection->>'inspected_by_name', p_inspection->>'light_condition',
      p_inspection->>'locking_wheel_nut', p_inspection->>'mot', p_inspection->>'notes',
      p_inspection->>'number_of_keys', (p_inspection->>'odometer')::int,
      p_inspection->>'oil_level_status', p_inspection->>'parcel_shelf',
      p_inspection->>'sat_nav_working', p_inspection->>'service_book',
      p_inspection->>'spare_wheel_status', p_inspection->>'tool_kit',
      p_inspection->>'tyre_inflation_kit', p_inspection->>'v5',
      p_inspection->>'vehicle_condition', p_inspection->>'water_level_status',
      p_inspection->>'wheel_trims_damaged'
    )
    RETURNING id INTO v_inspection_id;
  END IF;

  IF v_existing_id IS NOT NULL OR jsonb_array_length(COALESCE(p_damage_items,'[]'::jsonb)) > 0 THEN
    UPDATE public.damage_items
       SET archived_at = now()
     WHERE inspection_id = v_inspection_id AND archived_at IS NULL;
  END IF;

  IF jsonb_array_length(COALESCE(p_damage_items,'[]'::jsonb)) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_damage_items) LOOP
      INSERT INTO public.damage_items (
        inspection_id, org_id, run_id,
        x, y, area, location, item, damage_types, notes, photo_url
      ) VALUES (
        v_inspection_id, v_org_id, v_run_id,
        (v_item->>'x')::numeric, (v_item->>'y')::numeric,
        v_item->>'area', v_item->>'location', v_item->>'item',
        CASE WHEN v_item ? 'damage_types'
             THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'damage_types'))
             ELSE NULL END,
        v_item->>'notes', v_item->>'photo_url'
      ) RETURNING id INTO v_new_id;
      v_damage_ids := v_damage_ids || v_new_id;
    END LOOP;
  END IF;

  IF p_type = 'pickup' THEN
    v_to_status := 'pickup_complete';
    UPDATE public.jobs
       SET has_pickup_inspection = true, status = v_to_status, updated_at = now()
     WHERE id = p_job_id;
  ELSE
    v_to_status := CASE WHEN v_has_pickup THEN 'pod_ready' ELSE 'delivery_complete' END;
    UPDATE public.jobs
       SET has_delivery_inspection = true, status = v_to_status, updated_at = now()
     WHERE id = p_job_id;
  END IF;

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status)
  VALUES (p_job_id, v_org_id, p_type || '_inspection_submitted', v_current_status, v_to_status);

  RETURN jsonb_build_object(
    'inspectionId', v_inspection_id,
    'damageItemIds', to_jsonb(v_damage_ids),
    'fromStatus', v_current_status,
    'toStatus', v_to_status,
    'runId', v_run_id
  );
END
$$;

-- ── 5) complete_job RPC: validated terminal completion path ──────────
-- Single authoritative server-side route to mark a job COMPLETED. Used
-- by POD review surfaces in place of direct status updates. Validates
-- transition, sets completed_at exactly once, writes activity log.
CREATE OR REPLACE FUNCTION public.complete_job(
  p_job_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS public.jobs
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.jobs;
  v_allowed text[] := ARRAY['pod_ready','delivery_complete'];
BEGIN
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- Idempotent: if already completed, return as-is.
  IF v_job.status = 'completed' THEN
    RETURN v_job;
  END IF;

  IF NOT (v_job.status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'INVALID_COMPLETION_TRANSITION'
      USING ERRCODE = '23514',
            HINT = 'Cannot complete a job from status ' || v_job.status;
  END IF;

  UPDATE public.jobs
     SET status = 'completed',
         completed_at = COALESCE(completed_at, now()),
         updated_at = now()
   WHERE id = p_job_id
   RETURNING * INTO v_job;

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (
    p_job_id,
    v_job.org_id,
    'job_completed',
    NULLIF(v_job.status, 'completed'),  -- defensive
    'completed',
    COALESCE(p_notes, 'Job marked complete after POD review')
  );

  RETURN v_job;
END
$$;

-- ── 6) Backfill: clear stray completed_at where status != completed ──
-- pod_ready / delivery_complete are review states, not completion.
-- Keep existing completed_at values for true completed jobs intact.
UPDATE public.jobs
   SET completed_at = NULL
 WHERE status <> 'completed'
   AND completed_at IS NOT NULL;

-- ── 7) Trigger to keep completed_at semantics correct going forward ──
-- - Setting status -> completed without completed_at: stamp it
-- - Changing status away from completed: clear completed_at
-- - Anything else: leave as supplied
CREATE OR REPLACE FUNCTION public.enforce_completed_at_semantics()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  IF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_jobs_completed_at_semantics ON public.jobs;
CREATE TRIGGER trg_jobs_completed_at_semantics
  BEFORE INSERT OR UPDATE OF status, completed_at ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_completed_at_semantics();

-- ── 8) Reopen helper readers can use to detect stale queued uploads ──
-- Lets the client retry worker quickly check the current run for a job
-- without pulling the whole row.
CREATE OR REPLACE FUNCTION public.job_current_run_id(p_job_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT current_run_id FROM public.jobs WHERE id = p_job_id
$$;
