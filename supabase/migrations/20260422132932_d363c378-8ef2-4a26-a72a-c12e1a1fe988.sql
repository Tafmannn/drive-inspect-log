-- ─────────────────────────────────────────────────────────────────────
-- Submission Session integrity model
-- ─────────────────────────────────────────────────────────────────────
-- Every call to submit_inspection() now carries a client-generated
-- submission_session_id (UUID). Rows produced by that call (the
-- inspection row + any damage_items) are stamped with that session id
-- so a follow-up rollback_inspection_submission() can target ONLY the
-- artefacts produced by that exact submission and never touch
-- historical runs / prior submissions.
--
-- Rollback semantics: archive (soft) — preserve audit trail.
--   - inspections.archived_at = now() for the just-created row
--   - damage_items.archived_at = now() for rows tagged with the session
--   - jobs.has_pickup_inspection / has_delivery_inspection rolled back
--     based on whether ANY non-archived inspection of that type still
--     exists for the job
--   - jobs.status restored to the pre-submit value captured in the
--     activity log entry written by submit_inspection
--   - explicit job_activity_log entry: 'submission_rolled_back'
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS submission_session_id uuid;

ALTER TABLE public.damage_items
  ADD COLUMN IF NOT EXISTS submission_session_id uuid;

CREATE INDEX IF NOT EXISTS idx_inspections_submission_session
  ON public.inspections (submission_session_id)
  WHERE submission_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_damage_items_submission_session
  ON public.damage_items (submission_session_id)
  WHERE submission_session_id IS NOT NULL;

-- Replace submit_inspection to accept p_submission_session_id and stamp it
-- on the inspection row + damage_items it creates. Backwards compatible:
-- if NULL is passed, behaviour is unchanged (no session tagging).
CREATE OR REPLACE FUNCTION public.submit_inspection(
  p_job_id uuid,
  p_type text,
  p_inspection jsonb,
  p_damage_items jsonb,
  p_submission_session_id uuid DEFAULT NULL
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

  -- Activity log entry — note we record the submission_session_id in the
  -- notes field as JSON so the rollback RPC can read it back to restore
  -- the prior status precisely.
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
    'submissionSessionId', p_submission_session_id
  );
END
$function$;

-- ─────────────────────────────────────────────────────────────────────
-- Compensation: roll back a submission whose client-side linkage failed
-- ─────────────────────────────────────────────────────────────────────
-- Targets ONLY the inspection + damage_items stamped with the given
-- submission_session_id. Restores the prior job status by reading the
-- matching activity_log entry written by submit_inspection. Writes an
-- explicit 'submission_rolled_back' audit entry.
--
-- Idempotent: if no rows match the session, returns a clean no-op result.
CREATE OR REPLACE FUNCTION public.rollback_inspection_submission(
  p_job_id uuid,
  p_submission_session_id uuid,
  p_reason text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_inspection record;
  v_log record;
  v_prior_status text;
  v_current_status text;
  v_archived_inspections int := 0;
  v_archived_damage int := 0;
  v_inspection_type text;
  v_other_active_count int;
  v_target_status text;
BEGIN
  IF p_submission_session_id IS NULL THEN
    RAISE EXCEPTION 'SUBMISSION_SESSION_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT org_id, status INTO v_org_id, v_current_status
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- Find the inspection row produced by this session (if any).
  SELECT id, type INTO v_inspection
    FROM public.inspections
   WHERE job_id = p_job_id
     AND submission_session_id = p_submission_session_id
     AND archived_at IS NULL
   LIMIT 1;

  v_inspection_type := v_inspection.type;

  -- Archive damage_items first (FK target preserved)
  WITH archived AS (
    UPDATE public.damage_items
       SET archived_at = now()
     WHERE submission_session_id = p_submission_session_id
       AND archived_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO v_archived_damage FROM archived;

  -- Archive the inspection row itself
  IF v_inspection.id IS NOT NULL THEN
    UPDATE public.inspections
       SET archived_at = now(), updated_at = now()
     WHERE id = v_inspection.id;
    v_archived_inspections := 1;
  END IF;

  -- Look up prior status from the activity log entry written by submit_inspection
  SELECT from_status INTO v_prior_status
    FROM public.job_activity_log
   WHERE job_id = p_job_id
     AND notes IS NOT NULL
     AND notes::jsonb->>'submission_session_id' = p_submission_session_id::text
   ORDER BY created_at DESC
   LIMIT 1;

  -- Decide whether to clear the has_*_inspection flag: only if no other
  -- active (non-archived) inspection of the same type exists for this job.
  IF v_inspection_type IS NOT NULL THEN
    SELECT count(*) INTO v_other_active_count
      FROM public.inspections
     WHERE job_id = p_job_id
       AND type = v_inspection_type
       AND archived_at IS NULL;

    IF v_inspection_type = 'pickup' THEN
      UPDATE public.jobs
         SET has_pickup_inspection = (v_other_active_count > 0),
             status = COALESCE(v_prior_status, status),
             updated_at = now()
       WHERE id = p_job_id;
    ELSE
      UPDATE public.jobs
         SET has_delivery_inspection = (v_other_active_count > 0),
             status = COALESCE(v_prior_status, status),
             updated_at = now()
       WHERE id = p_job_id;
    END IF;
  ELSIF v_prior_status IS NOT NULL THEN
    -- No inspection row matched but we still found a log entry — restore status.
    UPDATE public.jobs
       SET status = v_prior_status, updated_at = now()
     WHERE id = p_job_id;
  END IF;

  -- Audit log entry — explicit, distinct action so it is forensically obvious
  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (
    p_job_id, v_org_id, 'submission_rolled_back',
    v_current_status, COALESCE(v_prior_status, v_current_status),
    jsonb_build_object(
      'submission_session_id', p_submission_session_id,
      'archived_inspections', v_archived_inspections,
      'archived_damage_items', v_archived_damage,
      'reason', COALESCE(p_reason, 'Client-side linkage failed; submission compensated to protect evidence integrity')
    )::text
  );

  RETURN jsonb_build_object(
    'submissionSessionId', p_submission_session_id,
    'archivedInspections', v_archived_inspections,
    'archivedDamageItems', v_archived_damage,
    'restoredStatus', COALESCE(v_prior_status, v_current_status)
  );
END
$function$;

-- Allow authenticated users (with RLS-scoped access to the job) to call rollback.
-- The function does not bypass RLS; org membership / super_admin still gate the
-- inspections/damage_items/jobs UPDATE statements.
GRANT EXECUTE ON FUNCTION public.rollback_inspection_submission(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_inspection(uuid, text, jsonb, jsonb, uuid) TO authenticated;