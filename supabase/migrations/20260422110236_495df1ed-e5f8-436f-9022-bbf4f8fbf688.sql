
-- ─── 1. Add run/archive columns ──────────────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS current_run_id uuid;

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS run_id uuid;

ALTER TABLE public.damage_items
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS run_id uuid;

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS run_id uuid;

-- ─── 2. Backfill: every job + its existing evidence get one shared run id ──
DO $backfill$
DECLARE
  j record;
  new_run uuid;
BEGIN
  FOR j IN SELECT id FROM public.jobs WHERE current_run_id IS NULL LOOP
    new_run := gen_random_uuid();
    UPDATE public.jobs SET current_run_id = new_run WHERE id = j.id;
    UPDATE public.inspections SET run_id = new_run WHERE job_id = j.id AND run_id IS NULL;
    UPDATE public.damage_items
      SET run_id = new_run
      WHERE run_id IS NULL
        AND inspection_id IN (SELECT id FROM public.inspections WHERE job_id = j.id);
    UPDATE public.photos SET run_id = new_run WHERE job_id = j.id AND run_id IS NULL;
  END LOOP;
END
$backfill$;

-- New jobs default to a fresh run id
ALTER TABLE public.jobs
  ALTER COLUMN current_run_id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN current_run_id SET NOT NULL;

-- ─── 3. Indexes for active-run filtering ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_inspections_active
  ON public.inspections (job_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_damage_items_active
  ON public.damage_items (inspection_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_active
  ON public.photos (job_id) WHERE archived_at IS NULL;

-- ─── 4. Atomic inspection submission ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_inspection(
  p_job_id uuid,
  p_type text,
  p_inspection jsonb,
  p_damage_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
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

  SELECT org_id, status, has_pickup_inspection, current_run_id
    INTO v_org_id, v_current_status, v_has_pickup, v_run_id
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- Look up active (non-archived) inspection of this type
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

  -- Upsert inspection
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
           updated_at         = now()
     WHERE id = v_existing_id
     RETURNING id INTO v_inspection_id;
  ELSE
    INSERT INTO public.inspections (
      job_id, type, org_id, run_id, inspected_at, has_damage,
      aerial, alloys_damaged, alloys_or_trims, customer_name, customer_paperwork,
      customer_signature_url, driver_signature_url, ev_charging_cables,
      fuel_level_percent, handbook, inspected_by_name, light_condition,
      locking_wheel_nut, mot, notes, number_of_keys, odometer,
      oil_level_status, parcel_shelf, sat_nav_working, service_book,
      spare_wheel_status, tool_kit, tyre_inflation_kit, v5,
      vehicle_condition, water_level_status, wheel_trims_damaged
    ) VALUES (
      p_job_id, p_type, v_org_id, v_run_id, now(),
      (jsonb_array_length(COALESCE(p_damage_items,'[]'::jsonb)) > 0),
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

  -- Replace damage items only if we had any before, or are inserting new ones.
  -- Soft-archive prior items (preserves audit) instead of hard delete.
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

  -- Compute next status (mirrors nextStatusForInspection)
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

  -- Activity log
  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status)
  VALUES (p_job_id, v_org_id, p_type || '_inspection_submitted', v_current_status, v_to_status);

  RETURN jsonb_build_object(
    'inspectionId', v_inspection_id,
    'damageItemIds', to_jsonb(v_damage_ids),
    'fromStatus', v_current_status,
    'toStatus', v_to_status
  );
END
$func$;

GRANT EXECUTE ON FUNCTION public.submit_inspection(uuid, text, jsonb, jsonb) TO authenticated;

-- ─── 5. Reopen job: soft-archive evidence + new run ──────────────────
CREATE OR REPLACE FUNCTION public.reopen_job(
  p_job_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $func$
DECLARE
  v_org_id uuid;
  v_from_status text;
  v_new_run uuid := gen_random_uuid();
BEGIN
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
$func$;

GRANT EXECUTE ON FUNCTION public.reopen_job(uuid, text) TO authenticated;
