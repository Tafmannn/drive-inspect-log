-- Make submit_inspection idempotent on submission_session_id so an
-- offline submit queue can safely replay the RPC after a network drop
-- without ever creating a duplicate inspection.
--
-- 1. Unique partial index on the session id (active rows only).
-- 2. RPC short-circuits when a non-archived inspection already carries
--    the supplied session id and returns its ids — no second row, no
--    second status flip, no duplicate activity-log entry.

CREATE UNIQUE INDEX IF NOT EXISTS uq_inspections_active_submission_session
  ON public.inspections (submission_session_id)
  WHERE submission_session_id IS NOT NULL AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.submit_inspection(
  p_job_id uuid,
  p_type text,
  p_inspection jsonb,
  p_damage_items jsonb,
  p_submission_session_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
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
  v_idempotent_id uuid;
  v_idempotent_damage_ids uuid[];
  v_blocking_statuses text[] := ARRAY[
    'pickup_complete','in_transit','delivery_in_progress',
    'delivery_complete','pod_ready','completed'
  ];
BEGIN
  IF p_type NOT IN ('pickup','delivery') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  -- ── Idempotency short-circuit ──────────────────────────────────
  -- If a non-archived inspection already exists with this submission
  -- session id, this is a queue replay (network dropped after the RPC
  -- committed but before the response reached the client). Return the
  -- previous result verbatim — no new writes.
  IF p_submission_session_id IS NOT NULL THEN
    SELECT id INTO v_idempotent_id
      FROM public.inspections
     WHERE submission_session_id = p_submission_session_id
       AND archived_at IS NULL
     LIMIT 1;

    IF v_idempotent_id IS NOT NULL THEN
      SELECT COALESCE(array_agg(id ORDER BY created_at), ARRAY[]::uuid[])
        INTO v_idempotent_damage_ids
        FROM public.damage_items
       WHERE inspection_id = v_idempotent_id
         AND archived_at IS NULL;

      RETURN jsonb_build_object(
        'inspectionId', v_idempotent_id,
        'damageItemIds', to_jsonb(COALESCE(v_idempotent_damage_ids, ARRAY[]::uuid[])),
        'submissionSessionId', p_submission_session_id,
        'idempotentReplay', true
      );
    END IF;
  END IF;

  SELECT org_id, status, has_pickup_inspection, current_run_id
    INTO v_org_id, v_current_status, v_has_pickup, v_run_id
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

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
           submission_session_id = COALESCE(p_submission_session_id, submission_session_id),
           updated_at         = now()
     WHERE id = v_existing_id
     RETURNING id INTO v_inspection_id;
  ELSE
    INSERT INTO public.inspections (
      job_id, type, org_id, run_id, inspected_at, has_damage, archived_at, submission_session_id,
      aerial, alloys_damaged, alloys_or_trims, customer_name, customer_paperwork,
      customer_signature_url, driver_signature_url, ev_charging_cables,
      fuel_level_percent, handbook, inspected_by_name, light_condition,
      locking_wheel_nut, mot, notes, number_of_keys, odometer,
      oil_level_status, parcel_shelf, sat_nav_working, service_book,
      spare_wheel_status, tool_kit, tyre_inflation_kit, v5,
      vehicle_condition, water_level_status, wheel_trims_damaged
    ) VALUES (
      p_job_id, p_type, v_org_id, v_run_id, now(),
      (jsonb_array_length(COALESCE(p_damage_items,'[]'::jsonb)) > 0), NULL, p_submission_session_id,
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
        inspection_id, org_id, run_id, submission_session_id,
        x, y, area, location, item, damage_types, notes, photo_url
      ) VALUES (
        v_inspection_id, v_org_id, v_run_id, p_submission_session_id,
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

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (
    p_job_id, v_org_id, p_type || '_inspection_submitted',
    v_current_status, v_to_status,
    CASE WHEN p_submission_session_id IS NOT NULL
         THEN jsonb_build_object('submission_session_id', p_submission_session_id)::text
         ELSE NULL END
  );

  RETURN jsonb_build_object(
    'inspectionId', v_inspection_id,
    'damageItemIds', to_jsonb(v_damage_ids),
    'fromStatus', v_current_status,
    'toStatus', v_to_status,
    'runId', v_run_id,
    'submissionSessionId', p_submission_session_id,
    'idempotentReplay', false
  );
END
$function$;