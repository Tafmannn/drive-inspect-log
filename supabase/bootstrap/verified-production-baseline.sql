-- [02] axentra_private
CREATE SCHEMA IF NOT EXISTS axentra_private;
-- [02] extensions
CREATE SCHEMA IF NOT EXISTS extensions;
-- [02] public
CREATE SCHEMA IF NOT EXISTS public;
-- [03] btree_gist
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
-- [03] pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- [03] uuid-ossp
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
-- [05] job_number_seq
CREATE SEQUENCE public.job_number_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
-- [06] public.admin_audit_log
CREATE TABLE public.admin_audit_log (id uuid NOT NULL, performed_by uuid NOT NULL, performed_by_email text NOT NULL, action text NOT NULL, target_user_id uuid, target_org_id uuid, before_state jsonb, after_state jsonb, ip_address text, created_at timestamp with time zone NOT NULL);
-- [06] public.app_settings
CREATE TABLE public.app_settings (key text NOT NULL, value jsonb NOT NULL, updated_at timestamp with time zone NOT NULL);
-- [06] public.attention_acknowledgements
CREATE TABLE public.attention_acknowledgements (id uuid NOT NULL, exception_id text NOT NULL, job_id uuid, acknowledged_by uuid NOT NULL, note text, snoozed_until timestamp with time zone, created_at timestamp with time zone NOT NULL);
-- [06] public.client_logs
CREATE TABLE public.client_logs (id uuid NOT NULL, created_at timestamp with time zone NOT NULL, user_id text, job_id text, severity text NOT NULL, event text NOT NULL, message text, context jsonb);
-- [06] public.client_rate_cards
CREATE TABLE public.client_rate_cards (client_id uuid NOT NULL, org_id uuid NOT NULL, rate_per_mile numeric, minimum_charge numeric, agreed_price numeric, waiting_rate_per_hour numeric, rate_card_active boolean NOT NULL, rate_card_notes text, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL, created_by uuid, updated_by uuid);
-- [06] public.clients
CREATE TABLE public.clients (id uuid NOT NULL, org_id uuid NOT NULL, name text NOT NULL, company text, email text, phone text, address text, notes text, is_active boolean NOT NULL, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL, trading_name text, company_number text, vat_number text, billing_email text, main_phone text, website text, client_type text, account_status text NOT NULL, contact_name text, contact_email text, contact_mobile text, billing_address text, payment_terms text, rate_type text, rate_value numeric, minimum_charge numeric, credit_limit numeric, opening_hours text, handover_requirements text, signature_required boolean NOT NULL, status_emails_enabled boolean NOT NULL, po_required boolean NOT NULL, fuel_policy text NOT NULL);
-- [06] public.compliance_checks
CREATE TABLE public.compliance_checks (id uuid NOT NULL, org_id uuid NOT NULL, related_type text NOT NULL, related_id uuid NOT NULL, check_type text NOT NULL, status text NOT NULL, due_date date, notes text, reviewed_by uuid, reviewed_at timestamp with time zone, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL);
-- [06] public.customer_notifications
CREATE TABLE public.customer_notifications (id uuid NOT NULL, org_id uuid NOT NULL, job_id uuid NOT NULL, client_id uuid NOT NULL, event text NOT NULL, status text NOT NULL, attempts integer NOT NULL, recipients text[] NOT NULL, provider_ids text[] NOT NULL, skip_reason text, last_error text, created_at timestamp with time zone NOT NULL, claimed_at timestamp with time zone, sent_at timestamp with time zone);
-- [06] public.damage_items
CREATE TABLE public.damage_items (id uuid NOT NULL, inspection_id uuid NOT NULL, x numeric, y numeric, area text, location text, item text, damage_types text[], notes text, photo_url text, created_at timestamp with time zone NOT NULL, org_id uuid NOT NULL, archived_at timestamp with time zone, run_id uuid, submission_session_id uuid, submission_index integer, panel_id text, view_id text, body_type text, diagram_version text, severity text, panel_position jsonb);
-- [06] public.driver_digital_credential_events
CREATE TABLE public.driver_digital_credential_events (id bigint GENERATED ALWAYS AS IDENTITY NOT NULL, credential_id uuid NOT NULL, actor_user_id uuid, event_type text NOT NULL, credential_version integer NOT NULL, details jsonb NOT NULL, created_at timestamp with time zone NOT NULL);
-- [06] public.driver_digital_credentials
CREATE TABLE public.driver_digital_credentials (id uuid NOT NULL, user_id uuid NOT NULL, org_id uuid, serial_number bigint GENERATED ALWAYS AS IDENTITY NOT NULL, holder_name text NOT NULL, credential_version integer NOT NULL, status text NOT NULL, photo_path text, issued_at timestamp with time zone NOT NULL, revoked_at timestamp with time zone, updated_at timestamp with time zone NOT NULL);
-- [06] public.driver_onboarding
CREATE TABLE public.driver_onboarding (id uuid NOT NULL, org_id uuid NOT NULL, linked_user_id uuid, full_name text NOT NULL, display_name text, phone text, email text, employment_type text, trade_plate_number text, licence_expiry date, notes text, status text NOT NULL, reviewed_by uuid, reviewed_at timestamp with time zone, review_notes text, headshot_url text, licence_front_url text, licence_back_url text, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL);
-- [06] public.driver_profiles
CREATE TABLE public.driver_profiles (id uuid NOT NULL, user_id uuid NOT NULL, org_id uuid NOT NULL, full_name text NOT NULL, display_name text, phone text, emergency_contact_name text, emergency_contact_phone text, date_of_birth date, address_line1 text, address_line2 text, city text, postcode text, licence_number text, licence_expiry date, licence_categories text[], trade_plate_number text, employment_type text, start_date date, notes text, is_active boolean NOT NULL, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL, archived_at timestamp with time zone, archived_by uuid, archive_reason text, restored_at timestamp with time zone, restored_by uuid, restore_note text, home_postcode text, date_joined date, max_daily_distance integer, preferred_regions text[], unavailable_regions text[], manual_capable boolean NOT NULL, automatic_capable boolean NOT NULL, ev_capable boolean NOT NULL, prestige_approved boolean NOT NULL, availability_notes text, payout_terms text, endorsements text, right_to_work text, bank_captured boolean NOT NULL, pay_rate numeric, pay_basis text);
-- [06] public.evidence_items
CREATE TABLE public.evidence_items (id uuid NOT NULL, job_id uuid NOT NULL, inspection_id uuid, org_id uuid NOT NULL, run_id uuid, archived_at timestamp with time zone, stage text NOT NULL, evidence_type text NOT NULL, category text NOT NULL, damage_item_id uuid, storage_bucket text NOT NULL, storage_path text NOT NULL, thumbnail_path text, original_filename text, mime_type text, file_size integer, width integer, height integer, hash text, metadata jsonb NOT NULL, review_status text NOT NULL, captured_by uuid, captured_at timestamp with time zone NOT NULL, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL);
-- [06] public.expense_receipts
CREATE TABLE public.expense_receipts (id uuid NOT NULL, expense_id uuid NOT NULL, url text NOT NULL, thumbnail_url text, backend text NOT NULL, backend_ref text, created_at timestamp with time zone NOT NULL);
-- [06] public.expenses
CREATE TABLE public.expenses (id uuid NOT NULL, job_id uuid NOT NULL, driver_id text, date date NOT NULL, "time" time without time zone, amount numeric(10,2) NOT NULL, currency text NOT NULL, category text NOT NULL, label text, notes text, upload_status text NOT NULL, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL, is_hidden boolean NOT NULL, billable_on_pod boolean NOT NULL, org_id uuid NOT NULL, supplier text, vat_amount numeric(10,2), is_test boolean NOT NULL);
-- [06] public.inspections
CREATE TABLE public.inspections (id uuid NOT NULL, job_id uuid NOT NULL, type text NOT NULL, odometer integer, fuel_level_percent integer, vehicle_condition text, light_condition text, oil_level_status text, water_level_status text, notes text, handbook text, service_book text, mot text, v5 text, parcel_shelf text, spare_wheel_status text, tool_kit text, tyre_inflation_kit text, locking_wheel_nut text, sat_nav_working text, alloys_or_trims text, alloys_damaged text, wheel_trims_damaged text, number_of_keys text, ev_charging_cables text, aerial text, customer_paperwork text, has_damage boolean NOT NULL, inspected_at timestamp with time zone, inspected_by_name text, driver_signature_url text, customer_signature_url text, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL, customer_name text, org_id uuid NOT NULL, archived_at timestamp with time zone, run_id uuid, submission_session_id uuid, damage_declaration text);
-- [06] public.invoice_expenses
CREATE TABLE public.invoice_expenses (id uuid NOT NULL, invoice_id uuid NOT NULL, expense_id uuid, job_id uuid, ref text NOT NULL, sort_order integer NOT NULL, expense_date date NOT NULL, category text NOT NULL, supplier text, amount_gross numeric(10,2) NOT NULL, amount_vat numeric(10,2) NOT NULL, amount_charged numeric(10,2) NOT NULL, created_at timestamp with time zone NOT NULL, voided boolean NOT NULL);
-- [06] public.invoice_items
CREATE TABLE public.invoice_items (id uuid NOT NULL, invoice_id uuid NOT NULL, job_id uuid, description text NOT NULL, quantity numeric NOT NULL, unit_price numeric NOT NULL, amount numeric NOT NULL, sort_order integer NOT NULL, created_at timestamp with time zone NOT NULL, voided boolean NOT NULL);
-- [06] public.invoice_number_counters
CREATE TABLE public.invoice_number_counters (org_id uuid NOT NULL, last_seq integer NOT NULL, last_credit_seq integer NOT NULL);
-- [06] public.invoices
CREATE TABLE public.invoices (id uuid NOT NULL, org_id uuid NOT NULL, job_id uuid, invoice_number text NOT NULL, client_name text NOT NULL, client_email text, client_address text, client_company text, issue_date date NOT NULL, due_date date, line_items jsonb NOT NULL, subtotal numeric(10,2) NOT NULL, vat_rate numeric(5,2), vat_amount numeric(10,2), total numeric(10,2) NOT NULL, notes text, payment_terms text, status text NOT NULL, pdf_url text, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL, client_id uuid, sent_at timestamp with time zone, client_ref text, vat_registered boolean, expenses_total numeric(10,2) NOT NULL, document_type text NOT NULL, credits_invoice_id uuid, paid_at date, payment_method text, payment_reference text, cancelled_at timestamp with time zone, cancel_reason text, is_test boolean NOT NULL);
-- [06] public.job_abort_events
CREATE TABLE public.job_abort_events (id uuid NOT NULL, org_id uuid NOT NULL, job_id uuid NOT NULL, abort_id uuid, request_id uuid, actor_id uuid, action text NOT NULL, finance_status text, amount numeric(12,2), note text, created_at timestamp with time zone NOT NULL);
-- [06] public.job_abort_invoice_corrections
CREATE TABLE public.job_abort_invoice_corrections (id uuid NOT NULL, org_id uuid NOT NULL, job_id uuid NOT NULL, abort_id uuid NOT NULL, original_invoice_id uuid NOT NULL, credit_note_id uuid, replacement_invoice_id uuid, original_invoice_number text NOT NULL, previous_fee numeric NOT NULL, revised_fee numeric NOT NULL, other_jobs_on_invoice integer NOT NULL, original_was_paid boolean NOT NULL, reason text NOT NULL, client_confirmed_by uuid NOT NULL, created_at timestamp with time zone NOT NULL);
-- [06] public.job_abort_requests
CREATE TABLE public.job_abort_requests (id uuid NOT NULL, org_id uuid NOT NULL, job_id uuid NOT NULL, run_id uuid, driver_id uuid NOT NULL, requested_by uuid NOT NULL, requested_at timestamp with time zone NOT NULL, status text NOT NULL, resolved_at timestamp with time zone, resolved_by uuid, resolution_note text, abort_id uuid);
-- [06] public.job_aborts
CREATE TABLE public.job_aborts (id uuid NOT NULL, org_id uuid NOT NULL, job_id uuid NOT NULL, run_id uuid, from_status text NOT NULL, driver_id uuid, contact_name text, no_name_exception boolean NOT NULL, confirmed_by uuid NOT NULL, confirmed_at timestamp with time zone NOT NULL, agreed_price numeric(12,2), proposed_amount numeric(12,2), approved_amount numeric(12,2), finance_status text NOT NULL, reviewed_by uuid, reviewed_at timestamp with time zone, review_note text, customer_notified_at timestamp with time zone, customer_notified_by uuid, reopened_at timestamp with time zone, reopened_by uuid, created_at timestamp with time zone NOT NULL, last_amended_at timestamp with time zone, last_amended_by uuid, last_amendment_reason text, client_fee_confirmed_at timestamp with time zone, client_fee_confirmed_by uuid, client_fee_confirmed_amount numeric);
-- [06] public.job_activity_log
CREATE TABLE public.job_activity_log (id uuid NOT NULL, job_id uuid NOT NULL, action text NOT NULL, from_status text, to_status text, notes text, created_at timestamp with time zone NOT NULL, org_id uuid NOT NULL);
-- [06] public.job_deviation_log
CREATE TABLE public.job_deviation_log (id uuid NOT NULL, job_id uuid NOT NULL, driver_id text, recommended_job_id uuid, reason text NOT NULL, notes text, org_id uuid NOT NULL, created_at timestamp with time zone NOT NULL);
-- [06] public.job_pricing
CREATE TABLE public.job_pricing (job_id uuid NOT NULL, org_id uuid NOT NULL, total_price numeric, rate_per_mile numeric, admin_rate numeric(10,2), caz_ulez_cost numeric, pricing_metadata jsonb, pricing_suggestion_used_at timestamp with time zone, pricing_suggestion_used_by uuid, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL);
-- [06] public.job_status_overrides
CREATE TABLE public.job_status_overrides (id uuid NOT NULL, org_id uuid NOT NULL, job_id uuid NOT NULL, actor_id uuid NOT NULL, from_status text NOT NULL, to_status text NOT NULL, reason text NOT NULL, prev_completed_at timestamp with time zone, created_at timestamp with time zone NOT NULL);
-- [06] public.jobs
CREATE TABLE public.jobs (id uuid NOT NULL, external_job_number text, vehicle_reg text NOT NULL, vehicle_make text NOT NULL, vehicle_model text NOT NULL, vehicle_colour text NOT NULL, vehicle_year text, pickup_contact_name text NOT NULL, pickup_contact_phone text NOT NULL, pickup_company text, pickup_address_line1 text NOT NULL, pickup_address_line2 text, pickup_city text NOT NULL, pickup_postcode text NOT NULL, pickup_notes text, delivery_contact_name text NOT NULL, delivery_contact_phone text NOT NULL, delivery_company text, delivery_address_line1 text NOT NULL, delivery_address_line2 text, delivery_city text NOT NULL, delivery_postcode text NOT NULL, delivery_notes text, earliest_delivery_date date, status text NOT NULL, has_pickup_inspection boolean NOT NULL, has_delivery_inspection boolean NOT NULL, completed_at timestamp with time zone, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL, notify_customer_on_start boolean NOT NULL, notify_customer_on_arrival boolean NOT NULL, notify_customer_on_complete boolean NOT NULL, is_hidden boolean NOT NULL, pod_pdf_url text, route_distance_miles numeric, route_eta_minutes integer, maps_validated boolean NOT NULL, sheet_job_id text, job_date date, priority text, job_type text, job_source text, client_name text, client_notes text, pickup_time_from text, pickup_time_to text, pickup_access_notes text, delivery_time_from text, delivery_time_to text, delivery_access_notes text, promise_by_time text, vehicle_type text, vehicle_fuel_type text, distance_miles numeric, caz_ulez_flag text, other_expenses numeric, driver_name text, driver_external_id text, job_notes text, cancellation_reason text, sync_to_map boolean, sheet_row_index integer, client_phone text, client_email text, client_company text, org_id uuid NOT NULL, sort_order integer, driver_id uuid, client_id uuid, current_run_id uuid NOT NULL, pickup_contact_email text, delivery_contact_email text, route_order integer, is_test boolean NOT NULL, catalogue_image_path text, rebooked_from_job_id uuid);
-- [06] public.onboarding_documents
CREATE TABLE public.onboarding_documents (id uuid NOT NULL, org_id uuid NOT NULL, related_type text NOT NULL, related_id uuid NOT NULL, file_name text NOT NULL, file_url text NOT NULL, document_type text NOT NULL, expires_at date, uploaded_by uuid, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL);
-- [06] public.organisations
CREATE TABLE public.organisations (id uuid NOT NULL, name text NOT NULL, created_at timestamp with time zone NOT NULL, legal_name text, company_number text, vat_number text, registered_address text, trading_address text, main_contact_name text, main_contact_email text, main_contact_phone text, branding_name text, logo_url text, primary_colour text, status text NOT NULL, billing_plan text, max_users integer, notes text, updated_at timestamp with time zone NOT NULL, vat_registered boolean NOT NULL, bank_name text, bank_account_name text, bank_sort_code text, bank_account_number text, late_payment_notice boolean NOT NULL);
-- [06] public.permission_audit_log
CREATE TABLE public.permission_audit_log (id uuid NOT NULL, actor_user_id uuid, actor_email text, target_user_id uuid NOT NULL, permission_key text NOT NULL, action text NOT NULL, old_grant_type text, new_grant_type text, reason text, created_at timestamp with time zone NOT NULL);
-- [06] public.permissions_catalog
CREATE TABLE public.permissions_catalog (key text NOT NULL, label text NOT NULL, category text NOT NULL, description text, is_sensitive boolean NOT NULL, created_at timestamp with time zone NOT NULL);
-- [06] public.photos
CREATE TABLE public.photos (id uuid NOT NULL, job_id uuid NOT NULL, inspection_id uuid, type text NOT NULL, url text NOT NULL, thumbnail_url text, backend text NOT NULL, backend_ref text, created_at timestamp with time zone NOT NULL, label text, org_id uuid NOT NULL, archived_at timestamp with time zone, run_id uuid, updated_at timestamp with time zone NOT NULL, damage_item_id uuid);
-- [06] public.pricing_snapshots
CREATE TABLE public.pricing_snapshots (id uuid NOT NULL, org_id uuid NOT NULL, job_id uuid NOT NULL, created_by uuid, created_at timestamp with time zone NOT NULL, suggested_price numeric, applied_price numeric, confidence text, reasons jsonb NOT NULL, warnings jsonb NOT NULL, missing_inputs jsonb NOT NULL, breakdown jsonb NOT NULL, inputs jsonb NOT NULL, is_final_invoice_price boolean NOT NULL, source text NOT NULL);
-- [06] public.push_config
CREATE TABLE public.push_config (id boolean NOT NULL, vapid_public_key text NOT NULL, vapid_private_key text NOT NULL, vapid_subject text NOT NULL, updated_at timestamp with time zone NOT NULL);
-- [06] public.push_subscriptions
CREATE TABLE public.push_subscriptions (id uuid NOT NULL, user_id uuid NOT NULL, endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL, user_agent text, platform text, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL, last_success_at timestamp with time zone, failure_count integer NOT NULL);
-- [06] public.qr_confirmations
CREATE TABLE public.qr_confirmations (id uuid NOT NULL, job_id uuid NOT NULL, event_type text NOT NULL, token text NOT NULL, expires_at timestamp with time zone NOT NULL, confirmed_at timestamp with time zone, customer_name text, notes text, created_at timestamp with time zone NOT NULL);
-- [06] public.role_permission_templates
CREATE TABLE public.role_permission_templates (role text NOT NULL, permission_key text NOT NULL, is_allowed boolean NOT NULL, created_at timestamp with time zone NOT NULL);
-- [06] public.user_permission_overrides
CREATE TABLE public.user_permission_overrides (id uuid NOT NULL, user_id uuid NOT NULL, permission_key text NOT NULL, grant_type text NOT NULL, granted_by uuid, reason text, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL);
-- [06] public.user_profiles
CREATE TABLE public.user_profiles (id uuid NOT NULL, auth_user_id uuid NOT NULL, first_name text, last_name text, display_name text, email text NOT NULL, phone text, org_id uuid, role text NOT NULL, account_status text NOT NULL, is_protected boolean NOT NULL, internal_notes text, profile_photo_path text, permissions jsonb NOT NULL, activated_at timestamp with time zone, activated_by uuid, suspended_at timestamp with time zone, suspended_by uuid, suspension_reason text, created_at timestamp with time zone NOT NULL, updated_at timestamp with time zone NOT NULL, mobile text, avatar_url text, full_name text, client_id uuid);
-- [06] public.vehicle_catalogue_images
CREATE TABLE public.vehicle_catalogue_images (id uuid NOT NULL, make text NOT NULL, model text NOT NULL, year_from integer NOT NULL, year_to integer NOT NULL, colour text NOT NULL, body_type text, generation text, image_path text NOT NULL, created_at timestamp with time zone NOT NULL, created_by uuid);
-- [06] public.vehicle_make_aliases
CREATE TABLE public.vehicle_make_aliases (alias text NOT NULL, make text NOT NULL, created_at timestamp with time zone NOT NULL);
-- [07] axentra_private.on_digital_id_account_change()
CREATE OR REPLACE FUNCTION axentra_private.on_digital_id_account_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'axentra_private'
AS $function$
BEGIN
  PERFORM axentra_private.sync_driver_digital_credential(NEW.auth_user_id);
  RETURN NEW;
END;
$function$
;
-- [07] axentra_private.on_digital_id_driver_change()
CREATE OR REPLACE FUNCTION axentra_private.on_digital_id_driver_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'axentra_private'
AS $function$
BEGIN
  PERFORM axentra_private.sync_driver_digital_credential(NEW.user_id);
  RETURN NEW;
END;
$function$
;
-- [07] axentra_private.sync_driver_digital_credential(p_user_id uuid)
CREATE OR REPLACE FUNCTION axentra_private.sync_driver_digital_credential(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'axentra_private'
AS $function$
DECLARE
  v_account public.user_profiles%ROWTYPE;
  v_driver public.driver_profiles%ROWTYPE;
  v_current public.driver_digital_credentials%ROWTYPE;
  v_eligible boolean;
  v_created boolean := false;
  v_event text;
  v_approved_name text;
BEGIN
  SELECT * INTO v_account FROM public.user_profiles
  WHERE auth_user_id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_driver FROM public.driver_profiles
  WHERE user_id = p_user_id ORDER BY updated_at DESC LIMIT 1;

  v_approved_name := COALESCE(
    NULLIF(btrim(v_driver.full_name), ''),
    NULLIF(btrim(v_account.full_name), ''),
    NULLIF(btrim(concat_ws(' ', v_account.first_name, v_account.last_name)), ''),
    ''
  );

  v_eligible := (v_account.role = 'driver'
                OR (v_account.role IN ('admin','super_admin') AND v_driver.id IS NOT NULL))
                AND v_account.account_status = 'active'
                AND (v_driver.id IS NULL OR (v_driver.is_active AND v_driver.archived_at IS NULL
                      AND v_driver.org_id IS NOT DISTINCT FROM v_account.org_id));

  SELECT * INTO v_current FROM public.driver_digital_credentials
  WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    -- Pending invitations have no issued credential. First issuance happens on activation.
    IF v_account.account_status <> 'active' OR NOT (
      v_account.role = 'driver'
      OR (v_account.role IN ('admin','super_admin') AND v_driver.id IS NOT NULL)
    ) THEN RETURN; END IF;
    INSERT INTO public.driver_digital_credentials
      (user_id, org_id, holder_name, status, revoked_at)
    VALUES (p_user_id, v_account.org_id, v_approved_name,
      CASE WHEN v_eligible THEN 'active' ELSE 'revoked' END,
      CASE WHEN v_eligible THEN NULL ELSE now() END)
    RETURNING * INTO v_current;
    v_created := true;
    v_event := 'issued';
  ELSIF v_current.org_id IS DISTINCT FROM v_account.org_id THEN
    -- A driver transferred between orgs must not keep an old organisation's
    -- private portrait or access scope. Retain permanent serial, rotate version.
    UPDATE public.driver_digital_credentials
       SET org_id = v_account.org_id, photo_path = NULL,
           credential_version = credential_version + 1,
           status = CASE WHEN v_eligible THEN 'active' ELSE 'revoked' END,
           revoked_at = CASE WHEN v_eligible THEN NULL ELSE now() END,
           updated_at = now()
     WHERE user_id = p_user_id RETURNING * INTO v_current;
    v_event := 'org_changed';
  ELSIF v_eligible AND v_current.status = 'revoked' THEN
    UPDATE public.driver_digital_credentials
       SET status = 'active',
           credential_version = credential_version + 1,
           revoked_at = NULL, updated_at = now(),
           org_id = v_account.org_id
     WHERE user_id = p_user_id RETURNING * INTO v_current;
    v_event := 'reactivated';
  ELSIF NOT v_eligible AND v_current.status = 'active' THEN
    UPDATE public.driver_digital_credentials
       SET status = 'revoked', revoked_at = now(), updated_at = now()
     WHERE user_id = p_user_id RETURNING * INTO v_current;
    v_event := 'revoked';
  END IF;

  -- The customer-facing company-ID name is admin-approved and stored in the
  -- credential. A driver may edit their normal profile without impersonating
  -- another person on the company-issued card.
  IF NOT v_created AND v_approved_name <> ''
     AND (auth.uid() IS NULL OR public.is_admin_or_super_admin())
     AND v_current.holder_name IS DISTINCT FROM v_approved_name THEN
    UPDATE public.driver_digital_credentials
      SET holder_name = v_approved_name, updated_at = now()
      WHERE id = v_current.id RETURNING * INTO v_current;
    INSERT INTO public.driver_digital_credential_events
      (credential_id, actor_user_id, event_type, credential_version, details)
    VALUES (v_current.id, auth.uid(), 'name_updated',
            v_current.credential_version, jsonb_build_object('approved_name_updated', true));
  END IF;

  IF v_event IS NOT NULL THEN
    INSERT INTO public.driver_digital_credential_events
      (credential_id, actor_user_id, event_type, credential_version, details)
    VALUES (
      v_current.id, auth.uid(), v_event, v_current.credential_version,
      jsonb_build_object('account_status', v_account.account_status,
                         'role', v_account.role, 'active', v_eligible,
                         'initial_issue', v_created)
    );
  END IF;
END;
$function$
;
-- [07] public.abort_eligible_statuses()
CREATE OR REPLACE FUNCTION public.abort_eligible_statuses()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT ARRAY['new', 'pending', 'ready_for_pickup', 'assigned', 'pickup_in_progress']::text[]
$function$
;
-- [07] public.activate_user_account(p_target_user_id uuid)
CREATE OR REPLACE FUNCTION public.activate_user_account(p_target_user_id uuid)
 RETURNS public.user_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_target public.user_profiles;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select *
    into v_target
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if v_target.auth_user_id is null then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if not public.can_actor_manage_target_user(v_actor, p_target_user_id)
     and not public.is_super_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_target.account_status not in ('pending_activation', 'suspended') then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.user_profiles
  set
    account_status = 'active',
    activated_at = now(),
    activated_by = v_actor,
    suspended_at = null,
    suspended_by = null,
    suspension_reason = null,
    updated_at = now()
  where auth_user_id = p_target_user_id
  returning * into v_target;

  insert into public.admin_audit_log (
    performed_by,
    performed_by_email,
    action,
    target_user_id,
    target_org_id,
    before_state,
    after_state
  )
  values (
    v_actor,
    public.current_actor_email(),
    'activate_user_account',
    p_target_user_id,
    v_target.org_id,
    jsonb_build_object('account_status', 'pending_or_suspended'),
    jsonb_build_object('account_status', 'active')
  );

  return v_target;
end;
$function$
;
-- [07] public.allocate_credit_note_number(p_org_id uuid)
CREATE OR REPLACE FUNCTION public.allocate_credit_note_number(p_org_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seq integer;
BEGIN
  IF NOT (public.is_super_admin()
          OR (p_org_id = public.user_org_id() AND public.is_admin_or_super_admin())) THEN
    RAISE EXCEPTION 'not authorised to allocate credit note numbers for org %', p_org_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.invoice_number_counters (org_id, last_credit_seq)
  VALUES (p_org_id, 1)
  ON CONFLICT (org_id)
    DO UPDATE SET last_credit_seq = public.invoice_number_counters.last_credit_seq + 1
  RETURNING last_credit_seq INTO v_seq;

  RETURN 'CN' || to_char(now(), 'YY') || '-' || lpad(v_seq::text, 4, '0');
END;
$function$
;
-- [07] public.allocate_invoice_number(p_org_id uuid)
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
$function$
;
-- [07] public.amend_approved_job_abort_claim(p_abort_id uuid, p_new_am
CREATE OR REPLACE FUNCTION public.amend_approved_job_abort_claim(p_abort_id uuid, p_new_amount numeric, p_reason text, p_expected_amount numeric, p_client_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_abort public.job_aborts%ROWTYPE;
  v_old_amount numeric;
  v_new_amount numeric;
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF p_client_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'CLIENT_FEE_CONFIRMATION_REQUIRED' USING ERRCODE = '23514';
  END IF;

  IF length(v_reason) < 15 OR length(v_reason) > 500 THEN
    RAISE EXCEPTION 'AMENDMENT_REASON_REQUIRED'
      USING ERRCODE = '23514',
            HINT = 'Explain the exceptional correction in 15 to 500 characters';
  END IF;

  SELECT * INTO v_abort FROM public.job_aborts
   WHERE id = p_abort_id FOR UPDATE;
  -- Even a super admin may not amend another organisation's financial records.
  IF v_abort.id IS NULL OR v_abort.org_id IS DISTINCT FROM public.user_org_id() THEN
    RAISE EXCEPTION 'ABORT_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_abort.finance_status <> 'approved' OR v_abort.approved_amount IS NULL THEN
    RAISE EXCEPTION 'ABORT_FEE_NOT_APPROVED' USING ERRCODE = '23514';
  END IF;
  IF v_abort.reopened_at IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public.jobs j
                     WHERE j.id = v_abort.job_id AND j.status = 'aborted') THEN
    RAISE EXCEPTION 'ABORT_NOT_CURRENT' USING ERRCODE = '23514';
  END IF;

  v_old_amount := v_abort.approved_amount;
  IF p_expected_amount IS NULL OR v_old_amount IS DISTINCT FROM p_expected_amount THEN
    RAISE EXCEPTION 'ABORT_FEE_CHANGED'
      USING ERRCODE = '23514', HINT = 'The approved fee changed. Reload before amending';
  END IF;
  IF p_new_amount IS NULL OR p_new_amount <> round(p_new_amount, 2) THEN
    RAISE EXCEPTION 'INVALID_AMOUNT'
      USING ERRCODE = '23514', HINT = 'Enter an exact amount in pounds and pence';
  END IF;

  v_new_amount := p_new_amount;
  IF v_new_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
  END IF;
  IF v_new_amount = v_old_amount THEN
    RAISE EXCEPTION 'ABORT_AMENDMENT_NO_CHANGE'
      USING ERRCODE = '23514', HINT = 'Enter a different amount';
  END IF;

  -- Retain the original reviewed_by/reviewed_at/review_note. Correction identity
  -- is separately persisted and the immutable event logs old and new values.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || v_abort.job_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.invoice_items ii
              WHERE ii.job_id = v_abort.job_id AND NOT COALESCE(ii.voided, false))
     OR EXISTS (SELECT 1 FROM public.invoices i
                 WHERE i.job_id = v_abort.job_id AND i.status <> 'cancelled'
                   AND COALESCE(i.document_type, 'invoice') = 'invoice') THEN
    RAISE EXCEPTION 'ABORT_CLAIM_INVOICED'
      USING ERRCODE = '23514',
            HINT = 'An invoiced fee must be corrected using the invoice/credit-note process';
  END IF;

  UPDATE public.job_aborts
     SET approved_amount = v_new_amount,
         last_amended_at = now(),
         last_amended_by = v_uid,
         last_amendment_reason = v_reason,
         client_fee_confirmed_by = v_uid,
         client_fee_confirmed_at = now(),
         client_fee_confirmed_amount = v_new_amount
   WHERE id = p_abort_id
     AND finance_status = 'approved'
     AND approved_amount = v_old_amount
   RETURNING * INTO v_abort;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ABORT_FEE_CHANGED' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.job_abort_events
    (org_id, job_id, abort_id, actor_id, action, finance_status, amount, note)
  VALUES
    (v_abort.org_id, v_abort.job_id, v_abort.id, v_uid,
     'claim_amended', 'approved', v_new_amount,
     format('Admin re-attested client fee confirmation. Previous approved fee: £%s; amended to: £%s; reason: %s',
            v_old_amount, v_new_amount, v_reason));

  RETURN jsonb_build_object(
    'abortId', v_abort.id, 'financeStatus', 'approved',
    'approvedAmount', v_new_amount,
    'previousAmount', v_old_amount,
    'amendedAt', v_abort.last_amended_at,
    'amendmentReason', v_reason
  );
END;
$function$
;
-- [07] public.archive_driver_profile(p_target_user_id uuid, p_reason t
CREATE OR REPLACE FUNCTION public.archive_driver_profile(p_target_user_id uuid, p_reason text DEFAULT NULL::text, p_suspend_account boolean DEFAULT true)
 RETURNS public.driver_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_profile public.user_profiles;
  v_driver public.driver_profiles;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if v_actor = p_target_user_id then
    raise exception 'CANNOT_ARCHIVE_SELF';
  end if;

  select *
    into v_profile
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if v_profile.auth_user_id is null then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if v_profile.role <> 'driver' then
    raise exception 'NOT_A_DRIVER';
  end if;

  if not public.can_actor_manage_target_user(v_actor, p_target_user_id)
     and not public.is_super_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.driver_profiles
  set
    archived_at = now(),
    archived_by = v_actor,
    archive_reason = p_reason,
    is_active = false
  where user_id = p_target_user_id
  returning * into v_driver;

  if v_driver.id is null then
    raise exception 'DRIVER_PROFILE_NOT_FOUND';
  end if;

  if p_suspend_account then
    update public.user_profiles
    set
      account_status = 'suspended',
      suspended_at = now(),
      suspended_by = v_actor,
      suspension_reason = coalesce('Archived driver: ' || p_reason, 'Archived driver'),
      updated_at = now()
    where auth_user_id = p_target_user_id;
  end if;

  insert into public.admin_audit_log (
    performed_by,
    performed_by_email,
    action,
    target_user_id,
    target_org_id,
    before_state,
    after_state
  )
  values (
    v_actor,
    public.current_actor_email(),
    'archive_driver_profile',
    p_target_user_id,
    v_profile.org_id,
    jsonb_build_object('archived_at', null, 'is_active', true),
    jsonb_build_object(
      'archived_at', v_driver.archived_at,
      'is_active', false,
      'reason', p_reason,
      'suspended_account', p_suspend_account
    )
  );

  return v_driver;
end;
$function$
;
-- [07] public.audit_app_settings_change()
CREATE OR REPLACE FUNCTION public.audit_app_settings_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_email text;
begin
  -- No signed-in actor (migration, service role): nothing to attribute.
  if v_actor is null then
    return coalesce(new, old);
  end if;
  -- An update that changes nothing is not a change.
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;
  end if;

  select up.email into v_email from public.user_profiles up where up.auth_user_id = v_actor;

  insert into public.admin_audit_log (performed_by, performed_by_email, action, before_state, after_state)
  values (
    v_actor,
    coalesce(v_email, ''),
    'app_setting_' || lower(tg_op),
    case when tg_op <> 'INSERT' then jsonb_build_object('key', old.key, 'value', old.value) end,
    case when tg_op <> 'DELETE' then jsonb_build_object('key', new.key, 'value', new.value) end
  );
  return coalesce(new, old);
end;
$function$
;
-- [07] public.auto_link_job_to_client()
CREATE OR REPLACE FUNCTION public.auto_link_job_to_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_company text := normalize_client_name(new.client_company);
  v_contact text := normalize_client_name(new.client_name);
  v_client_org uuid;
  v_match uuid;
begin
  if new.client_id is not null
     and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    select c.org_id into v_client_org from clients c where c.id = new.client_id;
    if v_client_org is null or v_client_org is distinct from new.org_id then
      raise exception 'client % does not belong to this job''s organisation', new.client_id
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.client_id is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.client_id is not null then
    return new;
  end if;

  if v_company = '' and v_contact = '' then
    return new;
  end if;

  select c.id
    into v_match
    from clients c
   where c.org_id = new.org_id
     and (
       (v_company <> '' and (normalize_client_name(c.company) = v_company
                             or normalize_client_name(c.name) = v_company))
       or (v_contact <> '' and normalize_client_name(c.company) = v_contact)
     )
   order by c.is_active desc, c.created_at asc
   limit 1;

  if v_match is not null then
    new.client_id := v_match;
  end if;

  return new;
end;
$function$
;
-- [07] public.can_actor_manage_permission(p_actor_user_id uuid, p_targ
CREATE OR REPLACE FUNCTION public.can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 actor_role text; actor_org uuid; actor_status text;
 target_org uuid; target_role text; permission_sensitive boolean;
begin
 if p_grant_type not in ('allow','deny') then return false; end if;
 select up.role,up.org_id,up.account_status into actor_role,actor_org,actor_status
 from public.user_profiles up where up.auth_user_id=p_actor_user_id;
 select up.role,up.org_id into target_role,target_org
 from public.user_profiles up where up.auth_user_id=p_target_user_id;
 if actor_role is null or target_role is null or actor_status is distinct from 'active' then return false; end if;
 if not exists(select 1 from public.permissions_catalog where key=p_permission_key) then return false; end if;
 if actor_role='super_admin' then return true; end if;
 if actor_role <> 'admin' then return false; end if;
 if actor_org is distinct from target_org then return false; end if;
 if target_role='super_admin' then return false; end if;
 if p_permission_key='platform.super_admin' then return false; end if;
 select pc.is_sensitive into permission_sensitive from public.permissions_catalog pc where pc.key=p_permission_key;
 if not public.user_has_permission(p_actor_user_id,p_permission_key) then return false; end if;
 if permission_sensitive and p_permission_key in ('users.manage_permissions','users.manage_admins') then return false; end if;
 return true;
end;
$function$
;
-- [07] public.can_actor_manage_target_user(p_actor_user_id uuid, p_tar
CREATE OR REPLACE FUNCTION public.can_actor_manage_target_user(p_actor_user_id uuid, p_target_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_role text;
  actor_org uuid;
  target_role text;
  target_org uuid;
begin
  if p_actor_user_id is null or p_target_user_id is null then
    return false;
  end if;

  if p_actor_user_id = p_target_user_id then
    return false;
  end if;

  select role, org_id
    into actor_role, actor_org
  from public.user_profiles
  where auth_user_id = p_actor_user_id;

  select role, org_id
    into target_role, target_org
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if actor_role is null or target_role is null then
    return false;
  end if;

  if public.is_protected_user(p_target_user_id) then
    return false;
  end if;

  if actor_role = 'super_admin' then
    return true;
  end if;

  if actor_role <> 'admin' then
    return false;
  end if;

  if actor_org is distinct from target_org then
    return false;
  end if;

  if public.role_rank(target_role) >= public.role_rank(actor_role) then
    return false;
  end if;

  return true;
end;
$function$
;
-- [07] public.cancel_invoice(p_invoice_id uuid, p_reason text)
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_credit_id uuid;
  v_number text;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'only admins can cancel invoices' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'a reason is required to cancel an invoice' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'invoice not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_inv.document_type <> 'invoice' THEN
    RAISE EXCEPTION 'a credit note cannot be cancelled' USING ERRCODE = '23514';
  END IF;
  IF v_inv.status = 'cancelled' THEN
    RAISE EXCEPTION 'invoice % is already cancelled', v_inv.invoice_number USING ERRCODE = '23514';
  END IF;

  IF v_inv.status <> 'draft' THEN
    v_number := public.allocate_credit_note_number(v_inv.org_id);

    INSERT INTO public.invoices (
      org_id, client_id, client_name, client_company, client_email, client_address,
      invoice_number, document_type, credits_invoice_id, issue_date,
      line_items, subtotal, vat_rate, vat_amount, total, expenses_total,
      vat_registered, client_ref, notes, payment_terms, status
    )
    VALUES (
      v_inv.org_id, v_inv.client_id, v_inv.client_name, v_inv.client_company,
      v_inv.client_email, v_inv.client_address,
      v_number, 'credit_note', v_inv.id, CURRENT_DATE,
      v_inv.line_items, -v_inv.subtotal, v_inv.vat_rate, -COALESCE(v_inv.vat_amount, 0),
      -v_inv.total, -v_inv.expenses_total,
      v_inv.vat_registered, v_inv.client_ref,
      'Credit note for invoice ' || v_inv.invoice_number || '. Reason: ' || v_reason,
      NULL, 'draft'
    )
    RETURNING id INTO v_credit_id;

    -- Issue it immediately: a credit note is never a work in progress.
    UPDATE public.invoices SET status = 'sent', sent_at = now() WHERE id = v_credit_id;
  END IF;

  UPDATE public.invoices
     SET status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
   WHERE id = v_inv.id;

  UPDATE public.invoice_items SET voided = true WHERE invoice_id = v_inv.id AND NOT voided;
  UPDATE public.invoice_expenses SET voided = true WHERE invoice_id = v_inv.id AND NOT voided;

  RETURN v_credit_id;
END;
$function$
;
-- [07] public.canonical_make(p text)
CREATE OR REPLACE FUNCTION public.canonical_make(p text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select public.vehicle_name_norm(a.make) from public.vehicle_make_aliases a
      where a.alias = public.vehicle_name_norm(p)),
    public.vehicle_name_norm(p))
$function$
;
-- [07] public.catalogue_refresh_jobs()
CREATE OR REPLACE FUNCTION public.catalogue_refresh_jobs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform set_config('axentra.catalogue_backfill', 'on', true);
  if tg_table_name = 'vehicle_catalogue_images' then
    -- re-check every job of the affected make(s), plus any job pointing at the old image,
    -- so a new, better (longer model / matching colour) or removed image is reflected
    update public.jobs j set catalogue_image_path = catalogue_image_path
    where public.canonical_make(j.vehicle_make) = any (array[
            case when tg_op <> 'INSERT' then public.canonical_make(old.make) end,
            case when tg_op <> 'DELETE' then public.canonical_make(new.make) end])
       or (tg_op <> 'INSERT' and j.catalogue_image_path = old.image_path);
  else
    update public.jobs j set catalogue_image_path = catalogue_image_path
    where j.catalogue_image_path is null;
  end if;
  perform set_config('axentra.catalogue_backfill', 'off', true);
  return null;
end $function$
;
-- [07] public.complete_job(p_job_id uuid, p_notes text)
CREATE OR REPLACE FUNCTION public.complete_job(p_job_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS public.jobs
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job public.jobs;
  v_allowed text[] := ARRAY['pod_ready','delivery_complete'];
BEGIN
  IF NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501',
            HINT = 'Only an admin or super-admin can complete a job after POD review';
  END IF;

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
$function$
;
-- [07] public.confirm_job_abort(p_job_id uuid, p_contact_name text, p_
CREATE OR REPLACE FUNCTION public.confirm_job_abort(p_job_id uuid, p_contact_name text, p_no_name_exception boolean DEFAULT false, p_expected_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text := NULLIF(btrim(regexp_replace(COALESCE(p_contact_name, ''), '\s+', ' ', 'g')), '');
  v_no_name  boolean;
  v_job      record;
  v_price    numeric;
  v_existing public.job_aborts%ROWTYPE;
  v_abort    public.job_aborts%ROWTYPE;
  v_req_ids  uuid[];
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501', HINT = 'Only an admin or super admin can abort a job';
  END IF;

  -- A typed name always wins; the exception is only for when there is no name at all.
  v_no_name := v_name IS NULL AND COALESCE(p_no_name_exception, false);
  IF v_name IS NULL AND NOT v_no_name THEN
    RAISE EXCEPTION 'CONTACT_NAME_REQUIRED'
      USING ERRCODE = '23514', HINT = 'Enter the name of the person confirming the Abort';
  END IF;
  IF v_name IS NOT NULL AND char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'CONTACT_NAME_TOO_LONG' USING ERRCODE = '23514';
  END IF;

  SELECT id, org_id, status, driver_id, current_run_id, has_pickup_inspection, is_hidden
    INTO v_job
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_job.id IS NULL OR NOT (public.is_super_admin() OR v_job.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- Second admin / double tap / retry after a lost response: report the Abort that exists.
  IF v_job.status = 'aborted' THEN
    SELECT * INTO v_existing FROM public.job_aborts
     WHERE job_id = p_job_id AND reopened_at IS NULL
     ORDER BY confirmed_at DESC LIMIT 1;
    RETURN jsonb_build_object(
      'abortId', v_existing.id, 'confirmedAt', v_existing.confirmed_at,
      'contactName', v_existing.contact_name, 'noNameException', v_existing.no_name_exception,
      'financeStatus', v_existing.finance_status, 'alreadyAborted', true);
  END IF;

  IF p_expected_status IS NOT NULL AND p_expected_status <> v_job.status THEN
    RAISE EXCEPTION 'STALE_JOB_STATE'
      USING ERRCODE = '40001', HINT = 'The job is now ' || v_job.status || '. Refresh and check before aborting';
  END IF;

  IF v_job.is_hidden OR NOT (v_job.status = ANY (public.abort_eligible_statuses()))
     OR COALESCE(v_job.has_pickup_inspection, false) THEN
    RAISE EXCEPTION 'ABORT_NOT_ELIGIBLE'
      USING ERRCODE = '23514',
            HINT = 'Only a job that has not been collected can be aborted (status ' || v_job.status || ')';
  END IF;

  -- Agreed price snapshot. Unknown stays NULL: never treat an unknown price as zero.
  SELECT jp.total_price INTO v_price FROM public.job_pricing jp WHERE jp.job_id = p_job_id;
  IF v_price IS NOT NULL AND v_price < 0 THEN v_price := NULL; END IF;

  INSERT INTO public.job_aborts (
    org_id, job_id, run_id, from_status, driver_id, contact_name, no_name_exception,
    confirmed_by, confirmed_at, agreed_price, proposed_amount)
  VALUES (
    v_job.org_id, p_job_id, v_job.current_run_id, v_job.status, v_job.driver_id, v_name, v_no_name,
    v_uid, now(), round(v_price, 2), round(v_price, 2))
  RETURNING * INTO v_abort;

  PERFORM set_config('axentra.abort_workflow', 'on', true);
  UPDATE public.jobs SET status = 'aborted', updated_at = now() WHERE id = p_job_id;
  PERFORM set_config('axentra.abort_workflow', 'off', true);

  WITH resolved AS (
    UPDATE public.job_abort_requests
       SET status = 'confirmed', resolved_at = now(), resolved_by = v_uid, abort_id = v_abort.id
     WHERE job_id = p_job_id AND status = 'pending'
     RETURNING id)
  SELECT array_agg(id) INTO v_req_ids FROM resolved;

  INSERT INTO public.job_abort_events (org_id, job_id, abort_id, request_id, actor_id, action, finance_status, amount, note)
  VALUES (v_job.org_id, p_job_id, v_abort.id, v_req_ids[1], v_uid, 'confirmed', 'pending_review',
          v_abort.proposed_amount,
          CASE WHEN v_no_name THEN 'No-name exception authorised by admin' ELSE 'Confirmed by ' || v_name END);

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (p_job_id, v_job.org_id, 'job_aborted', v_job.status, 'aborted',
          CASE WHEN v_no_name THEN 'Abort confirmed (no-name exception)'
               ELSE 'Abort confirmed by ' || v_name END);

  RETURN jsonb_build_object(
    'abortId', v_abort.id, 'confirmedAt', v_abort.confirmed_at,
    'contactName', v_abort.contact_name, 'noNameException', v_abort.no_name_exception,
    'financeStatus', v_abort.finance_status, 'proposedAmount', v_abort.proposed_amount,
    'resolvedRequests', COALESCE(array_length(v_req_ids, 1), 0), 'alreadyAborted', false);
END;
$function$
;
-- [07] public.correct_invoiced_job_abort_fee(p_abort_id uuid, p_origin
CREATE OR REPLACE FUNCTION public.correct_invoiced_job_abort_fee(p_abort_id uuid, p_original_invoice_id uuid, p_new_amount numeric, p_expected_amount numeric, p_reason text, p_client_confirmed boolean, p_multi_job_acknowledged boolean DEFAULT false, p_paid_acknowledged boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_abort public.job_aborts%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_credit_id uuid;
  v_amended jsonb;
  v_correction_id uuid;
  v_other_jobs integer;
  v_reason text := btrim(COALESCE(p_reason,''));
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  IF p_client_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'CLIENT_FEE_CONFIRMATION_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF char_length(v_reason) NOT BETWEEN 15 AND 500 THEN
    RAISE EXCEPTION 'AMENDMENT_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_abort FROM public.job_aborts WHERE id = p_abort_id FOR UPDATE;
  IF v_abort.id IS NULL OR v_abort.org_id IS DISTINCT FROM public.user_org_id() THEN
    RAISE EXCEPTION 'ABORT_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_abort.finance_status <> 'approved' OR v_abort.reopened_at IS NOT NULL
     OR NOT EXISTS (SELECT 1 FROM public.jobs j
        WHERE j.id=v_abort.job_id AND j.status='aborted') THEN
    RAISE EXCEPTION 'ABORT_NOT_CURRENT' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || v_abort.job_id::text, 0));
  SELECT * INTO v_invoice FROM public.invoices
    WHERE id = p_original_invoice_id FOR UPDATE;
  IF v_invoice.id IS NULL OR v_invoice.org_id IS DISTINCT FROM v_abort.org_id
     OR COALESCE(v_invoice.document_type,'invoice') <> 'invoice'
     OR v_invoice.status = 'cancelled'
     OR NOT (v_invoice.job_id = v_abort.job_id
       OR EXISTS (SELECT 1 FROM public.invoice_items ii
          WHERE ii.invoice_id=v_invoice.id AND ii.job_id=v_abort.job_id
            AND NOT COALESCE(ii.voided,false))) THEN
    RAISE EXCEPTION 'ABORT_INVOICE_NOT_FOUND' USING ERRCODE = '23514';
  END IF;
  IF v_abort.approved_amount IS DISTINCT FROM p_expected_amount THEN
    RAISE EXCEPTION 'ABORT_FEE_CHANGED' USING ERRCODE = '23514';
  END IF;

  SELECT COUNT(DISTINCT ii.job_id) INTO v_other_jobs
    FROM public.invoice_items ii
    WHERE ii.invoice_id=v_invoice.id AND ii.job_id IS NOT NULL
      AND ii.job_id<>v_abort.job_id AND NOT COALESCE(ii.voided,false);
  IF v_other_jobs > 0 AND p_multi_job_acknowledged IS NOT TRUE THEN
    RAISE EXCEPTION 'FULL_CREDIT_OTHER_JOBS_ACK_REQUIRED'
      USING ERRCODE = '23514';
  END IF;
  IF v_invoice.status='paid' AND p_paid_acknowledged IS NOT TRUE THEN
    RAISE EXCEPTION 'PAID_INVOICE_REFUND_ACK_REQUIRED'
      USING ERRCODE = '23514';
  END IF;

  -- Existing invoice lifecycle guarantees the issued original is frozen,
  -- a FULL credit note is issued, and linked job lines are voided.
  v_credit_id := public.cancel_invoice(v_invoice.id, v_reason);
  v_amended := public.amend_approved_job_abort_claim(
    v_abort.id,p_new_amount,v_reason,p_expected_amount,true);

  INSERT INTO public.job_abort_invoice_corrections
    (org_id,job_id,abort_id,original_invoice_id,credit_note_id,
     original_invoice_number,previous_fee,revised_fee,other_jobs_on_invoice,
     original_was_paid,reason,client_confirmed_by)
  VALUES
    (v_abort.org_id,v_abort.job_id,v_abort.id,v_invoice.id,v_credit_id,
     v_invoice.invoice_number,p_expected_amount,p_new_amount,v_other_jobs,
     v_invoice.status='paid',v_reason,v_uid)
  RETURNING id INTO v_correction_id;

  INSERT INTO public.job_abort_events
    (org_id,job_id,abort_id,actor_id,action,finance_status,amount,note)
  VALUES (v_abort.org_id,v_abort.job_id,v_abort.id,v_uid,'invoice_fee_corrected',
    'approved',p_new_amount,format(
      'Original invoice %s fully cancelled; credit note id %s; original fee £%s; revised £%s; %s',
      v_invoice.invoice_number,COALESCE(v_credit_id::text,'draft - none'),
      p_expected_amount,p_new_amount,v_reason));

  RETURN jsonb_build_object(
    'correctionId',v_correction_id,'creditNoteId',v_credit_id,
    'originalInvoiceNumber',v_invoice.invoice_number,
    'approvedAmount',p_new_amount,'otherJobsToReinvoice',v_other_jobs,
    'originalWasPaid',v_invoice.status='paid');
END;
$function$
;
-- [07] public.create_abort_replacement_job(p_job_id uuid)
CREATE OR REPLACE FUNCTION public.create_abort_replacement_job(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_src    public.jobs%ROWTYPE;
  v_new_id uuid := gen_random_uuid();
  v_ref    text;
  v_n      integer := 1;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF v_src.id IS NULL OR NOT (public.is_super_admin() OR v_src.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_src.status <> 'aborted' THEN
    RAISE EXCEPTION 'JOB_NOT_ABORTED' USING ERRCODE = '23514';
  END IF;

  -- Repeated press: hand back the replacement that already exists.
  SELECT id, external_job_number INTO v_new_id, v_ref FROM public.jobs
   WHERE rebooked_from_job_id = p_job_id AND NOT is_hidden
   ORDER BY created_at DESC LIMIT 1;
  IF v_new_id IS NOT NULL THEN
    RETURN jsonb_build_object('jobId', v_new_id, 'jobRef', v_ref, 'alreadyExists', true);
  END IF;
  v_new_id := gen_random_uuid();

  IF v_src.external_job_number IS NOT NULL THEN
    LOOP
      v_ref := v_src.external_job_number || '-R' || v_n;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.jobs WHERE external_job_number = v_ref);
      v_n := v_n + 1;
    END LOOP;
  END IF;

  INSERT INTO public.jobs (
    id, org_id, external_job_number, status, rebooked_from_job_id, is_test,
    vehicle_reg, vehicle_make, vehicle_model, vehicle_colour, vehicle_year, vehicle_type, vehicle_fuel_type,
    client_id, client_name, client_company, client_email, client_phone, client_notes,
    pickup_contact_name, pickup_contact_phone, pickup_contact_email, pickup_company,
    pickup_address_line1, pickup_address_line2, pickup_city, pickup_postcode, pickup_notes, pickup_access_notes,
    pickup_time_from, pickup_time_to,
    delivery_contact_name, delivery_contact_phone, delivery_contact_email, delivery_company,
    delivery_address_line1, delivery_address_line2, delivery_city, delivery_postcode, delivery_notes, delivery_access_notes,
    delivery_time_from, delivery_time_to,
    route_distance_miles, route_eta_minutes, distance_miles, caz_ulez_flag, priority, job_type, job_source, job_notes,
    current_run_id)
  VALUES (
    v_new_id, v_src.org_id, v_ref, 'ready_for_pickup', p_job_id, v_src.is_test,
    v_src.vehicle_reg, v_src.vehicle_make, v_src.vehicle_model, v_src.vehicle_colour, v_src.vehicle_year, v_src.vehicle_type, v_src.vehicle_fuel_type,
    v_src.client_id, v_src.client_name, v_src.client_company, v_src.client_email, v_src.client_phone, v_src.client_notes,
    v_src.pickup_contact_name, v_src.pickup_contact_phone, v_src.pickup_contact_email, v_src.pickup_company,
    v_src.pickup_address_line1, v_src.pickup_address_line2, v_src.pickup_city, v_src.pickup_postcode, v_src.pickup_notes, v_src.pickup_access_notes,
    v_src.pickup_time_from, v_src.pickup_time_to,
    v_src.delivery_contact_name, v_src.delivery_contact_phone, v_src.delivery_contact_email, v_src.delivery_company,
    v_src.delivery_address_line1, v_src.delivery_address_line2, v_src.delivery_city, v_src.delivery_postcode, v_src.delivery_notes, v_src.delivery_access_notes,
    v_src.delivery_time_from, v_src.delivery_time_to,
    v_src.route_distance_miles, v_src.route_eta_minutes, v_src.distance_miles, v_src.caz_ulez_flag, v_src.priority, v_src.job_type, v_src.job_source,
    concat_ws(E'\n', 'Rebooked after Abort of ' || COALESCE(v_src.external_job_number, left(v_src.id::text, 8)), v_src.job_notes),
    gen_random_uuid());

  INSERT INTO public.job_pricing (job_id, org_id, total_price, rate_per_mile, admin_rate, caz_ulez_cost)
  SELECT v_new_id, jp.org_id, jp.total_price, jp.rate_per_mile, jp.admin_rate, jp.caz_ulez_cost
    FROM public.job_pricing jp WHERE jp.job_id = p_job_id
  ON CONFLICT (job_id) DO NOTHING;

  INSERT INTO public.job_abort_events (org_id, job_id, actor_id, action, note)
  VALUES (v_src.org_id, p_job_id, v_uid, 'replacement_created', 'Replacement job ' || v_new_id::text);

  INSERT INTO public.job_activity_log (job_id, org_id, action, notes)
  VALUES (p_job_id, v_src.org_id, 'abort_replacement_created',
          'Replacement job ' || COALESCE(v_ref, left(v_new_id::text, 8)) || ' created'),
         (v_new_id, v_src.org_id, 'job_created_from_abort',
          'Rebooked from aborted job ' || COALESCE(v_src.external_job_number, left(v_src.id::text, 8)));

  RETURN jsonb_build_object('jobId', v_new_id, 'jobRef', v_ref, 'alreadyExists', false);
END;
$function$
;
-- [07] public.current_actor_email()
CREATE OR REPLACE FUNCTION public.current_actor_email()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select up.email
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1
$function$
;
-- [07] public.current_driver_profile_id()
CREATE OR REPLACE FUNCTION public.current_driver_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT dp.id FROM public.driver_profiles dp WHERE dp.user_id = auth.uid() LIMIT 1
$function$
;
-- [07] public.current_user_has_permission(p_permission_key text)
CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.user_has_permission(auth.uid(), p_permission_key)
$function$
;
-- [07] public.delete_user_permission_override(p_target_user_id uuid, p
CREATE OR REPLACE FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.can_actor_manage_permission(v_actor, p_target_user_id, p_permission_key, 'allow') then
    raise exception 'PERMISSION_DENIED';
  end if;

  delete from public.user_permission_overrides
  where user_id = p_target_user_id
    and permission_key = p_permission_key;
end;
$function$
;
-- [07] public.delete_user_permission_override(p_target_user_id uuid, p
CREATE OR REPLACE FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_existing public.user_permission_overrides;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.can_actor_manage_permission(v_actor, p_target_user_id, p_permission_key, 'allow') then
    raise exception 'PERMISSION_DENIED';
  end if;

  select *
    into v_existing
  from public.user_permission_overrides
  where user_id = p_target_user_id
    and permission_key = p_permission_key;

  if v_existing.id is null then
    return;
  end if;

  delete from public.user_permission_overrides
  where user_id = p_target_user_id
    and permission_key = p_permission_key;

  insert into public.permission_audit_log (
    actor_user_id,
    actor_email,
    target_user_id,
    permission_key,
    action,
    old_grant_type,
    new_grant_type,
    reason
  )
  values (
    v_actor,
    public.current_actor_email(),
    p_target_user_id,
    p_permission_key,
    'delete_override',
    v_existing.grant_type,
    null,
    p_reason
  );
end;
$function$
;
-- [07] public.dismiss_job_abort_request(p_request_id uuid, p_note text
CREATE OR REPLACE FUNCTION public.dismiss_job_abort_request(p_request_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.job_abort_requests%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.job_abort_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL OR NOT (public.is_super_admin() OR v_req.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_req.status <> 'pending' THEN
    RETURN jsonb_build_object('requestId', v_req.id, 'status', v_req.status, 'alreadyResolved', true);
  END IF;

  UPDATE public.job_abort_requests
     SET status = 'dismissed', resolved_at = now(), resolved_by = auth.uid(), resolution_note = left(v_note, 500)
   WHERE id = p_request_id;

  INSERT INTO public.job_abort_events (org_id, job_id, request_id, actor_id, action, note)
  VALUES (v_req.org_id, v_req.job_id, v_req.id, auth.uid(), 'request_dismissed', left(v_note, 500));

  INSERT INTO public.job_activity_log (job_id, org_id, action, notes)
  VALUES (v_req.job_id, v_req.org_id, 'abort_request_dismissed',
          COALESCE('Abort request dismissed: ' || left(v_note, 500), 'Abort request dismissed'));

  RETURN jsonb_build_object('requestId', v_req.id, 'status', 'dismissed', 'alreadyResolved', false);
END;
$function$
;
-- [07] public.driver_can_access_expense(p_expense_id text)
CREATE OR REPLACE FUNCTION public.driver_can_access_expense(p_expense_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id::text = p_expense_id
      AND public.driver_owns_job(e.job_id)
  )
$function$
;
-- [07] public.driver_can_read_inspection_evidence(p_inspection_id uuid
CREATE OR REPLACE FUNCTION public.driver_can_read_inspection_evidence(p_inspection_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.inspections i
    WHERE i.id = p_inspection_id
      AND public.driver_can_read_job_evidence(i.job_id)
  )
$function$
;
-- [07] public.driver_can_read_job_evidence(p_job_id uuid)
CREATE OR REPLACE FUNCTION public.driver_can_read_job_evidence(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.driver_profiles dp ON dp.id = j.driver_id
    WHERE j.id = p_job_id
      AND dp.user_id = auth.uid()
      AND j.status NOT IN ('completed', 'cancelled', 'archived', 'aborted')
  )
$function$
;
-- [07] public.driver_can_use_job_path(p_name text)
CREATE OR REPLACE FUNCTION public.driver_can_use_job_path(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT split_part(p_name, '/', 1) = 'jobs'
     AND EXISTS (
       SELECT 1
       FROM public.jobs j
       JOIN public.driver_profiles dp ON dp.id = j.driver_id
       WHERE j.id::text = split_part(p_name, '/', 2)
         AND dp.user_id = auth.uid()
         AND j.status NOT IN ('completed', 'cancelled', 'archived', 'aborted')
     )
$function$
;
-- [07] public.driver_owns_job(p_job_id uuid)
CREATE OR REPLACE FUNCTION public.driver_owns_job(p_job_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.driver_profiles dp ON dp.id = j.driver_id
    WHERE j.id = p_job_id
      AND dp.user_id = auth.uid()
      AND j.org_id = public.user_org_id()
  )
$function$
;
-- [07] public.enforce_completed_at_semantics()
CREATE OR REPLACE FUNCTION public.enforce_completed_at_semantics()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  IF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END
$function$
;
-- [07] public.enqueue_customer_notification()
CREATE OR REPLACE FUNCTION public.enqueue_customer_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_collected text[] := array['pickup_complete', 'in_transit', 'delivery_in_progress'];
  v_delivered text[] := array['delivery_complete', 'pod_ready', 'completed'];
  v_old text := coalesce(old.status, '');
  v_event text;
begin
  if new.client_id is null or new.org_id is null or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = any(v_delivered) and not (v_old = any(v_delivered)) then
    v_event := 'delivered';
  elsif new.status = any(v_collected)
        and not (v_old = any(v_collected) or v_old = any(v_delivered)) then
    v_event := 'collected';
  else
    return new;
  end if;

  begin
    insert into customer_notifications (org_id, job_id, client_id, event)
    values (new.org_id, new.id, new.client_id, v_event)
    on conflict (job_id, event) do nothing;
  exception when others then
    raise warning 'enqueue_customer_notification failed for job %: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$
;
-- [07] public.expense_is_invoiced(p_expense_id uuid)
CREATE OR REPLACE FUNCTION public.expense_is_invoiced(p_expense_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.invoice_expenses ie
    WHERE ie.expense_id = p_expense_id AND NOT ie.voided
  )
$function$
;
-- [07] public.get_driver_digital_id(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.get_driver_digital_id(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor public.user_profiles%ROWTYPE;
  v_target public.user_profiles%ROWTYPE;
  v_driver public.driver_profiles%ROWTYPE;
  v_credential public.driver_digital_credentials%ROWTYPE;
  v_org public.organisations%ROWTYPE;
  v_target_id uuid := COALESCE(p_user_id, auth.uid());
  v_active boolean;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_actor FROM public.user_profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND OR v_actor.account_status <> 'active' THEN
    RAISE EXCEPTION 'ACCOUNT_INACTIVE' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_target FROM public.user_profiles WHERE auth_user_id = v_target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_target_id IS DISTINCT FROM auth.uid()
     AND v_actor.role <> 'super_admin'
     AND NOT (v_actor.role = 'admin' AND v_actor.org_id IS NOT NULL
              AND v_actor.org_id = v_target.org_id) THEN
    RAISE EXCEPTION 'NOT_AUTHORISED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_credential FROM public.driver_digital_credentials
    WHERE user_id = v_target_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_driver FROM public.driver_profiles
    WHERE user_id = v_target_id ORDER BY updated_at DESC LIMIT 1;
  SELECT * INTO v_org FROM public.organisations
    WHERE id = v_target.org_id;

  v_active := (v_target.role = 'driver'
    OR (v_target.role IN ('admin','super_admin') AND v_driver.id IS NOT NULL))
    AND v_target.account_status = 'active'
    AND v_credential.status = 'active'
    AND NULLIF(btrim(v_credential.holder_name), '') IS NOT NULL
    AND (v_driver.id IS NULL OR (v_driver.is_active AND v_driver.archived_at IS NULL
      AND v_driver.org_id IS NOT DISTINCT FROM v_target.org_id));

  -- A driver must not receive even an obsolete card when suspended/revoked.
  IF v_target_id = auth.uid() AND NOT v_active THEN
    RAISE EXCEPTION 'CREDENTIAL_UNAVAILABLE' USING ERRCODE = '42501';
  END IF;

   RETURN jsonb_build_object(
    'driver_id', 'AX-' || repeat('0', GREATEST(0, 6 - length(v_credential.serial_number::text))) || v_credential.serial_number::text,
    'credential_id', v_credential.id,
    'user_id', v_credential.user_id,
    'org_id', v_credential.org_id,
    'full_name', v_credential.holder_name,
    'employment_type', v_driver.employment_type,
    'role_label', 'Authorised Driver',
    'photo_path', v_credential.photo_path,
    'credential_version', v_credential.credential_version,
    'status', CASE WHEN v_active THEN 'active' ELSE 'revoked' END,
    'checked_at', v_now,
    'valid_until', CASE WHEN v_active THEN v_now + interval '30 seconds' ELSE NULL END,
    'company_name', 'Axentra Vehicle Logistics',
    'company_website', 'www.axentravehicles.co.uk',
    'company_phone', v_org.main_contact_phone,
    'issued_by', 'Axentra Control'
  );
END;
$function$
;
-- [07] public.get_vehicle_catalogue_image(p_make text, p_model text, p
CREATE OR REPLACE FUNCTION public.get_vehicle_catalogue_image(p_make text, p_model text, p_year integer, p_colour text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select public.resolve_catalogue_image(p_make, p_model, p_year::text, p_colour)
$function$
;
-- [07] public.guard_abort_invoicing()
CREATE OR REPLACE FUNCTION public.guard_abort_invoicing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status  text;
  v_run     uuid;
  v_abort   public.job_aborts%ROWTYPE;
  v_ceiling numeric;
  v_amount  numeric;
BEGIN
  IF NEW.job_id IS NULL THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.status = 'cancelled' OR COALESCE(NEW.document_type, 'invoice') <> 'invoice' THEN
      RETURN NEW;
    END IF;
    v_amount := NEW.subtotal;
  ELSE
    IF COALESCE(NEW.voided, false) THEN RETURN NEW; END IF;
    v_amount := NEW.amount;
  END IF;

  SELECT status, current_run_id INTO v_status, v_run FROM public.jobs WHERE id = NEW.job_id;
  IF v_status IS DISTINCT FROM 'aborted' THEN RETURN NEW; END IF;

  SELECT * INTO v_abort FROM public.job_aborts
   WHERE job_id = NEW.job_id AND reopened_at IS NULL
     AND run_id IS NOT DISTINCT FROM v_run
   ORDER BY confirmed_at DESC LIMIT 1;

  IF v_abort.id IS NULL OR v_abort.finance_status <> 'approved'
     OR COALESCE(v_abort.approved_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'ABORT_NOT_APPROVED: job % is aborted and its fee has not been approved', NEW.job_id
      USING ERRCODE = '23514';
  END IF;

  -- Never more than the approved fee plus that job's own recorded expenses (gross).
  SELECT v_abort.approved_amount + COALESCE(sum(e.amount), 0) INTO v_ceiling
    FROM public.expenses e WHERE e.job_id = NEW.job_id AND NOT COALESCE(e.is_hidden, false);
  IF COALESCE(v_amount, 0) > v_ceiling + 0.005 THEN
    RAISE EXCEPTION 'ABORT_AMOUNT_EXCEEDED: line % is above the approved Abort fee %', v_amount, v_abort.approved_amount
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$
;
-- [07] public.guard_driver_digital_id_state()
CREATE OR REPLACE FUNCTION public.guard_driver_digital_id_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF current_user = 'authenticated'
     AND NOT public.is_admin_or_super_admin()
     AND (NEW.is_active IS DISTINCT FROM OLD.is_active
          OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
          OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
          OR NEW.archive_reason IS DISTINCT FROM OLD.archive_reason
          OR NEW.restored_at IS DISTINCT FROM OLD.restored_at
          OR NEW.restored_by IS DISTINCT FROM OLD.restored_by) THEN
    RAISE EXCEPTION 'DRIVER_STATE_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$
;
-- [07] public.guard_job_abort_status()
CREATE OR REPLACE FUNCTION public.guard_job_abort_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'aborted' THEN
      RAISE EXCEPTION 'ABORT_STATUS_PROTECTED'
        USING ERRCODE = '42501', HINT = 'A job cannot be created as aborted';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status = 'aborted' OR OLD.status = 'aborted')
     AND COALESCE(current_setting('axentra.abort_workflow', true), '') <> 'on' THEN
    RAISE EXCEPTION 'ABORT_STATUS_PROTECTED'
      USING ERRCODE = '42501',
            HINT = CASE WHEN NEW.status = 'aborted'
                        THEN 'Use Abort Job: it records who confirmed the Abort and when'
                        ELSE 'An aborted job can only be reopened with Reopen job' END;
  END IF;
  RETURN NEW;
END;
$function$
;
-- [07] public.guard_job_driver_writes()
CREATE OR REPLACE FUNCTION public.guard_job_driver_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_closed text[] := ARRAY['completed','cancelled','archived','failed'];
  v_review_gate text[] := ARRAY['pod_ready','delivery_complete'];
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin_or_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Must be the job's assigned driver.
  IF OLD.driver_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.driver_profiles dp
     WHERE dp.id = OLD.driver_id AND dp.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Drivers can only update jobs assigned to them';
  END IF;

  -- Only workflow columns may change; everything else is admin-owned.
  IF (to_jsonb(NEW) - ARRAY['status','has_pickup_inspection','has_delivery_inspection','updated_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','has_pickup_inspection','has_delivery_inspection','updated_at']) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Drivers can only change a job''s workflow status';
  END IF;

  -- Closing (or reopening a closed) job is an admin decision.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status = ANY(v_closed) OR OLD.status = ANY(v_closed)) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Only an admin can move a job to or from ' || NEW.status;
  END IF;

  -- Once a job is awaiting admin review (pod_ready / delivery_complete), a
  -- driver may not move it back out from under that review.
  IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status = ANY(v_review_gate) THEN
    RAISE EXCEPTION 'DRIVER_JOB_WRITE_DENIED'
      USING ERRCODE = '42501', HINT = 'Job is awaiting admin review — only an admin can move it out of ' || OLD.status;
  END IF;

  RETURN NEW;
END;
$function$
;
-- [07] public.guard_one_live_invoice_per_job()
CREATE OR REPLACE FUNCTION public.guard_one_live_invoice_per_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job uuid;
  v_invoice uuid;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.job_id IS NULL OR NEW.status = 'cancelled'
       OR COALESCE(NEW.document_type, 'invoice') <> 'invoice' THEN
      RETURN NEW;
    END IF;
    v_job := NEW.job_id;
    v_invoice := NEW.id;
  ELSE
    IF NEW.job_id IS NULL OR COALESCE(NEW.voided, false) THEN
      RETURN NEW;
    END IF;
    v_job := NEW.job_id;
    v_invoice := NEW.invoice_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || v_job::text, 0));

  IF EXISTS (
       SELECT 1 FROM public.invoices i
        WHERE i.job_id = v_job
          AND i.id IS DISTINCT FROM v_invoice
          AND i.status <> 'cancelled'
          AND COALESCE(i.document_type, 'invoice') = 'invoice')
     OR (TG_TABLE_NAME = 'invoices' AND EXISTS (
       SELECT 1 FROM public.invoice_items ii
        WHERE ii.job_id = v_job
          AND NOT COALESCE(ii.voided, false)
          AND ii.invoice_id IS DISTINCT FROM v_invoice))
  THEN
    RAISE EXCEPTION 'JOB_ALREADY_INVOICED: job % is already on a live invoice', v_job
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$
;
-- [07] public.guard_photo_identity_columns()
CREATE OR REPLACE FUNCTION public.guard_photo_identity_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Owner-run code (definer link triggers, service role) and admins pass.
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin_or_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id THEN
    RAISE EXCEPTION 'PHOTO_IDENTITY_LOCKED'
      USING ERRCODE = '42501', HINT = 'A photo cannot be moved to another job, org or run';
  END IF;
  RETURN NEW;
END;
$function$
;
-- [07] public.guard_user_profile_privileged_columns()
CREATE OR REPLACE FUNCTION public.guard_user_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'super_admin' OR COALESCE(NEW.is_protected, false) THEN
      RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
        USING ERRCODE = '42501', HINT = 'Only a super-admin can create super-admin or protected profiles';
    END IF;
    IF NEW.role = 'client' OR NEW.client_id IS NOT NULL THEN
      RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
        USING ERRCODE = '42501', HINT = 'Client portal users can only be created through the portal invite flow';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.is_protected IS DISTINCT FROM OLD.is_protected THEN
    RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
      USING ERRCODE = '42501', HINT = 'id, auth_user_id, org_id, client_id and is_protected cannot be changed here';
  END IF;

  IF (NEW.role = 'client' OR OLD.role = 'client') AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
      USING ERRCODE = '42501', HINT = 'The client portal role is managed through the portal invite flow';
  END IF;

  IF public.is_admin_or_super_admin() THEN
    IF (NEW.role = 'super_admin' OR OLD.role = 'super_admin')
       AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.account_status IS DISTINCT FROM OLD.account_status) THEN
      RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
        USING ERRCODE = '42501', HINT = 'Only a super-admin can grant, revoke or suspend super-admin';
    END IF;
    IF OLD.is_protected
       AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.account_status IS DISTINCT FROM OLD.account_status) THEN
      RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
        USING ERRCODE = '42501', HINT = 'Protected users can only be changed by a super-admin';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.permissions IS DISTINCT FROM OLD.permissions
     OR NEW.internal_notes IS DISTINCT FROM OLD.internal_notes
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.activated_by IS DISTINCT FROM OLD.activated_by
     OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
     OR NEW.suspended_by IS DISTINCT FROM OLD.suspended_by
     OR NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
      USING ERRCODE = '42501', HINT = 'Only personal details can be changed on your own profile';
  END IF;
  RETURN NEW;
END;
$function$
;
-- [07] public.handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (
    auth_user_id,
    email,
    first_name,
    last_name,
    display_name,
    role,
    org_id,
    account_status
  )
  VALUES (
    NEW.id,
    coalesce(NEW.email, ''),
    nullif(NEW.raw_user_meta_data ->> 'first_name', ''),
    nullif(NEW.raw_user_meta_data ->> 'last_name', ''),
    coalesce(
      nullif(NEW.raw_user_meta_data ->> 'display_name', ''),
      nullif(NEW.raw_user_meta_data ->> 'full_name', ''),
      nullif(NEW.raw_user_meta_data ->> 'name', '')
    ),
    -- role: app_metadata only; default driver.
    CASE
      WHEN lower(coalesce(NEW.raw_app_meta_data ->> 'role', '')) IN ('super_admin', 'superadmin')
        THEN 'super_admin'
      WHEN lower(coalesce(NEW.raw_app_meta_data ->> 'role', '')) = 'admin'
        THEN 'admin'
      ELSE 'driver'
    END,
    -- org_id: app_metadata only (service-set); NULL for self-signups.
    (
      SELECT o.id FROM public.organisations o
      WHERE o.id = nullif(NEW.raw_app_meta_data ->> 'org_id', '')::uuid
      LIMIT 1
    ),
    'pending_activation'
  )
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN NEW;
END;
$function$
;
-- [07] public.inherit_is_test_from_job()
CREATE OR REPLACE FUNCTION public.inherit_is_test_from_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.job_id IS NOT NULL AND NOT NEW.is_test THEN
    NEW.is_test := COALESCE((SELECT j.is_test FROM public.jobs j WHERE j.id = NEW.job_id), false);
  END IF;
  RETURN NEW;
END;
$function$
;
-- [07] public.invoice_lines_guard_lifecycle()
CREATE OR REPLACE FUNCTION public.invoice_lines_guard_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid := CASE WHEN tg_op = 'INSERT' THEN new.invoice_id ELSE old.invoice_id END;
  v_status text;
  v_new jsonb;
  v_old jsonb;
BEGIN
  SELECT i.status INTO v_status FROM public.invoices i WHERE i.id = v_invoice_id;

  -- Parent gone (cascade from deleting a draft) or still a draft: free.
  IF v_status IS NULL OR v_status = 'draft' THEN
    RETURN CASE WHEN tg_op = 'DELETE' THEN old ELSE new END;
  END IF;

  IF tg_op = 'UPDATE' THEN
    v_new := to_jsonb(new) - 'voided';
    v_old := to_jsonb(old) - 'voided';
    IF new.job_id IS NULL THEN
      v_new := v_new - 'job_id'; v_old := v_old - 'job_id';
    END IF;
    IF tg_table_name = 'invoice_expenses' AND (v_new ->> 'expense_id') IS NULL THEN
      v_new := v_new - 'expense_id'; v_old := v_old - 'expense_id';
    END IF;
    IF v_new = v_old THEN
      RETURN new;
    END IF;
  END IF;

  RAISE EXCEPTION 'this invoice has been issued and its lines cannot be changed'
    USING ERRCODE = '23514';
END;
$function$
;
-- [07] public.invoices_guard_lifecycle()
CREATE OR REPLACE FUNCTION public.invoices_guard_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF tg_op = 'DELETE' THEN
    IF old.status <> 'draft' THEN
      RAISE EXCEPTION 'invoice % has been issued and cannot be deleted; cancel it instead', old.invoice_number
        USING ERRCODE = '23514';
    END IF;
    RETURN old;
  END IF;

  -- Stamping sent_at issues the invoice.
  IF old.status = 'draft' AND new.status = 'draft'
     AND old.sent_at IS NULL AND new.sent_at IS NOT NULL THEN
    new.status := 'sent';
  END IF;
  IF new.status = 'sent' AND old.status = 'draft' AND new.sent_at IS NULL THEN
    new.sent_at := now();
  END IF;

  IF old.status = 'draft' THEN
    RETURN new;
  END IF;

  -- Issued: no way back to draft, and a cancelled invoice stays cancelled.
  IF new.status = 'draft' THEN
    RAISE EXCEPTION 'invoice % has been issued and cannot return to draft', old.invoice_number
      USING ERRCODE = '23514';
  END IF;
  IF old.status = 'cancelled' AND new.status <> 'cancelled' THEN
    RAISE EXCEPTION 'invoice % is cancelled and cannot be reopened', old.invoice_number
      USING ERRCODE = '23514';
  END IF;

  -- Issued: the document itself is frozen.
  IF (new.org_id, new.invoice_number, new.document_type, new.client_name, new.issue_date,
      new.line_items, new.subtotal, new.total, new.expenses_total)
     IS DISTINCT FROM
     (old.org_id, old.invoice_number, old.document_type, old.client_name, old.issue_date,
      old.line_items, old.subtotal, old.total, old.expenses_total)
     OR new.job_id IS DISTINCT FROM old.job_id AND new.job_id IS NOT NULL
     OR new.client_id IS DISTINCT FROM old.client_id
     OR new.client_email IS DISTINCT FROM old.client_email
     OR new.client_address IS DISTINCT FROM old.client_address
     OR new.client_company IS DISTINCT FROM old.client_company
     OR new.client_ref IS DISTINCT FROM old.client_ref
     OR new.due_date IS DISTINCT FROM old.due_date
     OR new.vat_rate IS DISTINCT FROM old.vat_rate
     OR new.vat_amount IS DISTINCT FROM old.vat_amount
     OR new.vat_registered IS DISTINCT FROM old.vat_registered
     OR new.notes IS DISTINCT FROM old.notes
     OR new.payment_terms IS DISTINCT FROM old.payment_terms
     OR new.credits_invoice_id IS DISTINCT FROM old.credits_invoice_id
  THEN
    RAISE EXCEPTION 'invoice % has been issued and its contents cannot be changed; cancel it and raise a new one', old.invoice_number
      USING ERRCODE = '23514';
  END IF;

  RETURN new;
END;
$function$
;
-- [07] public.is_admin_or_super_admin()
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('admin', 'super_admin')
      and up.account_status = 'active'
  )
$function$
;
-- [07] public.is_protected_user(p_user_id uuid)
CREATE OR REPLACE FUNCTION public.is_protected_user(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(up.is_protected, false)
  from public.user_profiles up
  where up.auth_user_id = p_user_id
  limit 1
$function$
;
-- [07] public.is_super_admin()
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role = 'super_admin'
      and up.account_status = 'active'
  );
$function$
;
-- [07] public.job_current_run_id(p_job_id uuid)
CREATE OR REPLACE FUNCTION public.job_current_run_id(p_job_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT current_run_id FROM public.jobs WHERE id = p_job_id
$function$
;
-- [07] public.jobs_set_catalogue_image()
CREATE OR REPLACE FUNCTION public.jobs_set_catalogue_image()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT'
     or new.vehicle_make is distinct from old.vehicle_make
     or new.vehicle_model is distinct from old.vehicle_model
     or new.vehicle_year is distinct from old.vehicle_year
     or new.vehicle_colour is distinct from old.vehicle_colour
     or current_setting('axentra.catalogue_backfill', true) = 'on' then
    new.catalogue_image_path := public.resolve_catalogue_image(
      new.vehicle_make, new.vehicle_model, new.vehicle_year, new.vehicle_colour);
  end if;
  if tg_op = 'UPDATE' and current_setting('axentra.catalogue_backfill', true) = 'on' then
    new.updated_at := old.updated_at;
  end if;
  return new;
end $function$
;
-- [07] public.link_corrected_abort_invoice()
CREATE OR REPLACE FUNCTION public.link_corrected_abort_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job uuid;
  v_invoice uuid;
  v_org uuid;
BEGIN
  IF TG_TABLE_NAME='invoice_items' THEN
    IF NEW.job_id IS NULL OR COALESCE(NEW.voided,false) THEN RETURN NEW; END IF;
    v_job:=NEW.job_id;
    v_invoice:=NEW.invoice_id;
  ELSE
    IF NEW.job_id IS NULL OR NEW.status='cancelled'
       OR COALESCE(NEW.document_type,'invoice')<>'invoice' THEN RETURN NEW; END IF;
    v_job:=NEW.job_id;
    v_invoice:=NEW.id;
  END IF;
  SELECT org_id INTO v_org FROM public.invoices
    WHERE id=v_invoice AND status<>'cancelled' AND document_type='invoice';
  IF v_org IS NULL THEN RETURN NEW; END IF;

  UPDATE public.job_abort_invoice_corrections c
    SET replacement_invoice_id=v_invoice
    WHERE c.id = (
      SELECT x.id FROM public.job_abort_invoice_corrections x
      WHERE x.job_id=v_job AND x.org_id=v_org
        AND (x.replacement_invoice_id IS NULL
          OR EXISTS (SELECT 1 FROM public.invoices prev
            WHERE prev.id=x.replacement_invoice_id AND prev.status='cancelled'))
        AND EXISTS (SELECT 1 FROM public.invoices original
          WHERE original.id=x.original_invoice_id AND original.status='cancelled')
        AND x.original_invoice_id<>v_invoice
      ORDER BY x.created_at DESC LIMIT 1
    );
  RETURN NEW;
END;
$function$
;
-- [07] public.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)
CREATE OR REPLACE FUNCTION public.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_client record;
  v_count integer;
begin
  if not public.is_admin_or_super_admin() then
    raise exception 'only admins can link jobs to clients' using errcode = '42501';
  end if;
  if p_client_id is null or p_job_ids is null or cardinality(p_job_ids) = 0 then
    return 0;
  end if;

  select c.id, c.org_id, c.name, c.company, c.email
    into v_client
    from clients c
   where c.id = p_client_id;
  if v_client.id is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  update jobs j
     set client_id      = v_client.id,
         client_company = coalesce(nullif(trim(v_client.company), ''), v_client.name),
         client_name    = v_client.name,
         client_email   = v_client.email
   where j.id = any(p_job_ids)
     and j.org_id = v_client.org_id;
  get diagnostics v_count = row_count;

  update invoices i
     set client_id = v_client.id
   where i.client_id is null
     and i.org_id = v_client.org_id
     and (i.job_id = any(p_job_ids)
          or exists (select 1 from invoice_items it
                      where it.invoice_id = i.id and it.job_id = any(p_job_ids)));

  return v_count;
end;
$function$
;
-- [07] public.link_photo_to_inspection_on_insert()
CREATE OR REPLACE FUNCTION public.link_photo_to_inspection_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inspection_type text;
  v_inspection_id uuid;
begin
  -- Only act when inspection_id is not already set
  if new.inspection_id is not null then
    return new;
  end if;

  -- Map photo.type -> inspection.type when possible
  if new.type like 'pickup%' then
    v_inspection_type := 'pickup';
  elsif new.type like 'delivery%' then
    v_inspection_type := 'delivery';
  else
    v_inspection_type := null;
  end if;

  -- Prefer matching inspection type when we can
  if v_inspection_type is not null then
    select i.id into v_inspection_id
    from public.inspections i
    where i.job_id = new.job_id
      and i.type = v_inspection_type
    order by i.inspected_at desc nulls last, i.created_at desc
    limit 1;
  else
    v_inspection_id := null;
  end if;

  -- Fallback: link to latest inspection for the job
  if v_inspection_id is null then
    select i.id into v_inspection_id
    from public.inspections i
    where i.job_id = new.job_id
    order by i.inspected_at desc nulls last, i.created_at desc
    limit 1;
  end if;

  if v_inspection_id is not null then
    update public.photos p
      set inspection_id = v_inspection_id
    where p.id = new.id;
  end if;

  return new;
end;
$function$
;
-- [07] public.link_photo_to_inspection_on_update()
CREATE OR REPLACE FUNCTION public.link_photo_to_inspection_on_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inspection_type text;
  v_inspection_id uuid;
begin
  -- Only attempt if inspection_id is null after the update
  if new.inspection_id is not null then
    return new;
  end if;

  -- Determine mapped inspection type based on new.type
  if new.type like 'pickup%' then
    v_inspection_type := 'pickup';
  elsif new.type like 'delivery%' then
    v_inspection_type := 'delivery';
  else
    v_inspection_type := null;
  end if;

  -- Prefer matching inspection type when possible
  if v_inspection_type is not null then
    select i.id into v_inspection_id
    from public.inspections i
    where i.job_id = new.job_id
      and i.type = v_inspection_type
    order by i.inspected_at desc nulls last, i.created_at desc
    limit 1;
  else
    v_inspection_id := null;
  end if;

  -- Fallback to latest inspection for the job
  if v_inspection_id is null then
    select i.id into v_inspection_id
    from public.inspections i
    where i.job_id = new.job_id
    order by i.inspected_at desc nulls last, i.created_at desc
    limit 1;
  end if;

  if v_inspection_id is not null then
    update public.photos p
      set inspection_id = v_inspection_id
    where p.id = new.id;
  end if;

  return new;
end;
$function$
;
-- [07] public.link_unlinked_photos_to_inspection(p_job_id uuid, p_org_
CREATE OR REPLACE FUNCTION public.link_unlinked_photos_to_inspection(p_job_id uuid, p_org_id uuid, p_inspection_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_target_inspection_id uuid;
begin
  if p_inspection_type not in ('pickup','delivery') then
    return;
  end if;

  select i.id
    into v_target_inspection_id
  from public.inspections i
  where i.job_id = p_job_id
    and i.type = p_inspection_type
  order by i.inspected_at desc nulls last, i.created_at desc
  limit 1;

  if v_target_inspection_id is null then
    return;
  end if;

  if p_inspection_type = 'pickup' then
    update public.photos p
      set inspection_id = v_target_inspection_id,
          updated_at = now()
    where p.inspection_id is null
      and p.job_id = p_job_id
      and p.org_id = p_org_id
      and (
        p.type like 'pickup%'
        or p.type = 'damage_close_up'
      );

  elsif p_inspection_type = 'delivery' then
    update public.photos p
      set inspection_id = v_target_inspection_id,
          updated_at = now()
    where p.inspection_id is null
      and p.job_id = p_job_id
      and p.org_id = p_org_id
      and p.type like 'delivery%';
  end if;

end;
$function$
;
-- [07] public.next_job_number()
CREATE OR REPLACE FUNCTION public.next_job_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_super_admin() OR public.user_org_id() IS NOT NULL) THEN
    RAISE EXCEPTION 'not authorised to allocate job numbers'
      USING ERRCODE = '42501';
  END IF;
  RETURN 'AX' || LPAD(nextval('public.job_number_seq')::text, 4, '0');
END;
$function$
;
-- [07] public.normalize_client_name(input text)
CREATE OR REPLACE FUNCTION public.normalize_client_name(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select regexp_replace(
    lower(trim(coalesce(input, ''))),
    '[^a-z0-9]+',
    '',
    'g'
  );
$function$
;
-- [07] public.notify_customer_job_aborted(p_abort_id uuid)
CREATE OR REPLACE FUNCTION public.notify_customer_job_aborted(p_abort_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_abort  public.job_aborts%ROWTYPE;
  v_job    record;
  v_queued uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_abort FROM public.job_aborts WHERE id = p_abort_id FOR UPDATE;
  IF v_abort.id IS NULL OR NOT (public.is_super_admin() OR v_abort.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'ABORT_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  SELECT id, status, client_id INTO v_job FROM public.jobs WHERE id = v_abort.job_id;
  IF v_abort.reopened_at IS NOT NULL OR v_job.status <> 'aborted' THEN
    RAISE EXCEPTION 'ABORT_NOT_CURRENT' USING ERRCODE = '23514', HINT = 'This job is no longer aborted';
  END IF;
  IF v_job.client_id IS NULL THEN
    RAISE EXCEPTION 'NO_LINKED_CLIENT'
      USING ERRCODE = '23514', HINT = 'Link the job to a client before notifying them';
  END IF;

  -- At most once per job (customer_notifications_job_event_key): a second press is a no-op.
  INSERT INTO public.customer_notifications (org_id, job_id, client_id, event)
  VALUES (v_abort.org_id, v_abort.job_id, v_job.client_id, 'aborted')
  ON CONFLICT (job_id, event) DO NOTHING
  RETURNING id INTO v_queued;

  IF v_queued IS NOT NULL THEN
    UPDATE public.job_aborts SET customer_notified_at = now(), customer_notified_by = v_uid
     WHERE id = p_abort_id;
    INSERT INTO public.job_abort_events (org_id, job_id, abort_id, actor_id, action)
    VALUES (v_abort.org_id, v_abort.job_id, v_abort.id, v_uid, 'customer_notified');
  END IF;

  RETURN jsonb_build_object('queued', v_queued IS NOT NULL, 'alreadyQueued', v_queued IS NULL);
END;
$function$
;
-- [07] public.portal_can_read_invoice_pdf(p_object_name text)
CREATE OR REPLACE FUNCTION public.portal_can_read_invoice_pdf(p_object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_object_name IS NOT NULL
     AND public.portal_client_id() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.invoices i
       JOIN public.clients c ON c.id = i.client_id
       WHERE i.pdf_url = p_object_name
         AND i.client_id = public.portal_client_id()
         AND i.org_id = c.org_id
         AND i.is_test = false -- test data
         AND i.sent_at IS NOT NULL
     )
$function$
;
-- [07] public.portal_client_id()
CREATE OR REPLACE FUNCTION public.portal_client_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT up.client_id
  FROM public.user_profiles up
  JOIN public.clients c ON c.id = up.client_id
  WHERE up.auth_user_id = auth.uid()
    AND up.role = 'client'
    AND up.org_id IS NULL
    AND up.account_status = 'active'
    AND c.is_active = true
  LIMIT 1
$function$
;
-- [07] public.portal_context()
CREATE OR REPLACE FUNCTION public.portal_context()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid uuid := public.portal_client_id();
  v jsonb;
BEGIN
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'client', jsonb_build_object('id', c.id, 'name', COALESCE(NULLIF(c.trading_name, ''), NULLIF(c.company, ''), c.name)),
    'operator', jsonb_build_object(
      'name', COALESCE(NULLIF(o.branding_name, ''), o.name),
      'logo_url', o.logo_url,
      'primary_colour', o.primary_colour,
      'contact_email', o.main_contact_email,
      'contact_phone', o.main_contact_phone
    )
  )
  INTO v
  FROM public.clients c
  JOIN public.organisations o ON o.id = c.org_id
  WHERE c.id = v_cid;
  RETURN v;
END;
$function$
;
-- [07] public.portal_get_invoice(p_invoice_id uuid)
CREATE OR REPLACE FUNCTION public.portal_get_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid uuid := public.portal_client_id();
  v_org uuid;
  v jsonb;
BEGIN
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM public.clients WHERE id = v_cid;

  SELECT jsonb_build_object(
    'id', inv.id,
    'invoice_number', inv.invoice_number,
    'issue_date', inv.issue_date,
    'due_date', inv.due_date,
    'payment_terms', inv.payment_terms,
    'client_name', inv.client_name,
    'client_company', inv.client_company,
    'client_email', inv.client_email,
    'client_address', inv.client_address,
    'notes', inv.notes,
    'subtotal', inv.subtotal,
    'vat_rate', inv.vat_rate,
    'vat_amount', inv.vat_amount,
    'total', inv.total,
    'sent_at', inv.sent_at,
    'status', inv.status,
    'document_type', inv.document_type,
    'paid_at', inv.paid_at,
    'client_ref', inv.client_ref,
    'vat_registered', inv.vat_registered,
    -- The storage path itself stays server-side knowledge the client does
    -- not need to guess: it is returned only so the portal can download
    -- the object, and the storage policy below is what authorises that.
    'pdf_path', inv.pdf_url,
    'credits_invoice_number', (SELECT o.invoice_number FROM public.invoices o
                               WHERE o.id = inv.credits_invoice_id AND o.client_id = v_cid),
    'job_ref', (SELECT COALESCE(NULLIF(j.external_job_number, ''), upper(left(j.id::text, 8)))
                FROM public.jobs j WHERE j.id = inv.job_id AND j.client_id = v_cid),
    'vehicle_reg', (SELECT j.vehicle_reg FROM public.jobs j WHERE j.id = inv.job_id AND j.client_id = v_cid),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'description', it.description,
        'quantity', it.quantity,
        'unit_price', it.unit_price,
        'amount', it.amount
      ) ORDER BY it.sort_order)
      FROM public.invoice_items it
      WHERE it.invoice_id = inv.id
    ), '[]'::jsonb),
    'line_items', inv.line_items,
    'operator', jsonb_build_object(
      'name', COALESCE(NULLIF(o.branding_name, ''), o.name),
      'legal_name', o.legal_name,
      'logo_url', o.logo_url,
      'registered_address', o.registered_address,
      'vat_number', o.vat_number,
      'company_number', o.company_number,
      'bank_name', o.bank_name,
      'bank_account_name', o.bank_account_name,
      'bank_sort_code', o.bank_sort_code,
      'bank_account_number', o.bank_account_number,
      'late_payment_notice', o.late_payment_notice
    )
  )
  INTO v
  FROM public.invoices inv
  JOIN public.organisations o ON o.id = inv.org_id
  WHERE inv.id = p_invoice_id
    AND inv.client_id = v_cid
    AND inv.org_id = v_org
    AND inv.is_test = false -- test data
    AND inv.sent_at IS NOT NULL;

  IF v IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN v;
END;
$function$
;
-- [07] public.portal_get_job(p_job_id uuid)
CREATE OR REPLACE FUNCTION public.portal_get_job(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid uuid := public.portal_client_id();
  v_org uuid;
  v_job jsonb;
BEGIN
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM public.clients WHERE id = v_cid;

  SELECT jsonb_build_object(
    'id', j.id,
    'job_ref', COALESCE(NULLIF(j.external_job_number, ''), upper(left(j.id::text, 8))),
    'vehicle_reg', j.vehicle_reg,
    'vehicle_make', j.vehicle_make,
    'vehicle_model', j.vehicle_model,
    'vehicle_colour', j.vehicle_colour,
    'vehicle_year', j.vehicle_year,
    'pickup_address_line1', j.pickup_address_line1,
    'pickup_address_line2', j.pickup_address_line2,
    'pickup_city', j.pickup_city,
    'pickup_postcode', j.pickup_postcode,
    'pickup_contact_name', j.pickup_contact_name,
    'delivery_address_line1', j.delivery_address_line1,
    'delivery_address_line2', j.delivery_address_line2,
    'delivery_city', j.delivery_city,
    'delivery_postcode', j.delivery_postcode,
    'delivery_contact_name', j.delivery_contact_name,
    'job_date', j.job_date,
    'earliest_delivery_date', j.earliest_delivery_date,
    'status', j.status,
    'created_at', j.created_at,
    'completed_at', j.completed_at
  )
  INTO v_job
  FROM public.jobs j
  WHERE j.id = p_job_id
    AND j.client_id = v_cid
    AND j.org_id = v_org
    AND j.is_hidden = false
    AND j.is_test = false -- test data
    AND j.status NOT IN ('draft', 'archived');

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'job', v_job,
    'timeline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', l.to_status, 'at', l.created_at) ORDER BY l.created_at)
      FROM public.job_activity_log l
      WHERE l.job_id = p_job_id AND l.to_status IS NOT NULL
    ), '[]'::jsonb),
    'inspections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type', i.type,
        'inspected_at', i.inspected_at,
        'odometer', i.odometer,
        'fuel_level_percent', i.fuel_level_percent,
        'number_of_keys', i.number_of_keys,
        'customer_name', i.customer_name,
        'inspected_by_name', i.inspected_by_name,
        'notes', i.notes,
        'has_damage', i.has_damage,
        'damage', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'area', d.area, 'location', d.location, 'item', d.item,
            'damage_types', d.damage_types, 'notes', d.notes
          ) ORDER BY d.created_at)
          FROM public.damage_items d
          WHERE d.inspection_id = i.id AND d.archived_at IS NULL
        ), '[]'::jsonb)
      ) ORDER BY i.inspected_at NULLS LAST)
      FROM public.inspections i
      WHERE i.job_id = p_job_id AND i.archived_at IS NULL
    ), '[]'::jsonb)
  );
END;
$function$
;
-- [07] public.portal_list_invoices()
CREATE OR REPLACE FUNCTION public.portal_list_invoices()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid uuid := public.portal_client_id();
  v_org uuid;
BEGIN
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM public.clients WHERE id = v_cid;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', inv.id,
      'invoice_number', inv.invoice_number,
      'issue_date', inv.issue_date,
      'due_date', inv.due_date,
      'subtotal', inv.subtotal,
      'vat_amount', inv.vat_amount,
      'total', inv.total,
      'sent_at', inv.sent_at,
      'status', inv.status,
      'document_type', inv.document_type,
      'paid_at', inv.paid_at
    ) ORDER BY inv.issue_date DESC, inv.created_at DESC)
    FROM public.invoices inv
    WHERE inv.client_id = v_cid
      AND inv.org_id = v_org
      AND inv.is_test = false -- test data
      AND inv.sent_at IS NOT NULL
  ), '[]'::jsonb);
END;
$function$
;
-- [07] public.portal_list_jobs()
CREATE OR REPLACE FUNCTION public.portal_list_jobs()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cid uuid := public.portal_client_id();
  v_org uuid;
BEGIN
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'PORTAL_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  SELECT org_id INTO v_org FROM public.clients WHERE id = v_cid;
  RETURN COALESCE((
    SELECT jsonb_agg(to_jsonb(t) ORDER BY t.sort_at DESC)
    FROM (
      SELECT
        j.id,
        COALESCE(NULLIF(j.external_job_number, ''), upper(left(j.id::text, 8))) AS job_ref,
        j.vehicle_reg, j.vehicle_make, j.vehicle_model, j.vehicle_colour,
        j.pickup_city, j.pickup_postcode,
        j.delivery_city, j.delivery_postcode,
        j.job_date, j.status, j.created_at, j.completed_at,
        COALESCE(j.completed_at, j.created_at) AS sort_at
      FROM public.jobs j
      WHERE j.client_id = v_cid
        AND j.org_id = v_org
        AND j.is_hidden = false
        AND j.is_test = false -- test data
        AND j.status NOT IN ('draft', 'archived')
      ORDER BY sort_at DESC
      LIMIT 500
    ) t
  ), '[]'::jsonb);
END;
$function$
;
-- [07] public.qr_confirm(p_token text, p_customer_name text, p_notes t
CREATE OR REPLACE FUNCTION public.qr_confirm(p_token text, p_customer_name text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'NAME_REQUIRED');
  END IF;
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  UPDATE public.qr_confirmations
     SET confirmed_at = now(),
         customer_name = btrim(p_customer_name),
         notes = NULLIF(btrim(COALESCE(p_notes, '')), '')
   WHERE token = p_token
     AND confirmed_at IS NULL
     AND expires_at >= now()
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  RETURN jsonb_build_object('status', 'done');
END;
$function$
;
-- [07] public.qr_lookup(p_token text)
CREATE OR REPLACE FUNCTION public.qr_lookup(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v public.qr_confirmations%ROWTYPE;
  v_ref text;
  v_reg text;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v FROM public.qr_confirmations WHERE token = p_token LIMIT 1;
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  -- test data: a test job's QR link behaves as if it does not exist
  IF EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = v.job_id AND j.is_test) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'done');
  END IF;
  IF v.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  SELECT COALESCE(NULLIF(j.external_job_number, ''), left(v.job_id::text, 8)),
         j.vehicle_reg
    INTO v_ref, v_reg
    FROM public.jobs j WHERE j.id = v.job_id;

  RETURN jsonb_build_object(
    'status', 'ready',
    'event_type', v.event_type,
    'job_ref', v_ref,
    'vehicle_reg', v_reg
  );
END;
$function$
;
-- [07] public.reopen_job(p_job_id uuid, p_notes text)
CREATE OR REPLACE FUNCTION public.reopen_job(p_job_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_from_status text;
  v_new_run uuid := gen_random_uuid();
  v_abort_id uuid;
BEGIN
  -- Reopening archives every inspection, damage item and photo on the job, so
  -- it is an admin action.
  IF auth.uid() IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501',
            HINT = 'Only an admin or super-admin can reopen a job';
  END IF;

  SELECT org_id, status INTO v_org_id, v_from_status
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL OR NOT (public.is_super_admin() OR v_org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  IF v_from_status = 'aborted' THEN
    -- A billed Abort stays as it is: reopening would leave an invoice for a job that is
    -- running again. Book a linked replacement job instead.
    PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || p_job_id::text, 0));
    IF EXISTS (SELECT 1 FROM public.invoice_items ii
                WHERE ii.job_id = p_job_id AND NOT COALESCE(ii.voided, false))
       OR EXISTS (SELECT 1 FROM public.invoices i
                   WHERE i.job_id = p_job_id AND i.status <> 'cancelled'
                     AND COALESCE(i.document_type, 'invoice') = 'invoice') THEN
      RAISE EXCEPTION 'ABORT_INVOICED'
        USING ERRCODE = '23514',
              HINT = 'This Abort has been invoiced. Create a linked replacement job instead of reopening';
    END IF;

    UPDATE public.job_aborts SET reopened_at = now(), reopened_by = auth.uid()
     WHERE job_id = p_job_id AND reopened_at IS NULL
     RETURNING id INTO v_abort_id;

    IF v_abort_id IS NOT NULL THEN
      INSERT INTO public.job_abort_events (org_id, job_id, abort_id, actor_id, action, note)
      VALUES (v_org_id, p_job_id, v_abort_id, auth.uid(), 'reopened', left(p_notes, 500));
    END IF;
  END IF;

  -- Any request left over from the previous run no longer applies.
  UPDATE public.job_abort_requests
     SET status = 'superseded', resolved_at = now(), resolved_by = auth.uid()
   WHERE job_id = p_job_id AND status = 'pending';

  -- Soft-archive all currently-active evidence
  UPDATE public.inspections SET archived_at = now()
   WHERE job_id = p_job_id AND archived_at IS NULL;

  UPDATE public.damage_items SET archived_at = now()
   WHERE archived_at IS NULL
     AND inspection_id IN (SELECT id FROM public.inspections WHERE job_id = p_job_id);

  UPDATE public.photos SET archived_at = now()
   WHERE job_id = p_job_id AND archived_at IS NULL;

  PERFORM set_config('axentra.abort_workflow', 'on', true);
  UPDATE public.jobs
     SET status = 'ready_for_pickup',
         has_pickup_inspection = false,
         has_delivery_inspection = false,
         completed_at = NULL,
         current_run_id = v_new_run,
         updated_at = now()
   WHERE id = p_job_id;
  PERFORM set_config('axentra.abort_workflow', 'off', true);

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (p_job_id, v_org_id, 'job_reopened', v_from_status, 'ready_for_pickup',
          COALESCE(p_notes, 'Reopened — previous inspection evidence archived'));

  RETURN jsonb_build_object('runId', v_new_run, 'fromStatus', v_from_status);
END
$function$
;
-- [07] public.request_job_abort(p_job_id uuid)
CREATE OR REPLACE FUNCTION public.request_job_abort(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_job       record;
  v_driver_id uuid;
  v_existing  public.job_abort_requests%ROWTYPE;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Active driver profile of an active account.
  SELECT dp.id INTO v_driver_id
    FROM public.driver_profiles dp
    JOIN public.user_profiles up ON up.auth_user_id = dp.user_id
   WHERE dp.user_id = v_uid AND up.account_status = 'active'
   LIMIT 1;

  SELECT id, org_id, status, driver_id, current_run_id, has_pickup_inspection, is_hidden
    INTO v_job
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  -- Same answer for "no such job" and "not your job": never confirm another job exists.
  IF v_job.id IS NULL OR v_driver_id IS NULL OR v_job.driver_id IS DISTINCT FROM v_driver_id THEN
    RAISE EXCEPTION 'ABORT_REQUEST_DENIED'
      USING ERRCODE = '42501', HINT = 'Only the driver assigned to this job can request an Abort';
  END IF;

  IF v_job.status = 'aborted' THEN
    RAISE EXCEPTION 'JOB_ALREADY_ABORTED' USING ERRCODE = '23514', HINT = 'This job has already been aborted';
  END IF;

  IF v_job.is_hidden OR NOT (v_job.status = ANY (public.abort_eligible_statuses()))
     OR COALESCE(v_job.has_pickup_inspection, false) THEN
    RAISE EXCEPTION 'ABORT_NOT_ELIGIBLE'
      USING ERRCODE = '23514', HINT = 'An Abort can only be requested before the vehicle is collected';
  END IF;

  SELECT * INTO v_existing FROM public.job_abort_requests
   WHERE job_id = p_job_id AND status = 'pending';
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('requestId', v_existing.id, 'status', 'pending',
                              'requestedAt', v_existing.requested_at, 'duplicate', true);
  END IF;

  INSERT INTO public.job_abort_requests (org_id, job_id, run_id, driver_id, requested_by)
  VALUES (v_job.org_id, p_job_id, v_job.current_run_id, v_driver_id, v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.job_abort_events (org_id, job_id, request_id, actor_id, action)
  VALUES (v_job.org_id, p_job_id, v_id, v_uid, 'requested');

  INSERT INTO public.job_activity_log (job_id, org_id, action, notes)
  VALUES (p_job_id, v_job.org_id, 'abort_requested', 'Driver requested an Abort');

  RETURN jsonb_build_object('requestId', v_id, 'status', 'pending', 'requestedAt', now(), 'duplicate', false);
END;
$function$
;
-- [07] public.resolve_catalogue_image(p_make text, p_model text, p_yea
CREATE OR REPLACE FUNCTION public.resolve_catalogue_image(p_make text, p_model text, p_year text, p_colour text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_make text := public.vehicle_name_norm(p_make);
  v_model text := public.vehicle_name_norm(p_model);
  v_year int := substring(coalesce(p_year, '') from '(?:19|20)[0-9]{2}')::int;
  v_colour text := public.vehicle_name_norm(p_colour);
begin
  if v_make is null or v_model is null or v_year is null then
    return null;
  end if;
  v_make := public.canonical_make(v_make);

  -- strip a repeated make from the start of the model ("BMW X5" -> "X5")
  if v_model like v_make || ' %' then
    v_model := substr(v_model, length(v_make) + 2);
  end if;

  return (
    select c.image_path
    from public.vehicle_catalogue_images c
    where public.vehicle_name_norm(c.make) = v_make
      and v_year between c.year_from and c.year_to
      and (v_model = public.vehicle_name_norm(c.model)
           or v_model like public.vehicle_name_norm(c.model) || ' %')
    order by length(public.vehicle_name_norm(c.model)) desc,
             (public.vehicle_name_norm(c.colour) = v_colour) desc,
             c.created_at
    limit 1
  );
end $function$
;
-- [07] public.restore_driver_profile(p_target_user_id uuid, p_restore_
CREATE OR REPLACE FUNCTION public.restore_driver_profile(p_target_user_id uuid, p_restore_note text DEFAULT NULL::text, p_reactivate_account boolean DEFAULT false)
 RETURNS public.driver_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_profile public.user_profiles;
  v_driver public.driver_profiles;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select *
    into v_profile
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if v_profile.auth_user_id is null then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if v_profile.role <> 'driver' then
    raise exception 'NOT_A_DRIVER';
  end if;

  if not public.can_actor_manage_target_user(v_actor, p_target_user_id)
     and not public.is_super_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  update public.driver_profiles
  set
    archived_at = null,
    archived_by = null,
    archive_reason = null,
    restored_at = now(),
    restored_by = v_actor,
    restore_note = p_restore_note,
    is_active = true
  where user_id = p_target_user_id
  returning * into v_driver;

  if v_driver.id is null then
    raise exception 'DRIVER_PROFILE_NOT_FOUND';
  end if;

  if p_reactivate_account then
    update public.user_profiles
    set
      account_status = 'active',
      activated_at = now(),
      activated_by = v_actor,
      suspended_at = null,
      suspended_by = null,
      suspension_reason = null,
      updated_at = now()
    where auth_user_id = p_target_user_id;
  end if;

  insert into public.admin_audit_log (
    performed_by,
    performed_by_email,
    action,
    target_user_id,
    target_org_id,
    before_state,
    after_state
  )
  values (
    v_actor,
    public.current_actor_email(),
    'restore_driver_profile',
    p_target_user_id,
    v_profile.org_id,
    jsonb_build_object('archived_at', 'not_null', 'is_active', false),
    jsonb_build_object(
      'archived_at', null,
      'is_active', true,
      'restore_note', p_restore_note,
      'reactivate_account', p_reactivate_account
    )
  );

  return v_driver;
end;
$function$
;
-- [07] public.review_job_abort_claim(p_abort_id uuid, p_decision text,
CREATE OR REPLACE FUNCTION public.review_job_abort_claim(p_abort_id uuid, p_decision text, p_amount numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text, p_client_confirmed boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_abort  public.job_aborts%ROWTYPE;
  v_amount numeric;
  v_note   text := left(NULLIF(btrim(COALESCE(p_note, '')), ''), 500);
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'ADMIN_OR_SUPER_ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_abort FROM public.job_aborts WHERE id = p_abort_id FOR UPDATE;
  IF v_abort.id IS NULL OR NOT (public.is_super_admin() OR v_abort.org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'ABORT_NOT_FOUND' USING ERRCODE = '02000';
  END IF;
  IF v_abort.reopened_at IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT_REOPENED'
      USING ERRCODE = '23514', HINT = 'The job was reopened, so this Abort can no longer be claimed';
  END IF;

  -- Serialise with the invoicing guard, then refuse to change a claim that is billed.
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || v_abort.job_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.invoice_items ii
              WHERE ii.job_id = v_abort.job_id AND NOT COALESCE(ii.voided, false))
     OR EXISTS (SELECT 1 FROM public.invoices i
                 WHERE i.job_id = v_abort.job_id AND i.status <> 'cancelled'
                   AND COALESCE(i.document_type, 'invoice') = 'invoice') THEN
    RAISE EXCEPTION 'ABORT_CLAIM_INVOICED'
      USING ERRCODE = '23514', HINT = 'Cancel the invoice before changing this Abort fee';
  END IF;

  -- Finance review is final. Repeated Approve/Reject calls must never rewrite
  -- the first approver, reviewed_at, approved_amount or audit history.
  -- Explicit super-admin corrections use amend_approved_job_abort_claim().
  IF v_abort.finance_status <> 'pending_review' THEN
    RAISE EXCEPTION 'ABORT_CLAIM_ALREADY_REVIEWED'
      USING ERRCODE = '23514',
            HINT = 'This fee decision is final. A super admin must use the audited amendment action';
  END IF;
  IF p_decision = 'approved' THEN
    IF p_client_confirmed IS NOT TRUE THEN
      RAISE EXCEPTION 'CLIENT_FEE_CONFIRMATION_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF p_amount IS NOT NULL AND p_amount <> round(p_amount, 2) THEN
      RAISE EXCEPTION 'INVALID_AMOUNT'
        USING ERRCODE='23514', HINT='Client-agreed fees must be in pounds and pence';
    END IF;
    v_amount := COALESCE(p_amount, v_abort.proposed_amount);
    IF v_amount IS NULL THEN
      RAISE EXCEPTION 'AMOUNT_REQUIRED'
        USING ERRCODE = '23514', HINT = 'The agreed price is unknown, so enter the approved amount';
    END IF;
    v_amount := round(v_amount, 2);
    IF v_amount < 0 THEN
      RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
    END IF;
  ELSE
    v_amount := NULL;
  END IF;

  UPDATE public.job_aborts
     SET finance_status = p_decision, approved_amount = v_amount,
         reviewed_by = v_uid, reviewed_at = now(), review_note = v_note,
         client_fee_confirmed_by = CASE WHEN p_decision = 'approved' THEN v_uid ELSE NULL END,
         client_fee_confirmed_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
         client_fee_confirmed_amount = CASE WHEN p_decision = 'approved' THEN v_amount ELSE NULL END
   WHERE id = p_abort_id
   RETURNING * INTO v_abort;

  INSERT INTO public.job_abort_events (org_id, job_id, abort_id, actor_id, action, finance_status, amount, note)
  VALUES (v_abort.org_id, v_abort.job_id, v_abort.id, v_uid,
          CASE WHEN p_decision = 'approved' THEN 'claim_approved' ELSE 'claim_rejected' END,
          p_decision, v_amount,
          CASE WHEN p_decision = 'approved' THEN
            concat('Admin attests client confirmed £', v_amount::text, '; ', COALESCE(v_note, ''))
            ELSE v_note END);

  RETURN jsonb_build_object('abortId', v_abort.id, 'financeStatus', v_abort.finance_status,
                            'approvedAmount', v_abort.approved_amount, 'reviewedAt', v_abort.reviewed_at,
                            'clientConfirmedAt', v_abort.client_fee_confirmed_at);
END;
$function$
;
-- [07] public.role_rank(p_role text)
CREATE OR REPLACE FUNCTION public.role_rank(p_role text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_role = 'driver' then 1
    when p_role = 'admin' then 2
    when p_role = 'super_admin' then 3
    else 0
  end
$function$
;
-- [07] public.rollback_inspection_submission(p_job_id uuid, p_submissi
CREATE OR REPLACE FUNCTION public.rollback_inspection_submission(p_job_id uuid, p_submission_session_id uuid, p_reason text DEFAULT NULL::text)
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
$function$
;
-- [07] public.same_org_as_target(target_org_id uuid)
CREATE OR REPLACE FUNCTION public.same_org_as_target(target_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_super_admin()
      or exists (
        select 1
        from public.user_profiles me
        where me.auth_user_id = auth.uid()
          and me.org_id = target_org_id
          and me.role in ('admin', 'super_admin')
      )
$function$
;
-- [07] public.set_driver_digital_id_photo(p_user_id uuid, p_photo_path
CREATE OR REPLACE FUNCTION public.set_driver_digital_id_photo(p_user_id uuid, p_photo_path text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$
DECLARE
  v_actor public.user_profiles%ROWTYPE;
  v_credential public.driver_digital_credentials%ROWTYPE;
BEGIN
  SELECT * INTO v_actor FROM public.user_profiles WHERE auth_user_id = auth.uid();
  IF NOT FOUND OR v_actor.account_status <> 'active'
     OR v_actor.role NOT IN ('admin','super_admin') THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_credential FROM public.driver_digital_credentials
    WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR
     (v_actor.role <> 'super_admin' AND
       (v_actor.org_id IS NULL OR v_actor.org_id IS DISTINCT FROM v_credential.org_id)) THEN
    RAISE EXCEPTION 'NOT_AUTHORISED' USING ERRCODE = '42501';
  END IF;
  IF p_photo_path IS NOT NULL THEN
    IF v_credential.org_id IS NULL
       OR position(v_credential.org_id::text || '/' || p_user_id::text || '/' IN p_photo_path) <> 1
       OR NOT EXISTS (
          SELECT 1 FROM storage.objects WHERE bucket_id='digital-id-photos'
          AND name = p_photo_path
       ) THEN
      RAISE EXCEPTION 'INVALID_PHOTO_PATH' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_credential.photo_path IS NOT DISTINCT FROM p_photo_path THEN RETURN; END IF;
  UPDATE public.driver_digital_credentials
    SET photo_path = p_photo_path, updated_at = now() WHERE id = v_credential.id;
  INSERT INTO public.driver_digital_credential_events
    (credential_id, actor_user_id, event_type, credential_version, details)
  VALUES (v_credential.id, auth.uid(), 'photo_updated',
          v_credential.credential_version,
          jsonb_build_object('has_photo', p_photo_path IS NOT NULL));
END;
$function$
;
-- [07] public.set_evidence_org_from_job()
CREATE OR REPLACE FUNCTION public.set_evidence_org_from_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  SELECT j.org_id INTO NEW.org_id FROM public.jobs j WHERE j.id = NEW.job_id;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'EVIDENCE_JOB_NOT_FOUND' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$function$
;
-- [07] public.set_photo_org_from_job()
CREATE OR REPLACE FUNCTION public.set_photo_org_from_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    SELECT j.org_id INTO NEW.org_id FROM public.jobs j WHERE j.id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$function$
;
-- [07] public.set_updated_at()
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
-- [07] public.stamp_client_log_identity()
CREATE OR REPLACE FUNCTION public.stamp_client_log_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$
;
-- [07] public.submit_inspection(p_job_id uuid, p_type text, p_inspecti
CREATE OR REPLACE FUNCTION public.submit_inspection(p_job_id uuid, p_type text, p_inspection jsonb, p_damage_items jsonb, p_submission_session_id uuid DEFAULT NULL::uuid)
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
  v_driver_id uuid;
  v_inspection_id uuid;
  v_to_status text;
  v_damage_ids uuid[] := ARRAY[]::uuid[];
  v_item jsonb;
  v_ord bigint;
  v_new_id uuid;
  v_idempotent_id uuid;
  v_idempotent_damage_ids uuid[];
  v_blocking_job_id uuid;
  v_blocking_job_ref text;
  v_blocking_statuses text[] := ARRAY[
    'pickup_complete','in_transit','delivery_in_progress',
    'delivery_complete','pod_ready','completed'
  ];
  v_in_progress_statuses text[] := ARRAY['pickup_in_progress','delivery_in_progress'];
  v_non_actionable_statuses text[] := ARRAY['draft','incomplete','cancelled','failed'];
BEGIN
  IF p_type NOT IN ('pickup','delivery') THEN
    RAISE EXCEPTION 'INVALID_TYPE' USING ERRCODE = '22023';
  END IF;

  -- ── Idempotency short-circuit ──────────────────────────────────
  IF p_submission_session_id IS NOT NULL THEN
    SELECT id INTO v_idempotent_id
      FROM public.inspections
     WHERE submission_session_id = p_submission_session_id
       AND archived_at IS NULL
     LIMIT 1;

    IF v_idempotent_id IS NOT NULL THEN
      SELECT COALESCE(
               array_agg(id ORDER BY submission_index NULLS LAST, created_at, id),
               ARRAY[]::uuid[]
             )
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

  SELECT org_id, status, has_pickup_inspection, current_run_id, driver_id
    INTO v_org_id, v_current_status, v_has_pickup, v_run_id, v_driver_id
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  -- ── WORKFLOW-003: only the assigned driver (or an admin/super-admin) may
  -- submit an inspection for this job. An unassigned job (v_driver_id IS
  -- NULL) has no legitimate assigned driver yet, so non-admins are rejected.
  IF NOT public.is_admin_or_super_admin() THEN
    IF v_driver_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.driver_profiles dp
      WHERE dp.id = v_driver_id AND dp.user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'NOT_ASSIGNED_DRIVER'
        USING ERRCODE = '42501',
              HINT = 'Only the assigned driver or an admin can submit this inspection';
    END IF;
  END IF;

  -- ── Idempotency re-check under the job lock ──────────────────────
  -- The short-circuit above runs before FOR UPDATE, so two concurrent calls
  -- with the same session id (e.g. the offline drainer replaying while the
  -- original request is still in flight) both miss it; the loser then waits
  -- on the lock, finds the winner's committed inspection and used to raise
  -- INSPECTION_ALREADY_SUBMITTED for a submission that had in fact succeeded.
  -- Re-checking here, after the lock, turns that into a clean replay.
  IF p_submission_session_id IS NOT NULL THEN
    SELECT id INTO v_idempotent_id
      FROM public.inspections
     WHERE submission_session_id = p_submission_session_id
       AND job_id = p_job_id
       AND archived_at IS NULL
     LIMIT 1;

    IF v_idempotent_id IS NOT NULL THEN
      SELECT COALESCE(
               array_agg(id ORDER BY submission_index NULLS LAST, created_at, id),
               ARRAY[]::uuid[]
             )
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

  -- ── WORKFLOW-004: a delivery inspection requires pickup to be complete
  -- first, unless the caller is an admin/super-admin forcing a delivery-only
  -- completion.
  IF p_type = 'delivery' AND NOT v_has_pickup AND NOT public.is_admin_or_super_admin() THEN
    RAISE EXCEPTION 'PICKUP_NOT_COMPLETE'
      USING ERRCODE = '23514',
            HINT = 'Complete the pickup inspection before delivery';
  END IF;

  -- ── Server-side mirror of evaluateExecutableState()'s "blocked" checks ──
  -- The client already enforces these (JobDetail hides/disables the action),
  -- but nothing previously stopped a direct RPC call from bypassing them.
  IF v_current_status = ANY(v_non_actionable_statuses) THEN
    RAISE EXCEPTION 'JOB_NOT_ACTIONABLE'
      USING ERRCODE = '23514',
            HINT = 'Job status ' || v_current_status || ' does not accept inspection submissions';
  END IF;

  IF v_current_status <> ALL(v_in_progress_statuses) AND v_driver_id IS NOT NULL THEN
    SELECT id, external_job_number
      INTO v_blocking_job_id, v_blocking_job_ref
      FROM public.jobs
     WHERE id <> p_job_id
       AND org_id = v_org_id
       AND driver_id = v_driver_id
       AND status = ANY(v_in_progress_statuses)
     LIMIT 1;

    IF v_blocking_job_id IS NOT NULL THEN
      RAISE EXCEPTION 'ACTIVE_JOB_LOCK'
        USING ERRCODE = '23514',
              HINT = 'Complete job ' || COALESCE(v_blocking_job_ref, left(v_blocking_job_id::text, 8)) || ' first';
    END IF;
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
           damage_declaration = CASE WHEN (p_inspection->>'damage_declaration') IN ('none_found','recorded')
                                     THEN p_inspection->>'damage_declaration' ELSE damage_declaration END,
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
      vehicle_condition, water_level_status, wheel_trims_damaged, damage_declaration
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
      p_inspection->>'wheel_trims_damaged',
      CASE WHEN (p_inspection->>'damage_declaration') IN ('none_found','recorded')
           THEN p_inspection->>'damage_declaration' ELSE NULL END
    )
    RETURNING id INTO v_inspection_id;
  END IF;

  IF v_existing_id IS NOT NULL OR jsonb_array_length(COALESCE(p_damage_items,'[]'::jsonb)) > 0 THEN
    UPDATE public.damage_items
       SET archived_at = now()
     WHERE inspection_id = v_inspection_id AND archived_at IS NULL;
  END IF;

  IF jsonb_array_length(COALESCE(p_damage_items,'[]'::jsonb)) > 0 THEN
    FOR v_item, v_ord IN
      SELECT value, ordinality
        FROM jsonb_array_elements(p_damage_items) WITH ORDINALITY
    LOOP
      INSERT INTO public.damage_items (
        inspection_id, org_id, run_id, submission_session_id, submission_index,
        x, y, area, location, item, damage_types, notes, photo_url,
        panel_id, view_id, body_type, diagram_version, severity, panel_position
      ) VALUES (
        v_inspection_id, v_org_id, v_run_id, p_submission_session_id, (v_ord - 1)::int,
        (v_item->>'x')::numeric, (v_item->>'y')::numeric,
        v_item->>'area', v_item->>'location', v_item->>'item',
        CASE WHEN v_item ? 'damage_types'
             THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'damage_types'))
             ELSE NULL END,
        v_item->>'notes', v_item->>'photo_url',
        -- Damage Inspection V2 (all optional; legacy clients omit them).
        -- Values outside the allowed shapes are dropped to NULL rather than
        -- failing the whole submission, so evidence is never rejected.
        CASE WHEN (v_item->>'panel_id') ~ '^[a-z][a-z_]{1,47}$' THEN v_item->>'panel_id' END,
        CASE WHEN (v_item->>'view_id') IN ('top','front','rear','left','right') THEN v_item->>'view_id' END,
        CASE WHEN (v_item->>'body_type') IN ('suv','saloon','hatchback','estate','coupe','convertible','mpv','van','pickup') THEN v_item->>'body_type' END,
        CASE WHEN (v_item->>'diagram_version') ~ '^v[0-9]+\.[0-9]+$' THEN v_item->>'diagram_version' END,
        CASE WHEN (v_item->>'severity') IN ('minor','moderate','severe') THEN v_item->>'severity' END,
        CASE WHEN jsonb_typeof(v_item->'panel_position') = 'object' THEN v_item->'panel_position' END
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
$function$
;
-- [07] public.super_admin_override_job_status(p_job_id uuid, p_new_sta
CREATE OR REPLACE FUNCTION public.super_admin_override_job_status(p_job_id uuid, p_new_status text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason       text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_org_id       uuid;
  v_from_status  text;
  v_prev_done    timestamptz;
  v_removed      integer := 0;
  v_valid        text[] := ARRAY[
    'draft', 'pending', 'incomplete', 'new', 'ready_for_pickup', 'assigned',
    'pickup_in_progress', 'pickup_complete', 'in_transit', 'delivery_in_progress',
    'delivery_complete', 'pod_ready', 'completed', 'cancelled', 'failed', 'archived'
  ];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'SUPER_ADMIN_ONLY'
      USING ERRCODE = '42501',
            HINT = 'Only a super admin can override a job''s status';
  END IF;

  IF v_reason IS NULL OR char_length(v_reason) < 5 THEN
    RAISE EXCEPTION 'REASON_REQUIRED'
      USING ERRCODE = '23514', HINT = 'Give a reason of at least 5 characters';
  END IF;

  IF p_new_status IS NULL OR NOT (p_new_status = ANY (v_valid)) THEN
    RAISE EXCEPTION 'INVALID_STATUS'
      USING ERRCODE = '23514', HINT = 'Unknown job status: ' || COALESCE(p_new_status, 'null');
  END IF;

  SELECT org_id, status, completed_at
    INTO v_org_id, v_from_status, v_prev_done
    FROM public.jobs WHERE id = p_job_id FOR UPDATE;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND' USING ERRCODE = '02000';
  END IF;

  IF v_from_status = p_new_status THEN
    RAISE EXCEPTION 'JOB_ALREADY_IN_STATUS'
      USING ERRCODE = '23514', HINT = 'The job is already ' || v_from_status;
  END IF;

  -- Same definition of "invoiced" as the duplicate-invoice guard
  -- (findAlreadyInvoicedJobs in src/features/invoicing/api/createInvoice.ts).
  IF EXISTS (
       SELECT 1 FROM public.invoice_items ii
        WHERE ii.job_id = p_job_id AND NOT COALESCE(ii.voided, false)
     )
     OR EXISTS (
       SELECT 1 FROM public.invoices i
        WHERE i.job_id = p_job_id AND i.status <> 'cancelled'
     )
  THEN
    RAISE EXCEPTION 'JOB_ON_LIVE_INVOICE'
      USING ERRCODE = '23514',
            HINT = 'Cancel the invoice this job is on before changing its status';
  END IF;

  UPDATE public.jobs
     SET status = p_new_status,
         updated_at = now()
   WHERE id = p_job_id;

  -- A manual correction must never message a customer. The enqueue trigger runs
  -- inside this transaction, so its rows carry this transaction's now().
  DELETE FROM public.customer_notifications
   WHERE job_id = p_job_id
     AND status = 'pending'
     AND created_at = now();
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  INSERT INTO public.job_status_overrides
    (org_id, job_id, actor_id, from_status, to_status, reason, prev_completed_at)
  VALUES
    (v_org_id, p_job_id, auth.uid(), v_from_status, p_new_status, v_reason, v_prev_done);

  INSERT INTO public.job_activity_log (job_id, org_id, action, from_status, to_status, notes)
  VALUES (p_job_id, v_org_id, 'super_admin_status_override', v_from_status, p_new_status,
          'Super-admin override: ' || v_reason);

  RETURN jsonb_build_object(
    'fromStatus', v_from_status,
    'toStatus', p_new_status,
    'removedNotifications', v_removed
  );
END;
$function$
;
-- [07] public.suspend_user_account(p_target_user_id uuid, p_reason tex
CREATE OR REPLACE FUNCTION public.suspend_user_account(p_target_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS public.user_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_target public.user_profiles;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if v_actor = p_target_user_id then
    raise exception 'CANNOT_SUSPEND_SELF';
  end if;

  select *
    into v_target
  from public.user_profiles
  where auth_user_id = p_target_user_id;

  if v_target.auth_user_id is null then
    raise exception 'TARGET_NOT_FOUND';
  end if;

  if not public.can_actor_manage_target_user(v_actor, p_target_user_id)
     and not public.is_super_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_target.account_status <> 'active' then
    raise exception 'INVALID_TRANSITION';
  end if;

  update public.user_profiles
  set
    account_status = 'suspended',
    suspended_at = now(),
    suspended_by = v_actor,
    suspension_reason = p_reason,
    updated_at = now()
  where auth_user_id = p_target_user_id
  returning * into v_target;

  insert into public.admin_audit_log (
    performed_by,
    performed_by_email,
    action,
    target_user_id,
    target_org_id,
    before_state,
    after_state
  )
  values (
    v_actor,
    public.current_actor_email(),
    'suspend_user_account',
    p_target_user_id,
    v_target.org_id,
    jsonb_build_object('account_status', 'active'),
    jsonb_build_object('account_status', 'suspended', 'reason', p_reason)
  );

  return v_target;
end;
$function$
;
-- [07] public.sync_damage_photo_url()
CREATE OR REPLACE FUNCTION public.sync_damage_photo_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.damage_item_id IS NOT NULL AND NEW.url IS NOT NULL THEN
    UPDATE public.damage_items
       SET photo_url = NEW.url
     WHERE id = NEW.damage_item_id;
  END IF;
  RETURN NEW;
END;
$function$
;
-- [07] public.touch_evidence_updated_at()
CREATE OR REPLACE FUNCTION public.touch_evidence_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.created_at  := OLD.created_at;
  NEW.captured_at := OLD.captured_at;
  RETURN NEW;
END;
$function$
;
-- [07] public.trg_inspections_link_photos()
CREATE OR REPLACE FUNCTION public.trg_inspections_link_photos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.link_unlinked_photos_to_inspection(new.job_id, new.org_id, new.type);
  return new;
end;
$function$
;
-- [07] public.update_updated_at_column()
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
-- [07] public.upsert_user_permission_override(p_target_user_id uuid, p
CREATE OR REPLACE FUNCTION public.upsert_user_permission_override(p_target_user_id uuid, p_permission_key text, p_grant_type text, p_reason text DEFAULT NULL::text)
 RETURNS public.user_permission_overrides
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor uuid := auth.uid();
  v_existing public.user_permission_overrides;
  v_row public.user_permission_overrides;
  v_action text;
begin
  if v_actor is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  if not public.can_actor_manage_permission(v_actor, p_target_user_id, p_permission_key, p_grant_type) then
    raise exception 'PERMISSION_DENIED';
  end if;

  select *
    into v_existing
  from public.user_permission_overrides
  where user_id = p_target_user_id
    and permission_key = p_permission_key;

  insert into public.user_permission_overrides (
    user_id,
    permission_key,
    grant_type,
    granted_by,
    reason
  )
  values (
    p_target_user_id,
    p_permission_key,
    p_grant_type,
    v_actor,
    p_reason
  )
  on conflict (user_id, permission_key)
  do update set
    grant_type = excluded.grant_type,
    granted_by = excluded.granted_by,
    reason = excluded.reason,
    updated_at = now()
  returning * into v_row;

  v_action := case when v_existing.id is null then 'create_override' else 'update_override' end;

  insert into public.permission_audit_log (
    actor_user_id,
    actor_email,
    target_user_id,
    permission_key,
    action,
    old_grant_type,
    new_grant_type,
    reason
  )
  values (
    v_actor,
    public.current_actor_email(),
    p_target_user_id,
    p_permission_key,
    v_action,
    v_existing.grant_type,
    p_grant_type,
    p_reason
  );

  return v_row;
end;
$function$
;
-- [07] public.user_account_status()
CREATE OR REPLACE FUNCTION public.user_account_status()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select account_status from public.user_profiles where auth_user_id = auth.uid()),
    'active'
  )
$function$
;
-- [07] public.user_has_permission(p_user_id uuid, p_permission_key tex
CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with profile as (
    select up.auth_user_id, up.role, up.account_status
    from public.user_profiles up
    where up.auth_user_id = p_user_id
    limit 1
  ),
  denial as (
    select 1 from public.user_permission_overrides uo
    where uo.user_id = p_user_id and uo.permission_key = p_permission_key and uo.grant_type = 'deny'
    limit 1
  ),
  allowance as (
    select 1 from public.user_permission_overrides uo
    where uo.user_id = p_user_id and uo.permission_key = p_permission_key and uo.grant_type = 'allow'
    limit 1
  ),
  template as (
    select rpt.is_allowed
    from profile p
    join public.role_permission_templates rpt
      on rpt.role = p.role and rpt.permission_key = p_permission_key
    limit 1
  )
  select case
    when not exists (select 1 from profile) then false
    when (select account_status from profile) <> 'active' then false
    -- The owner inherits every permission; overrides cannot remove it.
    when (select role from profile) = 'super_admin' then true
    when exists (select 1 from denial) then false
    when exists (select 1 from allowance) then true
    when exists (select 1 from template where is_allowed = true) then true
    else false
  end;
$function$
;
-- [07] public.user_org_id()
CREATE OR REPLACE FUNCTION public.user_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select up.org_id
  from public.user_profiles up
  where up.auth_user_id = auth.uid()
  limit 1
$function$
;
-- [07] public.user_profiles_sync_full_name()
CREATE OR REPLACE FUNCTION public.user_profiles_sync_full_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.full_name IS NULL OR btrim(NEW.full_name) = '' THEN
    NEW.full_name := btrim(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,''));
    IF NEW.full_name = '' THEN NEW.full_name := NULL; END IF;
  END IF;
  RETURN NEW;
END $function$
;
-- [07] public.user_role()
CREATE OR REPLACE FUNCTION public.user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT up.role FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() LIMIT 1),
    'driver'
  );
$function$
;
-- [07] public.vehicle_name_norm(p text)
CREATE OR REPLACE FUNCTION public.vehicle_name_norm(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(trim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9šë]+', ' ', 'g')), '')
$function$
;
-- [08] 000000036928
CREATE VIEW public.active_driver_profiles WITH (security_invoker=on) AS  SELECT dp.id,
    dp.user_id,
    dp.org_id,
    dp.full_name,
    dp.display_name,
    dp.phone,
    dp.emergency_contact_name,
    dp.emergency_contact_phone,
    dp.date_of_birth,
    dp.address_line1,
    dp.address_line2,
    dp.city,
    dp.postcode,
    dp.licence_number,
    dp.licence_expiry,
    dp.licence_categories,
    dp.trade_plate_number,
    dp.employment_type,
    dp.start_date,
    dp.notes,
    dp.is_active,
    dp.created_at,
    dp.updated_at,
    dp.archived_at,
    dp.archived_by,
    dp.archive_reason,
    dp.restored_at,
    dp.restored_by,
    dp.restore_note
   FROM public.driver_profiles dp
     JOIN public.user_profiles up ON up.auth_user_id = dp.user_id
  WHERE COALESCE(dp.is_active, true) = true AND dp.archived_at IS NULL AND up.role = 'driver'::text AND up.account_status = 'active'::text;
-- [08] 000000036994
CREATE VIEW public.user_effective_permissions WITH (security_invoker=on) AS  WITH role_base AS (
         SELECT up.auth_user_id AS user_id,
            rpt.permission_key,
            rpt.is_allowed AS role_allowed
           FROM public.user_profiles up
             JOIN public.role_permission_templates rpt ON rpt.role = up.role
        ), overrides AS (
         SELECT uo.user_id,
            uo.permission_key,
            max(
                CASE
                    WHEN uo.grant_type = 'allow'::text THEN 1
                    ELSE 0
                END) AS has_allow,
            max(
                CASE
                    WHEN uo.grant_type = 'deny'::text THEN 1
                    ELSE 0
                END) AS has_deny
           FROM public.user_permission_overrides uo
          GROUP BY uo.user_id, uo.permission_key
        )
 SELECT rb.user_id,
    rb.permission_key,
        CASE
            WHEN COALESCE(o.has_deny, 0) = 1 THEN false
            WHEN COALESCE(o.has_allow, 0) = 1 THEN true
            WHEN rb.role_allowed THEN true
            ELSE false
        END AS is_allowed
   FROM role_base rb
     LEFT JOIN overrides o ON o.user_id = rb.user_id AND o.permission_key = rb.permission_key;
-- [08] 000000037047
CREATE VIEW public.user_permission_overrides_detailed WITH (security_invoker=true) AS  SELECT uo.id,
    uo.user_id,
    uo.permission_key,
    pc.label AS permission_label,
    pc.category AS permission_category,
    pc.description AS permission_description,
    pc.is_sensitive,
    uo.grant_type,
    uo.granted_by,
    grantor.email AS granted_by_email,
    uo.reason,
    uo.created_at,
    uo.updated_at
   FROM public.user_permission_overrides uo
     JOIN public.permissions_catalog pc ON pc.key = uo.permission_key
     LEFT JOIN public.user_profiles grantor ON grantor.auth_user_id = uo.granted_by;
-- [08] 000000038195
CREATE VIEW public.user_permissions_matrix WITH (security_invoker=true) AS  SELECT up.auth_user_id AS user_id,
    up.email,
    up.org_id,
    up.role,
    pc.key AS permission_key,
    pc.label AS permission_label,
    pc.category,
    public.user_has_permission(up.auth_user_id, pc.key) AS is_allowed
   FROM public.user_profiles up
     CROSS JOIN public.permissions_catalog pc;
-- [09] admin_audit_logcreated_at
ALTER TABLE ONLY public.admin_audit_log ALTER COLUMN created_at SET DEFAULT now();
-- [09] admin_audit_logid
ALTER TABLE ONLY public.admin_audit_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] app_settingsupdated_at
ALTER TABLE ONLY public.app_settings ALTER COLUMN updated_at SET DEFAULT now();
-- [09] app_settingsvalue
ALTER TABLE ONLY public.app_settings ALTER COLUMN value SET DEFAULT '{}'::jsonb;
-- [09] attention_acknowledgementscreated_at
ALTER TABLE ONLY public.attention_acknowledgements ALTER COLUMN created_at SET DEFAULT now();
-- [09] attention_acknowledgementsid
ALTER TABLE ONLY public.attention_acknowledgements ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] client_logscreated_at
ALTER TABLE ONLY public.client_logs ALTER COLUMN created_at SET DEFAULT now();
-- [09] client_logsid
ALTER TABLE ONLY public.client_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] client_logsseverity
ALTER TABLE ONLY public.client_logs ALTER COLUMN severity SET DEFAULT 'info'::text;
-- [09] client_rate_cardscreated_at
ALTER TABLE ONLY public.client_rate_cards ALTER COLUMN created_at SET DEFAULT now();
-- [09] client_rate_cardsrate_card_active
ALTER TABLE ONLY public.client_rate_cards ALTER COLUMN rate_card_active SET DEFAULT false;
-- [09] client_rate_cardsupdated_at
ALTER TABLE ONLY public.client_rate_cards ALTER COLUMN updated_at SET DEFAULT now();
-- [09] clientsaccount_status
ALTER TABLE ONLY public.clients ALTER COLUMN account_status SET DEFAULT 'active'::text;
-- [09] clientscreated_at
ALTER TABLE ONLY public.clients ALTER COLUMN created_at SET DEFAULT now();
-- [09] clientsfuel_policy
ALTER TABLE ONLY public.clients ALTER COLUMN fuel_policy SET DEFAULT 'recharged'::text;
-- [09] clientsid
ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] clientsis_active
ALTER TABLE ONLY public.clients ALTER COLUMN is_active SET DEFAULT true;
-- [09] clientspo_required
ALTER TABLE ONLY public.clients ALTER COLUMN po_required SET DEFAULT false;
-- [09] clientssignature_required
ALTER TABLE ONLY public.clients ALTER COLUMN signature_required SET DEFAULT false;
-- [09] clientsstatus_emails_enabled
ALTER TABLE ONLY public.clients ALTER COLUMN status_emails_enabled SET DEFAULT true;
-- [09] clientsupdated_at
ALTER TABLE ONLY public.clients ALTER COLUMN updated_at SET DEFAULT now();
-- [09] compliance_checkscreated_at
ALTER TABLE ONLY public.compliance_checks ALTER COLUMN created_at SET DEFAULT now();
-- [09] compliance_checksid
ALTER TABLE ONLY public.compliance_checks ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] compliance_checksstatus
ALTER TABLE ONLY public.compliance_checks ALTER COLUMN status SET DEFAULT 'pending'::text;
-- [09] compliance_checksupdated_at
ALTER TABLE ONLY public.compliance_checks ALTER COLUMN updated_at SET DEFAULT now();
-- [09] customer_notificationsattempts
ALTER TABLE ONLY public.customer_notifications ALTER COLUMN attempts SET DEFAULT 0;
-- [09] customer_notificationscreated_at
ALTER TABLE ONLY public.customer_notifications ALTER COLUMN created_at SET DEFAULT now();
-- [09] customer_notificationsid
ALTER TABLE ONLY public.customer_notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] customer_notificationsprovider_ids
ALTER TABLE ONLY public.customer_notifications ALTER COLUMN provider_ids SET DEFAULT '{}'::text[];
-- [09] customer_notificationsrecipients
ALTER TABLE ONLY public.customer_notifications ALTER COLUMN recipients SET DEFAULT '{}'::text[];
-- [09] customer_notificationsstatus
ALTER TABLE ONLY public.customer_notifications ALTER COLUMN status SET DEFAULT 'pending'::text;
-- [09] damage_itemscreated_at
ALTER TABLE ONLY public.damage_items ALTER COLUMN created_at SET DEFAULT now();
-- [09] damage_itemsid
ALTER TABLE ONLY public.damage_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] driver_digital_credential_eventscreated_at
ALTER TABLE ONLY public.driver_digital_credential_events ALTER COLUMN created_at SET DEFAULT now();
-- [09] driver_digital_credential_eventsdetails
ALTER TABLE ONLY public.driver_digital_credential_events ALTER COLUMN details SET DEFAULT '{}'::jsonb;
-- [09] driver_digital_credentialscredential_version
ALTER TABLE ONLY public.driver_digital_credentials ALTER COLUMN credential_version SET DEFAULT 1;
-- [09] driver_digital_credentialsholder_name
ALTER TABLE ONLY public.driver_digital_credentials ALTER COLUMN holder_name SET DEFAULT ''::text;
-- [09] driver_digital_credentialsid
ALTER TABLE ONLY public.driver_digital_credentials ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] driver_digital_credentialsissued_at
ALTER TABLE ONLY public.driver_digital_credentials ALTER COLUMN issued_at SET DEFAULT now();
-- [09] driver_digital_credentialsstatus
ALTER TABLE ONLY public.driver_digital_credentials ALTER COLUMN status SET DEFAULT 'active'::text;
-- [09] driver_digital_credentialsupdated_at
ALTER TABLE ONLY public.driver_digital_credentials ALTER COLUMN updated_at SET DEFAULT now();
-- [09] driver_onboardingcreated_at
ALTER TABLE ONLY public.driver_onboarding ALTER COLUMN created_at SET DEFAULT now();
-- [09] driver_onboardingemployment_type
ALTER TABLE ONLY public.driver_onboarding ALTER COLUMN employment_type SET DEFAULT 'contractor'::text;
-- [09] driver_onboardingid
ALTER TABLE ONLY public.driver_onboarding ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] driver_onboardingstatus
ALTER TABLE ONLY public.driver_onboarding ALTER COLUMN status SET DEFAULT 'draft'::text;
-- [09] driver_onboardingupdated_at
ALTER TABLE ONLY public.driver_onboarding ALTER COLUMN updated_at SET DEFAULT now();
-- [09] driver_profilesautomatic_capable
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN automatic_capable SET DEFAULT true;
-- [09] driver_profilesbank_captured
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN bank_captured SET DEFAULT false;
-- [09] driver_profilescreated_at
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN created_at SET DEFAULT now();
-- [09] driver_profilesemployment_type
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN employment_type SET DEFAULT 'contractor'::text;
-- [09] driver_profilesev_capable
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN ev_capable SET DEFAULT false;
-- [09] driver_profilesfull_name
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN full_name SET DEFAULT ''::text;
-- [09] driver_profilesid
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] driver_profilesis_active
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN is_active SET DEFAULT true;
-- [09] driver_profileslicence_categories
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN licence_categories SET DEFAULT '{}'::text[];
-- [09] driver_profilesmanual_capable
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN manual_capable SET DEFAULT true;
-- [09] driver_profilespreferred_regions
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN preferred_regions SET DEFAULT '{}'::text[];
-- [09] driver_profilesprestige_approved
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN prestige_approved SET DEFAULT false;
-- [09] driver_profilesunavailable_regions
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN unavailable_regions SET DEFAULT '{}'::text[];
-- [09] driver_profilesupdated_at
ALTER TABLE ONLY public.driver_profiles ALTER COLUMN updated_at SET DEFAULT now();
-- [09] evidence_itemscreated_at
ALTER TABLE ONLY public.evidence_items ALTER COLUMN created_at SET DEFAULT now();
-- [09] evidence_itemsevidence_type
ALTER TABLE ONLY public.evidence_items ALTER COLUMN evidence_type SET DEFAULT 'photo'::text;
-- [09] evidence_itemsid
ALTER TABLE ONLY public.evidence_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] evidence_itemsmetadata
ALTER TABLE ONLY public.evidence_items ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
-- [09] evidence_itemsreview_status
ALTER TABLE ONLY public.evidence_items ALTER COLUMN review_status SET DEFAULT 'pending'::text;
-- [09] evidence_itemsstorage_bucket
ALTER TABLE ONLY public.evidence_items ALTER COLUMN storage_bucket SET DEFAULT 'vehicle-photos'::text;
-- [09] evidence_itemsupdated_at
ALTER TABLE ONLY public.evidence_items ALTER COLUMN updated_at SET DEFAULT now();
-- [09] expense_receiptsbackend
ALTER TABLE ONLY public.expense_receipts ALTER COLUMN backend SET DEFAULT 'internal'::text;
-- [09] expense_receiptscreated_at
ALTER TABLE ONLY public.expense_receipts ALTER COLUMN created_at SET DEFAULT now();
-- [09] expense_receiptsid
ALTER TABLE ONLY public.expense_receipts ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] expensesbillable_on_pod
ALTER TABLE ONLY public.expenses ALTER COLUMN billable_on_pod SET DEFAULT true;
-- [09] expensescreated_at
ALTER TABLE ONLY public.expenses ALTER COLUMN created_at SET DEFAULT now();
-- [09] expensescurrency
ALTER TABLE ONLY public.expenses ALTER COLUMN currency SET DEFAULT 'GBP'::text;
-- [09] expensesdate
ALTER TABLE ONLY public.expenses ALTER COLUMN date SET DEFAULT CURRENT_DATE;
-- [09] expensesid
ALTER TABLE ONLY public.expenses ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] expensesis_hidden
ALTER TABLE ONLY public.expenses ALTER COLUMN is_hidden SET DEFAULT false;
-- [09] expensesis_test
ALTER TABLE ONLY public.expenses ALTER COLUMN is_test SET DEFAULT false;
-- [09] expensesupdated_at
ALTER TABLE ONLY public.expenses ALTER COLUMN updated_at SET DEFAULT now();
-- [09] expensesupload_status
ALTER TABLE ONLY public.expenses ALTER COLUMN upload_status SET DEFAULT 'synced'::text;
-- [09] inspectionscreated_at
ALTER TABLE ONLY public.inspections ALTER COLUMN created_at SET DEFAULT now();
-- [09] inspectionshas_damage
ALTER TABLE ONLY public.inspections ALTER COLUMN has_damage SET DEFAULT false;
-- [09] inspectionsid
ALTER TABLE ONLY public.inspections ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] inspectionsupdated_at
ALTER TABLE ONLY public.inspections ALTER COLUMN updated_at SET DEFAULT now();
-- [09] invoice_expensesamount_vat
ALTER TABLE ONLY public.invoice_expenses ALTER COLUMN amount_vat SET DEFAULT 0;
-- [09] invoice_expensescreated_at
ALTER TABLE ONLY public.invoice_expenses ALTER COLUMN created_at SET DEFAULT now();
-- [09] invoice_expensesid
ALTER TABLE ONLY public.invoice_expenses ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] invoice_expensessort_order
ALTER TABLE ONLY public.invoice_expenses ALTER COLUMN sort_order SET DEFAULT 0;
-- [09] invoice_expensesvoided
ALTER TABLE ONLY public.invoice_expenses ALTER COLUMN voided SET DEFAULT false;
-- [09] invoice_itemsamount
ALTER TABLE ONLY public.invoice_items ALTER COLUMN amount SET DEFAULT 0;
-- [09] invoice_itemscreated_at
ALTER TABLE ONLY public.invoice_items ALTER COLUMN created_at SET DEFAULT now();
-- [09] invoice_itemsdescription
ALTER TABLE ONLY public.invoice_items ALTER COLUMN description SET DEFAULT ''::text;
-- [09] invoice_itemsid
ALTER TABLE ONLY public.invoice_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] invoice_itemsquantity
ALTER TABLE ONLY public.invoice_items ALTER COLUMN quantity SET DEFAULT 1;
-- [09] invoice_itemssort_order
ALTER TABLE ONLY public.invoice_items ALTER COLUMN sort_order SET DEFAULT 0;
-- [09] invoice_itemsunit_price
ALTER TABLE ONLY public.invoice_items ALTER COLUMN unit_price SET DEFAULT 0;
-- [09] invoice_itemsvoided
ALTER TABLE ONLY public.invoice_items ALTER COLUMN voided SET DEFAULT false;
-- [09] invoice_number_counterslast_credit_seq
ALTER TABLE ONLY public.invoice_number_counters ALTER COLUMN last_credit_seq SET DEFAULT 0;
-- [09] invoice_number_counterslast_seq
ALTER TABLE ONLY public.invoice_number_counters ALTER COLUMN last_seq SET DEFAULT 1000;
-- [09] invoicescreated_at
ALTER TABLE ONLY public.invoices ALTER COLUMN created_at SET DEFAULT now();
-- [09] invoicesdocument_type
ALTER TABLE ONLY public.invoices ALTER COLUMN document_type SET DEFAULT 'invoice'::text;
-- [09] invoicesexpenses_total
ALTER TABLE ONLY public.invoices ALTER COLUMN expenses_total SET DEFAULT 0;
-- [09] invoicesid
ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] invoicesis_test
ALTER TABLE ONLY public.invoices ALTER COLUMN is_test SET DEFAULT false;
-- [09] invoicesissue_date
ALTER TABLE ONLY public.invoices ALTER COLUMN issue_date SET DEFAULT CURRENT_DATE;
-- [09] invoicesline_items
ALTER TABLE ONLY public.invoices ALTER COLUMN line_items SET DEFAULT '[]'::jsonb;
-- [09] invoicespayment_terms
ALTER TABLE ONLY public.invoices ALTER COLUMN payment_terms SET DEFAULT 'Net 30'::text;
-- [09] invoicesstatus
ALTER TABLE ONLY public.invoices ALTER COLUMN status SET DEFAULT 'draft'::text;
-- [09] invoicessubtotal
ALTER TABLE ONLY public.invoices ALTER COLUMN subtotal SET DEFAULT 0;
-- [09] invoicestotal
ALTER TABLE ONLY public.invoices ALTER COLUMN total SET DEFAULT 0;
-- [09] invoicesupdated_at
ALTER TABLE ONLY public.invoices ALTER COLUMN updated_at SET DEFAULT now();
-- [09] invoicesvat_amount
ALTER TABLE ONLY public.invoices ALTER COLUMN vat_amount SET DEFAULT 0;
-- [09] invoicesvat_rate
ALTER TABLE ONLY public.invoices ALTER COLUMN vat_rate SET DEFAULT 0;
-- [09] job_abort_eventscreated_at
ALTER TABLE ONLY public.job_abort_events ALTER COLUMN created_at SET DEFAULT now();
-- [09] job_abort_eventsid
ALTER TABLE ONLY public.job_abort_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] job_abort_invoice_correctionscreated_at
ALTER TABLE ONLY public.job_abort_invoice_corrections ALTER COLUMN created_at SET DEFAULT now();
-- [09] job_abort_invoice_correctionsid
ALTER TABLE ONLY public.job_abort_invoice_corrections ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] job_abort_invoice_correctionsoriginal_was_paid
ALTER TABLE ONLY public.job_abort_invoice_corrections ALTER COLUMN original_was_paid SET DEFAULT false;
-- [09] job_abort_invoice_correctionsother_jobs_on_invoice
ALTER TABLE ONLY public.job_abort_invoice_corrections ALTER COLUMN other_jobs_on_invoice SET DEFAULT 0;
-- [09] job_abort_requestsid
ALTER TABLE ONLY public.job_abort_requests ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] job_abort_requestsrequested_at
ALTER TABLE ONLY public.job_abort_requests ALTER COLUMN requested_at SET DEFAULT now();
-- [09] job_abort_requestsstatus
ALTER TABLE ONLY public.job_abort_requests ALTER COLUMN status SET DEFAULT 'pending'::text;
-- [09] job_abortsconfirmed_at
ALTER TABLE ONLY public.job_aborts ALTER COLUMN confirmed_at SET DEFAULT now();
-- [09] job_abortscreated_at
ALTER TABLE ONLY public.job_aborts ALTER COLUMN created_at SET DEFAULT now();
-- [09] job_abortsfinance_status
ALTER TABLE ONLY public.job_aborts ALTER COLUMN finance_status SET DEFAULT 'pending_review'::text;
-- [09] job_abortsid
ALTER TABLE ONLY public.job_aborts ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] job_abortsno_name_exception
ALTER TABLE ONLY public.job_aborts ALTER COLUMN no_name_exception SET DEFAULT false;
-- [09] job_activity_logcreated_at
ALTER TABLE ONLY public.job_activity_log ALTER COLUMN created_at SET DEFAULT now();
-- [09] job_activity_logid
ALTER TABLE ONLY public.job_activity_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] job_deviation_logcreated_at
ALTER TABLE ONLY public.job_deviation_log ALTER COLUMN created_at SET DEFAULT now();
-- [09] job_deviation_logid
ALTER TABLE ONLY public.job_deviation_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] job_pricingcreated_at
ALTER TABLE ONLY public.job_pricing ALTER COLUMN created_at SET DEFAULT now();
-- [09] job_pricingupdated_at
ALTER TABLE ONLY public.job_pricing ALTER COLUMN updated_at SET DEFAULT now();
-- [09] job_status_overridescreated_at
ALTER TABLE ONLY public.job_status_overrides ALTER COLUMN created_at SET DEFAULT now();
-- [09] job_status_overridesid
ALTER TABLE ONLY public.job_status_overrides ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] jobscreated_at
ALTER TABLE ONLY public.jobs ALTER COLUMN created_at SET DEFAULT now();
-- [09] jobscurrent_run_id
ALTER TABLE ONLY public.jobs ALTER COLUMN current_run_id SET DEFAULT gen_random_uuid();
-- [09] jobshas_delivery_inspection
ALTER TABLE ONLY public.jobs ALTER COLUMN has_delivery_inspection SET DEFAULT false;
-- [09] jobshas_pickup_inspection
ALTER TABLE ONLY public.jobs ALTER COLUMN has_pickup_inspection SET DEFAULT false;
-- [09] jobsid
ALTER TABLE ONLY public.jobs ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] jobsis_hidden
ALTER TABLE ONLY public.jobs ALTER COLUMN is_hidden SET DEFAULT false;
-- [09] jobsis_test
ALTER TABLE ONLY public.jobs ALTER COLUMN is_test SET DEFAULT false;
-- [09] jobsjob_type
ALTER TABLE ONLY public.jobs ALTER COLUMN job_type SET DEFAULT 'Single'::text;
-- [09] jobsmaps_validated
ALTER TABLE ONLY public.jobs ALTER COLUMN maps_validated SET DEFAULT false;
-- [09] jobsnotify_customer_on_arrival
ALTER TABLE ONLY public.jobs ALTER COLUMN notify_customer_on_arrival SET DEFAULT false;
-- [09] jobsnotify_customer_on_complete
ALTER TABLE ONLY public.jobs ALTER COLUMN notify_customer_on_complete SET DEFAULT false;
-- [09] jobsnotify_customer_on_start
ALTER TABLE ONLY public.jobs ALTER COLUMN notify_customer_on_start SET DEFAULT false;
-- [09] jobspriority
ALTER TABLE ONLY public.jobs ALTER COLUMN priority SET DEFAULT 'Normal'::text;
-- [09] jobssort_order
ALTER TABLE ONLY public.jobs ALTER COLUMN sort_order SET DEFAULT 0;
-- [09] jobsstatus
ALTER TABLE ONLY public.jobs ALTER COLUMN status SET DEFAULT 'ready_for_pickup'::text;
-- [09] jobssync_to_map
ALTER TABLE ONLY public.jobs ALTER COLUMN sync_to_map SET DEFAULT false;
-- [09] jobsupdated_at
ALTER TABLE ONLY public.jobs ALTER COLUMN updated_at SET DEFAULT now();
-- [09] onboarding_documentscreated_at
ALTER TABLE ONLY public.onboarding_documents ALTER COLUMN created_at SET DEFAULT now();
-- [09] onboarding_documentsid
ALTER TABLE ONLY public.onboarding_documents ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] onboarding_documentsupdated_at
ALTER TABLE ONLY public.onboarding_documents ALTER COLUMN updated_at SET DEFAULT now();
-- [09] organisationscreated_at
ALTER TABLE ONLY public.organisations ALTER COLUMN created_at SET DEFAULT now();
-- [09] organisationsid
ALTER TABLE ONLY public.organisations ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] organisationslate_payment_notice
ALTER TABLE ONLY public.organisations ALTER COLUMN late_payment_notice SET DEFAULT true;
-- [09] organisationsstatus
ALTER TABLE ONLY public.organisations ALTER COLUMN status SET DEFAULT 'active'::text;
-- [09] organisationsupdated_at
ALTER TABLE ONLY public.organisations ALTER COLUMN updated_at SET DEFAULT now();
-- [09] organisationsvat_registered
ALTER TABLE ONLY public.organisations ALTER COLUMN vat_registered SET DEFAULT false;
-- [09] permission_audit_logcreated_at
ALTER TABLE ONLY public.permission_audit_log ALTER COLUMN created_at SET DEFAULT now();
-- [09] permission_audit_logid
ALTER TABLE ONLY public.permission_audit_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] permissions_catalogcreated_at
ALTER TABLE ONLY public.permissions_catalog ALTER COLUMN created_at SET DEFAULT now();
-- [09] permissions_catalogis_sensitive
ALTER TABLE ONLY public.permissions_catalog ALTER COLUMN is_sensitive SET DEFAULT false;
-- [09] photosbackend
ALTER TABLE ONLY public.photos ALTER COLUMN backend SET DEFAULT 'internal'::text;
-- [09] photoscreated_at
ALTER TABLE ONLY public.photos ALTER COLUMN created_at SET DEFAULT now();
-- [09] photosid
ALTER TABLE ONLY public.photos ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] photosupdated_at
ALTER TABLE ONLY public.photos ALTER COLUMN updated_at SET DEFAULT now();
-- [09] pricing_snapshotsbreakdown
ALTER TABLE ONLY public.pricing_snapshots ALTER COLUMN breakdown SET DEFAULT '{}'::jsonb;
-- [09] pricing_snapshotscreated_at
ALTER TABLE ONLY public.pricing_snapshots ALTER COLUMN created_at SET DEFAULT now();
-- [09] pricing_snapshotsid
ALTER TABLE ONLY public.pricing_snapshots ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] pricing_snapshotsinputs
ALTER TABLE ONLY public.pricing_snapshots ALTER COLUMN inputs SET DEFAULT '{}'::jsonb;
-- [09] pricing_snapshotsis_final_invoice_price
ALTER TABLE ONLY public.pricing_snapshots ALTER COLUMN is_final_invoice_price SET DEFAULT false;
-- [09] pricing_snapshotsmissing_inputs
ALTER TABLE ONLY public.pricing_snapshots ALTER COLUMN missing_inputs SET DEFAULT '[]'::jsonb;
-- [09] pricing_snapshotsreasons
ALTER TABLE ONLY public.pricing_snapshots ALTER COLUMN reasons SET DEFAULT '[]'::jsonb;
-- [09] pricing_snapshotssource
ALTER TABLE ONLY public.pricing_snapshots ALTER COLUMN source SET DEFAULT 'admin_accept'::text;
-- [09] pricing_snapshotswarnings
ALTER TABLE ONLY public.pricing_snapshots ALTER COLUMN warnings SET DEFAULT '[]'::jsonb;
-- [09] push_configid
ALTER TABLE ONLY public.push_config ALTER COLUMN id SET DEFAULT true;
-- [09] push_configupdated_at
ALTER TABLE ONLY public.push_config ALTER COLUMN updated_at SET DEFAULT now();
-- [09] push_subscriptionscreated_at
ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN created_at SET DEFAULT now();
-- [09] push_subscriptionsfailure_count
ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN failure_count SET DEFAULT 0;
-- [09] push_subscriptionsid
ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] push_subscriptionsupdated_at
ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN updated_at SET DEFAULT now();
-- [09] qr_confirmationscreated_at
ALTER TABLE ONLY public.qr_confirmations ALTER COLUMN created_at SET DEFAULT now();
-- [09] qr_confirmationsexpires_at
ALTER TABLE ONLY public.qr_confirmations ALTER COLUMN expires_at SET DEFAULT (now() + '48:00:00'::interval);
-- [09] qr_confirmationsid
ALTER TABLE ONLY public.qr_confirmations ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] qr_confirmationstoken
ALTER TABLE ONLY public.qr_confirmations ALTER COLUMN token SET DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text);
-- [09] role_permission_templatescreated_at
ALTER TABLE ONLY public.role_permission_templates ALTER COLUMN created_at SET DEFAULT now();
-- [09] role_permission_templatesis_allowed
ALTER TABLE ONLY public.role_permission_templates ALTER COLUMN is_allowed SET DEFAULT true;
-- [09] user_permission_overridescreated_at
ALTER TABLE ONLY public.user_permission_overrides ALTER COLUMN created_at SET DEFAULT now();
-- [09] user_permission_overridesid
ALTER TABLE ONLY public.user_permission_overrides ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] user_permission_overridesupdated_at
ALTER TABLE ONLY public.user_permission_overrides ALTER COLUMN updated_at SET DEFAULT now();
-- [09] user_profilesaccount_status
ALTER TABLE ONLY public.user_profiles ALTER COLUMN account_status SET DEFAULT 'pending_activation'::text;
-- [09] user_profilescreated_at
ALTER TABLE ONLY public.user_profiles ALTER COLUMN created_at SET DEFAULT now();
-- [09] user_profilesid
ALTER TABLE ONLY public.user_profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] user_profilesis_protected
ALTER TABLE ONLY public.user_profiles ALTER COLUMN is_protected SET DEFAULT false;
-- [09] user_profilespermissions
ALTER TABLE ONLY public.user_profiles ALTER COLUMN permissions SET DEFAULT '{}'::jsonb;
-- [09] user_profilesrole
ALTER TABLE ONLY public.user_profiles ALTER COLUMN role SET DEFAULT 'driver'::text;
-- [09] user_profilesupdated_at
ALTER TABLE ONLY public.user_profiles ALTER COLUMN updated_at SET DEFAULT now();
-- [09] vehicle_catalogue_imagescreated_at
ALTER TABLE ONLY public.vehicle_catalogue_images ALTER COLUMN created_at SET DEFAULT now();
-- [09] vehicle_catalogue_imagescreated_by
ALTER TABLE ONLY public.vehicle_catalogue_images ALTER COLUMN created_by SET DEFAULT auth.uid();
-- [09] vehicle_catalogue_imagesid
ALTER TABLE ONLY public.vehicle_catalogue_images ALTER COLUMN id SET DEFAULT gen_random_uuid();
-- [09] vehicle_make_aliasescreated_at
ALTER TABLE ONLY public.vehicle_make_aliases ALTER COLUMN created_at SET DEFAULT now();
-- [10] publicadmin_audit_logadmin_audit_log_pkey
ALTER TABLE ONLY public.admin_audit_log ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);
-- [10] publicapp_settingsapp_settings_pkey
ALTER TABLE ONLY public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);
-- [10] publicattention_acknowledgementsattention_acknowledgements_pkey
ALTER TABLE ONLY public.attention_acknowledgements ADD CONSTRAINT attention_acknowledgements_pkey PRIMARY KEY (id);
-- [10] publicclient_logsclient_logs_pkey
ALTER TABLE ONLY public.client_logs ADD CONSTRAINT client_logs_pkey PRIMARY KEY (id);
-- [10] publicclient_rate_cardsclient_rate_cards_pkey
ALTER TABLE ONLY public.client_rate_cards ADD CONSTRAINT client_rate_cards_pkey PRIMARY KEY (client_id);
-- [10] publicclientsclients_fuel_policy_check
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_fuel_policy_check CHECK ((fuel_policy = ANY (ARRAY['recharged'::text, 'included'::text])));
-- [10] publicclientsclients_pkey
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
-- [10] publiccompliance_checkscompliance_checks_pkey
ALTER TABLE ONLY public.compliance_checks ADD CONSTRAINT compliance_checks_pkey PRIMARY KEY (id);
-- [10] publiccompliance_checkscompliance_checks_related_type_check
ALTER TABLE ONLY public.compliance_checks ADD CONSTRAINT compliance_checks_related_type_check CHECK ((related_type = ANY (ARRAY['driver'::text, 'client'::text, 'organisation'::text])));
-- [10] publiccompliance_checkscompliance_checks_status_check
ALTER TABLE ONLY public.compliance_checks ADD CONSTRAINT compliance_checks_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'expired'::text, 'waived'::text])));
-- [10] publiccustomer_notificationscustomer_notifications_event_check
ALTER TABLE ONLY public.customer_notifications ADD CONSTRAINT customer_notifications_event_check CHECK ((event = ANY (ARRAY['collected'::text, 'delivered'::text, 'aborted'::text])));
-- [10] publiccustomer_notificationscustomer_notifications_job_event_ke
ALTER TABLE ONLY public.customer_notifications ADD CONSTRAINT customer_notifications_job_event_key UNIQUE (job_id, event);
-- [10] publiccustomer_notificationscustomer_notifications_pkey
ALTER TABLE ONLY public.customer_notifications ADD CONSTRAINT customer_notifications_pkey PRIMARY KEY (id);
-- [10] publiccustomer_notificationscustomer_notifications_status_check
ALTER TABLE ONLY public.customer_notifications ADD CONSTRAINT customer_notifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'skipped'::text, 'failed'::text])));
-- [10] publicdamage_itemsdamage_items_pkey
ALTER TABLE ONLY public.damage_items ADD CONSTRAINT damage_items_pkey PRIMARY KEY (id);
-- [10] publicdamage_itemsdamage_items_severity_check
ALTER TABLE ONLY public.damage_items ADD CONSTRAINT damage_items_severity_check CHECK (((severity IS NULL) OR (severity = ANY (ARRAY['minor'::text, 'moderate'::text, 'severe'::text]))));
-- [10] publicdamage_itemsdamage_items_view_id_check
ALTER TABLE ONLY public.damage_items ADD CONSTRAINT damage_items_view_id_check CHECK (((view_id IS NULL) OR (view_id = ANY (ARRAY['top'::text, 'front'::text, 'rear'::text, 'left'::text, 'right'::text]))));
-- [10] publicdriver_digital_credential_eventsdriver_digital_credential
ALTER TABLE ONLY public.driver_digital_credential_events ADD CONSTRAINT driver_digital_credential_events_credential_version_check CHECK ((credential_version > 0));
-- [10] publicdriver_digital_credential_eventsdriver_digital_credential
ALTER TABLE ONLY public.driver_digital_credential_events ADD CONSTRAINT driver_digital_credential_events_event_type_check CHECK ((event_type = ANY (ARRAY['issued'::text, 'revoked'::text, 'reactivated'::text, 'photo_updated'::text, 'org_changed'::text, 'name_updated'::text])));
-- [10] publicdriver_digital_credential_eventsdriver_digital_credential
ALTER TABLE ONLY public.driver_digital_credential_events ADD CONSTRAINT driver_digital_credential_events_pkey PRIMARY KEY (id);
-- [10] publicdriver_digital_credentialsdriver_digital_credentials_cred
ALTER TABLE ONLY public.driver_digital_credentials ADD CONSTRAINT driver_digital_credentials_credential_version_check CHECK ((credential_version > 0));
-- [10] publicdriver_digital_credentialsdriver_digital_credentials_pkey
ALTER TABLE ONLY public.driver_digital_credentials ADD CONSTRAINT driver_digital_credentials_pkey PRIMARY KEY (id);
-- [10] publicdriver_digital_credentialsdriver_digital_credentials_seri
ALTER TABLE ONLY public.driver_digital_credentials ADD CONSTRAINT driver_digital_credentials_serial_number_key UNIQUE (serial_number);
-- [10] publicdriver_digital_credentialsdriver_digital_credentials_stat
ALTER TABLE ONLY public.driver_digital_credentials ADD CONSTRAINT driver_digital_credentials_status_check CHECK ((status = ANY (ARRAY['active'::text, 'revoked'::text])));
-- [10] publicdriver_digital_credentialsdriver_digital_credentials_user
ALTER TABLE ONLY public.driver_digital_credentials ADD CONSTRAINT driver_digital_credentials_user_id_key UNIQUE (user_id);
-- [10] publicdriver_onboardingdriver_onboarding_pkey
ALTER TABLE ONLY public.driver_onboarding ADD CONSTRAINT driver_onboarding_pkey PRIMARY KEY (id);
-- [10] publicdriver_onboardingdriver_onboarding_status_check
ALTER TABLE ONLY public.driver_onboarding ADD CONSTRAINT driver_onboarding_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'approved'::text, 'rejected'::text])));
-- [10] publicdriver_profilesdriver_profiles_employment_type_check
ALTER TABLE ONLY public.driver_profiles ADD CONSTRAINT driver_profiles_employment_type_check CHECK ((employment_type = ANY (ARRAY['employed'::text, 'contractor'::text, 'agency'::text, 'self_employed'::text])));
-- [10] publicdriver_profilesdriver_profiles_pay_basis_check
ALTER TABLE ONLY public.driver_profiles ADD CONSTRAINT driver_profiles_pay_basis_check CHECK (((pay_basis IS NULL) OR (pay_basis = ANY (ARRAY['per_job'::text, 'per_mile'::text, 'hourly'::text]))));
-- [10] publicdriver_profilesdriver_profiles_pkey
ALTER TABLE ONLY public.driver_profiles ADD CONSTRAINT driver_profiles_pkey PRIMARY KEY (id);
-- [10] publicdriver_profilesdriver_profiles_user_id_org_id_unique
ALTER TABLE ONLY public.driver_profiles ADD CONSTRAINT driver_profiles_user_id_org_id_unique UNIQUE (user_id, org_id);
-- [10] publicevidence_itemsevidence_items_pkey
ALTER TABLE ONLY public.evidence_items ADD CONSTRAINT evidence_items_pkey PRIMARY KEY (id);
-- [10] publicevidence_itemsevidence_items_stage_check
ALTER TABLE ONLY public.evidence_items ADD CONSTRAINT evidence_items_stage_check CHECK ((stage = ANY (ARRAY['pickup'::text, 'delivery'::text])));
-- [10] publicexpense_receiptsexpense_receipts_pkey
ALTER TABLE ONLY public.expense_receipts ADD CONSTRAINT expense_receipts_pkey PRIMARY KEY (id);
-- [10] publicexpensesexpenses_pkey
ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);
-- [10] publicinspectionsinspections_damage_declaration_check
ALTER TABLE ONLY public.inspections ADD CONSTRAINT inspections_damage_declaration_check CHECK (((damage_declaration IS NULL) OR (damage_declaration = ANY (ARRAY['none_found'::text, 'recorded'::text]))));
-- [10] publicinspectionsinspections_fuel_level_percent_check
ALTER TABLE ONLY public.inspections ADD CONSTRAINT inspections_fuel_level_percent_check CHECK (((fuel_level_percent >= 0) AND (fuel_level_percent <= 100)));
-- [10] publicinspectionsinspections_pkey
ALTER TABLE ONLY public.inspections ADD CONSTRAINT inspections_pkey PRIMARY KEY (id);
-- [10] publicinspectionsinspections_type_check
ALTER TABLE ONLY public.inspections ADD CONSTRAINT inspections_type_check CHECK ((type = ANY (ARRAY['pickup'::text, 'delivery'::text])));
-- [10] publicinvoice_expensesinvoice_expenses_pkey
ALTER TABLE ONLY public.invoice_expenses ADD CONSTRAINT invoice_expenses_pkey PRIMARY KEY (id);
-- [10] publicinvoice_expensesinvoice_expenses_ref_unique
ALTER TABLE ONLY public.invoice_expenses ADD CONSTRAINT invoice_expenses_ref_unique UNIQUE (invoice_id, ref);
-- [10] publicinvoice_itemsinvoice_items_pkey
ALTER TABLE ONLY public.invoice_items ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);
-- [10] publicinvoice_number_countersinvoice_number_counters_pkey
ALTER TABLE ONLY public.invoice_number_counters ADD CONSTRAINT invoice_number_counters_pkey PRIMARY KEY (org_id);
-- [10] publicinvoicesinvoices_credit_note_link_check
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_credit_note_link_check CHECK (((document_type = 'credit_note'::text) = (credits_invoice_id IS NOT NULL)));
-- [10] publicinvoicesinvoices_document_type_check
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_document_type_check CHECK ((document_type = ANY (ARRAY['invoice'::text, 'credit_note'::text])));
-- [10] publicinvoicesinvoices_org_number_unique
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_org_number_unique UNIQUE (org_id, invoice_number);
-- [10] publicinvoicesinvoices_pkey
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
-- [10] publicinvoicesinvoices_status_check
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'overdue'::text, 'cancelled'::text])));
-- [10] publicjob_abort_eventsjob_abort_events_action_check
ALTER TABLE ONLY public.job_abort_events ADD CONSTRAINT job_abort_events_action_check CHECK ((action = ANY (ARRAY['requested'::text, 'request_dismissed'::text, 'confirmed'::text, 'claim_approved'::text, 'claim_rejected'::text, 'claim_amended'::text, 'invoice_fee_corrected'::text, 'reopened'::text, 'customer_notified'::text, 'replacement_created'::text])));
-- [10] publicjob_abort_eventsjob_abort_events_pkey
ALTER TABLE ONLY public.job_abort_events ADD CONSTRAINT job_abort_events_pkey PRIMARY KEY (id);
-- [10] publicjob_abort_invoice_correctionsjob_abort_invoice_correction
ALTER TABLE ONLY public.job_abort_invoice_corrections ADD CONSTRAINT job_abort_invoice_corrections_abort_id_original_invoice_id_key UNIQUE (abort_id, original_invoice_id);
-- [10] publicjob_abort_invoice_correctionsjob_abort_invoice_correction
ALTER TABLE ONLY public.job_abort_invoice_corrections ADD CONSTRAINT job_abort_invoice_corrections_pkey PRIMARY KEY (id);
-- [10] publicjob_abort_invoice_correctionsjob_abort_invoice_correction
ALTER TABLE ONLY public.job_abort_invoice_corrections ADD CONSTRAINT job_abort_invoice_corrections_reason_check CHECK (((char_length(btrim(reason)) >= 15) AND (char_length(btrim(reason)) <= 500)));
-- [10] publicjob_abort_requestsjob_abort_requests_pkey
ALTER TABLE ONLY public.job_abort_requests ADD CONSTRAINT job_abort_requests_pkey PRIMARY KEY (id);
-- [10] publicjob_abort_requestsjob_abort_requests_resolved
ALTER TABLE ONLY public.job_abort_requests ADD CONSTRAINT job_abort_requests_resolved CHECK (((status = 'pending'::text) = (resolved_at IS NULL)));
-- [10] publicjob_abort_requestsjob_abort_requests_status_check
ALTER TABLE ONLY public.job_abort_requests ADD CONSTRAINT job_abort_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'dismissed'::text, 'superseded'::text])));
-- [10] publicjob_abortsjob_aborts_amounts_non_negative
ALTER TABLE ONLY public.job_aborts ADD CONSTRAINT job_aborts_amounts_non_negative CHECK (((COALESCE(agreed_price, (0)::numeric) >= (0)::numeric) AND (COALESCE(proposed_amount, (0)::numeric) >= (0)::numeric) AND (COALESCE(approved_amount, (0)::numeric) >= (0)::numeric)));
-- [10] publicjob_abortsjob_aborts_approved_has_amount
ALTER TABLE ONLY public.job_aborts ADD CONSTRAINT job_aborts_approved_has_amount CHECK (((finance_status <> 'approved'::text) OR (approved_amount IS NOT NULL)));
-- [10] publicjob_abortsjob_aborts_finance_status_check
ALTER TABLE ONLY public.job_aborts ADD CONSTRAINT job_aborts_finance_status_check CHECK ((finance_status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text])));
-- [10] publicjob_abortsjob_aborts_name_or_exception
ALTER TABLE ONLY public.job_aborts ADD CONSTRAINT job_aborts_name_or_exception CHECK (((no_name_exception AND (contact_name IS NULL)) OR ((NOT no_name_exception) AND (contact_name IS NOT NULL) AND (btrim(contact_name) <> ''::text))));
-- [10] publicjob_abortsjob_aborts_pkey
ALTER TABLE ONLY public.job_aborts ADD CONSTRAINT job_aborts_pkey PRIMARY KEY (id);
-- [10] publicjob_activity_logjob_activity_log_pkey
ALTER TABLE ONLY public.job_activity_log ADD CONSTRAINT job_activity_log_pkey PRIMARY KEY (id);
-- [10] publicjob_deviation_logjob_deviation_log_pkey
ALTER TABLE ONLY public.job_deviation_log ADD CONSTRAINT job_deviation_log_pkey PRIMARY KEY (id);
-- [10] publicjob_pricingjob_pricing_pkey
ALTER TABLE ONLY public.job_pricing ADD CONSTRAINT job_pricing_pkey PRIMARY KEY (job_id);
-- [10] publicjob_status_overridesjob_status_overrides_pkey
ALTER TABLE ONLY public.job_status_overrides ADD CONSTRAINT job_status_overrides_pkey PRIMARY KEY (id);
-- [10] publicjobsjobs_external_job_number_unique
ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_external_job_number_unique UNIQUE (external_job_number);
-- [10] publicjobsjobs_pkey
ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_pkey PRIMARY KEY (id);
-- [10] publiconboarding_documentsonboarding_documents_pkey
ALTER TABLE ONLY public.onboarding_documents ADD CONSTRAINT onboarding_documents_pkey PRIMARY KEY (id);
-- [10] publiconboarding_documentsonboarding_documents_related_type_che
ALTER TABLE ONLY public.onboarding_documents ADD CONSTRAINT onboarding_documents_related_type_check CHECK ((related_type = ANY (ARRAY['driver'::text, 'client'::text, 'organisation'::text])));
-- [10] publicorganisationsorganisations_bank_account_number_format
ALTER TABLE ONLY public.organisations ADD CONSTRAINT organisations_bank_account_number_format CHECK (((bank_account_number IS NULL) OR (bank_account_number ~ '^[0-9]{6,8}$'::text)));
-- [10] publicorganisationsorganisations_bank_sort_code_format
ALTER TABLE ONLY public.organisations ADD CONSTRAINT organisations_bank_sort_code_format CHECK (((bank_sort_code IS NULL) OR (bank_sort_code ~ '^[0-9]{2}-[0-9]{2}-[0-9]{2}$'::text)));
-- [10] publicorganisationsorganisations_name_key
ALTER TABLE ONLY public.organisations ADD CONSTRAINT organisations_name_key UNIQUE (name);
-- [10] publicorganisationsorganisations_pkey
ALTER TABLE ONLY public.organisations ADD CONSTRAINT organisations_pkey PRIMARY KEY (id);
-- [10] publicpermission_audit_logpermission_audit_log_action_check
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_action_check CHECK ((action = ANY (ARRAY['create_override'::text, 'update_override'::text, 'delete_override'::text])));
-- [10] publicpermission_audit_logpermission_audit_log_pkey
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_pkey PRIMARY KEY (id);
-- [10] publicpermissions_catalogpermissions_catalog_category_check
ALTER TABLE ONLY public.permissions_catalog ADD CONSTRAINT permissions_catalog_category_check CHECK ((category = ANY (ARRAY['jobs'::text, 'users'::text, 'drivers'::text, 'expenses'::text, 'reports'::text, 'pod'::text, 'organisation'::text, 'system'::text, 'platform'::text])));
-- [10] publicpermissions_catalogpermissions_catalog_pkey
ALTER TABLE ONLY public.permissions_catalog ADD CONSTRAINT permissions_catalog_pkey PRIMARY KEY (key);
-- [10] publicphotosphotos_pkey
ALTER TABLE ONLY public.photos ADD CONSTRAINT photos_pkey PRIMARY KEY (id);
-- [10] publicpricing_snapshotspricing_snapshots_pkey
ALTER TABLE ONLY public.pricing_snapshots ADD CONSTRAINT pricing_snapshots_pkey PRIMARY KEY (id);
-- [10] publicpush_configpush_config_id_check
ALTER TABLE ONLY public.push_config ADD CONSTRAINT push_config_id_check CHECK (id);
-- [10] publicpush_configpush_config_pkey
ALTER TABLE ONLY public.push_config ADD CONSTRAINT push_config_pkey PRIMARY KEY (id);
-- [10] publicpush_subscriptionspush_subscriptions_endpoint_key
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
-- [10] publicpush_subscriptionspush_subscriptions_pkey
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
-- [10] publicqr_confirmationsqr_confirmations_event_type_check
ALTER TABLE ONLY public.qr_confirmations ADD CONSTRAINT qr_confirmations_event_type_check CHECK ((event_type = ANY (ARRAY['collection'::text, 'delivery'::text])));
-- [10] publicqr_confirmationsqr_confirmations_pkey
ALTER TABLE ONLY public.qr_confirmations ADD CONSTRAINT qr_confirmations_pkey PRIMARY KEY (id);
-- [10] publicqr_confirmationsqr_confirmations_token_key
ALTER TABLE ONLY public.qr_confirmations ADD CONSTRAINT qr_confirmations_token_key UNIQUE (token);
-- [10] publicrole_permission_templatesrole_permission_templates_pkey
ALTER TABLE ONLY public.role_permission_templates ADD CONSTRAINT role_permission_templates_pkey PRIMARY KEY (role, permission_key);
-- [10] publicrole_permission_templatesrole_permission_templates_role_c
ALTER TABLE ONLY public.role_permission_templates ADD CONSTRAINT role_permission_templates_role_check CHECK ((role = ANY (ARRAY['driver'::text, 'admin'::text, 'super_admin'::text])));
-- [10] publicuser_permission_overridesuser_permission_overrides_grant_
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_grant_type_check CHECK ((grant_type = ANY (ARRAY['allow'::text, 'deny'::text])));
-- [10] publicuser_permission_overridesuser_permission_overrides_pkey
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_pkey PRIMARY KEY (id);
-- [10] publicuser_permission_overridesuser_permission_overrides_user_i
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_user_id_permission_key_key UNIQUE (user_id, permission_key);
-- [10] publicuser_profilesuser_profiles_account_status_check
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_account_status_check CHECK ((account_status = ANY (ARRAY['pending_activation'::text, 'active'::text, 'suspended'::text])));
-- [10] publicuser_profilesuser_profiles_auth_user_id_key
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_auth_user_id_key UNIQUE (auth_user_id);
-- [10] publicuser_profilesuser_profiles_client_role_consistency
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_client_role_consistency CHECK ((((role = 'client'::text) = (client_id IS NOT NULL)) AND ((role <> 'client'::text) OR (org_id IS NULL))));
-- [10] publicuser_profilesuser_profiles_pkey
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
-- [10] publicuser_profilesuser_profiles_role_check
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK ((role = ANY (ARRAY['driver'::text, 'admin'::text, 'super_admin'::text, 'client'::text])));
-- [10] publicuser_profilesvalid_account_status
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT valid_account_status CHECK ((account_status = ANY (ARRAY['pending_activation'::text, 'active'::text, 'suspended'::text])));
-- [10] publicuser_profilesvalid_role
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT valid_role CHECK ((role = ANY (ARRAY['driver'::text, 'admin'::text, 'super_admin'::text, 'client'::text])));
-- [10] publicvehicle_catalogue_imagesvehicle_catalogue_images_colour_c
ALTER TABLE ONLY public.vehicle_catalogue_images ADD CONSTRAINT vehicle_catalogue_images_colour_check CHECK ((length(TRIM(BOTH FROM colour)) > 0));
-- [10] publicvehicle_catalogue_imagesvehicle_catalogue_images_image_pa
ALTER TABLE ONLY public.vehicle_catalogue_images ADD CONSTRAINT vehicle_catalogue_images_image_path_key UNIQUE (image_path);
-- [10] publicvehicle_catalogue_imagesvehicle_catalogue_images_make_che
ALTER TABLE ONLY public.vehicle_catalogue_images ADD CONSTRAINT vehicle_catalogue_images_make_check CHECK ((length(TRIM(BOTH FROM make)) > 0));
-- [10] publicvehicle_catalogue_imagesvehicle_catalogue_images_model_ch
ALTER TABLE ONLY public.vehicle_catalogue_images ADD CONSTRAINT vehicle_catalogue_images_model_check CHECK ((length(TRIM(BOTH FROM model)) > 0));
-- [10] publicvehicle_catalogue_imagesvehicle_catalogue_images_no_overl
ALTER TABLE ONLY public.vehicle_catalogue_images ADD CONSTRAINT vehicle_catalogue_images_no_overlap EXCLUDE USING gist (lower(make) WITH =, lower(model) WITH =, lower(colour) WITH =, int4range(year_from, year_to, '[]'::text) WITH &&);
-- [10] publicvehicle_catalogue_imagesvehicle_catalogue_images_pkey
ALTER TABLE ONLY public.vehicle_catalogue_images ADD CONSTRAINT vehicle_catalogue_images_pkey PRIMARY KEY (id);
-- [10] publicvehicle_catalogue_imagesvehicle_catalogue_images_year_fro
ALTER TABLE ONLY public.vehicle_catalogue_images ADD CONSTRAINT vehicle_catalogue_images_year_from_check CHECK (((year_from >= 1900) AND (year_from <= 2100)));
-- [10] publicvehicle_catalogue_imagesvehicle_catalogue_images_year_ord
ALTER TABLE ONLY public.vehicle_catalogue_images ADD CONSTRAINT vehicle_catalogue_images_year_order CHECK ((year_from <= year_to));
-- [10] publicvehicle_catalogue_imagesvehicle_catalogue_images_year_to_
ALTER TABLE ONLY public.vehicle_catalogue_images ADD CONSTRAINT vehicle_catalogue_images_year_to_check CHECK (((year_to >= 1900) AND (year_to <= 2100)));
-- [10] publicvehicle_make_aliasesvehicle_make_aliases_pkey
ALTER TABLE ONLY public.vehicle_make_aliases ADD CONSTRAINT vehicle_make_aliases_pkey PRIMARY KEY (alias);
-- [11] publicclientsclients_org_id_fkey
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publiccustomer_notificationscustomer_notifications_client_id_fk
ALTER TABLE ONLY public.customer_notifications ADD CONSTRAINT customer_notifications_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
-- [11] publiccustomer_notificationscustomer_notifications_job_id_fkey
ALTER TABLE ONLY public.customer_notifications ADD CONSTRAINT customer_notifications_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publiccustomer_notificationscustomer_notifications_org_id_fkey
ALTER TABLE ONLY public.customer_notifications ADD CONSTRAINT customer_notifications_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE CASCADE;
-- [11] publicdamage_itemsdamage_items_inspection_id_fkey
ALTER TABLE ONLY public.damage_items ADD CONSTRAINT damage_items_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE CASCADE;
-- [11] publicdamage_itemsdamage_items_org_id_fkey
ALTER TABLE ONLY public.damage_items ADD CONSTRAINT damage_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicdriver_digital_credential_eventsdriver_digital_credential
ALTER TABLE ONLY public.driver_digital_credential_events ADD CONSTRAINT driver_digital_credential_events_credential_id_fkey FOREIGN KEY (credential_id) REFERENCES public.driver_digital_credentials(id) ON DELETE RESTRICT;
-- [11] publicdriver_digital_credentialsdriver_digital_credentials_org_
ALTER TABLE ONLY public.driver_digital_credentials ADD CONSTRAINT driver_digital_credentials_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicdriver_digital_credentialsdriver_digital_credentials_user
ALTER TABLE ONLY public.driver_digital_credentials ADD CONSTRAINT driver_digital_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(auth_user_id) ON DELETE RESTRICT;
-- [11] publicdriver_onboardingdriver_onboarding_org_id_fkey
ALTER TABLE ONLY public.driver_onboarding ADD CONSTRAINT driver_onboarding_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE CASCADE;
-- [11] publicdriver_profilesdriver_profiles_org_id_fkey
ALTER TABLE ONLY public.driver_profiles ADD CONSTRAINT driver_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE CASCADE;
-- [11] publicdriver_profilesdriver_profiles_user_id_fkey
ALTER TABLE ONLY public.driver_profiles ADD CONSTRAINT driver_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(auth_user_id) ON DELETE CASCADE;
-- [11] publicevidence_itemsevidence_items_damage_item_id_fkey
ALTER TABLE ONLY public.evidence_items ADD CONSTRAINT evidence_items_damage_item_id_fkey FOREIGN KEY (damage_item_id) REFERENCES public.damage_items(id);
-- [11] publicevidence_itemsevidence_items_inspection_id_fkey
ALTER TABLE ONLY public.evidence_items ADD CONSTRAINT evidence_items_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id);
-- [11] publicevidence_itemsevidence_items_job_id_fkey
ALTER TABLE ONLY public.evidence_items ADD CONSTRAINT evidence_items_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);
-- [11] publicevidence_itemsevidence_items_org_id_fkey
ALTER TABLE ONLY public.evidence_items ADD CONSTRAINT evidence_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicexpense_receiptsexpense_receipts_expense_id_fkey
ALTER TABLE ONLY public.expense_receipts ADD CONSTRAINT expense_receipts_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;
-- [11] publicexpensesexpenses_job_id_fkey
ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicexpensesexpenses_org_id_fkey
ALTER TABLE ONLY public.expenses ADD CONSTRAINT expenses_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicinspectionsinspections_job_id_fkey
ALTER TABLE ONLY public.inspections ADD CONSTRAINT inspections_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicinspectionsinspections_org_id_fkey
ALTER TABLE ONLY public.inspections ADD CONSTRAINT inspections_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicinvoice_expensesinvoice_expenses_expense_id_fkey
ALTER TABLE ONLY public.invoice_expenses ADD CONSTRAINT invoice_expenses_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE SET NULL;
-- [11] publicinvoice_expensesinvoice_expenses_invoice_id_fkey
ALTER TABLE ONLY public.invoice_expenses ADD CONSTRAINT invoice_expenses_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
-- [11] publicinvoice_expensesinvoice_expenses_job_id_fkey
ALTER TABLE ONLY public.invoice_expenses ADD CONSTRAINT invoice_expenses_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
-- [11] publicinvoice_itemsinvoice_items_invoice_id_fkey
ALTER TABLE ONLY public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
-- [11] publicinvoice_itemsinvoice_items_job_id_fkey
ALTER TABLE ONLY public.invoice_items ADD CONSTRAINT invoice_items_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);
-- [11] publicinvoice_number_countersinvoice_number_counters_org_id_fke
ALTER TABLE ONLY public.invoice_number_counters ADD CONSTRAINT invoice_number_counters_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE CASCADE;
-- [11] publicinvoicesinvoices_client_id_fkey
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);
-- [11] publicinvoicesinvoices_credits_invoice_id_fkey
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_credits_invoice_id_fkey FOREIGN KEY (credits_invoice_id) REFERENCES public.invoices(id);
-- [11] publicinvoicesinvoices_job_id_fkey
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
-- [11] publicinvoicesinvoices_org_id_fkey
ALTER TABLE ONLY public.invoices ADD CONSTRAINT invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicjob_abort_eventsjob_abort_events_abort_id_fkey
ALTER TABLE ONLY public.job_abort_events ADD CONSTRAINT job_abort_events_abort_id_fkey FOREIGN KEY (abort_id) REFERENCES public.job_aborts(id) ON DELETE CASCADE;
-- [11] publicjob_abort_eventsjob_abort_events_job_id_fkey
ALTER TABLE ONLY public.job_abort_events ADD CONSTRAINT job_abort_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicjob_abort_eventsjob_abort_events_request_id_fkey
ALTER TABLE ONLY public.job_abort_events ADD CONSTRAINT job_abort_events_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.job_abort_requests(id) ON DELETE CASCADE;
-- [11] publicjob_abort_invoice_correctionsjob_abort_invoice_correction
ALTER TABLE ONLY public.job_abort_invoice_corrections ADD CONSTRAINT job_abort_invoice_corrections_abort_id_fkey FOREIGN KEY (abort_id) REFERENCES public.job_aborts(id);
-- [11] publicjob_abort_invoice_correctionsjob_abort_invoice_correction
ALTER TABLE ONLY public.job_abort_invoice_corrections ADD CONSTRAINT job_abort_invoice_corrections_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES public.invoices(id);
-- [11] publicjob_abort_invoice_correctionsjob_abort_invoice_correction
ALTER TABLE ONLY public.job_abort_invoice_corrections ADD CONSTRAINT job_abort_invoice_corrections_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id);
-- [11] publicjob_abort_invoice_correctionsjob_abort_invoice_correction
ALTER TABLE ONLY public.job_abort_invoice_corrections ADD CONSTRAINT job_abort_invoice_corrections_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicjob_abort_invoice_correctionsjob_abort_invoice_correction
ALTER TABLE ONLY public.job_abort_invoice_corrections ADD CONSTRAINT job_abort_invoice_corrections_original_invoice_id_fkey FOREIGN KEY (original_invoice_id) REFERENCES public.invoices(id);
-- [11] publicjob_abort_invoice_correctionsjob_abort_invoice_correction
ALTER TABLE ONLY public.job_abort_invoice_corrections ADD CONSTRAINT job_abort_invoice_corrections_replacement_invoice_id_fkey FOREIGN KEY (replacement_invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;
-- [11] publicjob_abort_requestsjob_abort_requests_abort_id_fkey
ALTER TABLE ONLY public.job_abort_requests ADD CONSTRAINT job_abort_requests_abort_id_fkey FOREIGN KEY (abort_id) REFERENCES public.job_aborts(id);
-- [11] publicjob_abort_requestsjob_abort_requests_job_id_fkey
ALTER TABLE ONLY public.job_abort_requests ADD CONSTRAINT job_abort_requests_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicjob_abort_requestsjob_abort_requests_org_id_fkey
ALTER TABLE ONLY public.job_abort_requests ADD CONSTRAINT job_abort_requests_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicjob_abortsjob_aborts_job_id_fkey
ALTER TABLE ONLY public.job_aborts ADD CONSTRAINT job_aborts_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicjob_abortsjob_aborts_org_id_fkey
ALTER TABLE ONLY public.job_aborts ADD CONSTRAINT job_aborts_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicjob_activity_logjob_activity_log_job_id_fkey
ALTER TABLE ONLY public.job_activity_log ADD CONSTRAINT job_activity_log_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicjob_activity_logjob_activity_log_org_id_fkey
ALTER TABLE ONLY public.job_activity_log ADD CONSTRAINT job_activity_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicjob_deviation_logjob_deviation_log_job_id_fkey
ALTER TABLE ONLY public.job_deviation_log ADD CONSTRAINT job_deviation_log_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicjob_deviation_logjob_deviation_log_org_id_fkey
ALTER TABLE ONLY public.job_deviation_log ADD CONSTRAINT job_deviation_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id) ON DELETE CASCADE;
-- [11] publicjob_deviation_logjob_deviation_log_recommended_job_id_fke
ALTER TABLE ONLY public.job_deviation_log ADD CONSTRAINT job_deviation_log_recommended_job_id_fkey FOREIGN KEY (recommended_job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
-- [11] publicjob_pricingjob_pricing_job_id_fkey
ALTER TABLE ONLY public.job_pricing ADD CONSTRAINT job_pricing_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicjob_status_overridesjob_status_overrides_job_id_fkey
ALTER TABLE ONLY public.job_status_overrides ADD CONSTRAINT job_status_overrides_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicjobsjobs_client_id_fkey
ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
-- [11] publicjobsjobs_driver_id_fkey
ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.driver_profiles(id) ON DELETE SET NULL;
-- [11] publicjobsjobs_org_id_fkey
ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicjobsjobs_rebooked_from_job_id_fkey
ALTER TABLE ONLY public.jobs ADD CONSTRAINT jobs_rebooked_from_job_id_fkey FOREIGN KEY (rebooked_from_job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;
-- [11] publicpermission_audit_logpermission_audit_log_actor_user_id_fk
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.user_profiles(auth_user_id) ON DELETE SET NULL;
-- [11] publicpermission_audit_logpermission_audit_log_permission_key_f
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.permissions_catalog(key) ON DELETE CASCADE;
-- [11] publicpermission_audit_logpermission_audit_log_target_user_id_f
ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.user_profiles(auth_user_id) ON DELETE CASCADE;
-- [11] publicphotosphotos_damage_item_id_fkey
ALTER TABLE ONLY public.photos ADD CONSTRAINT photos_damage_item_id_fkey FOREIGN KEY (damage_item_id) REFERENCES public.damage_items(id);
-- [11] publicphotosphotos_inspection_id_fkey
ALTER TABLE ONLY public.photos ADD CONSTRAINT photos_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id) ON DELETE SET NULL;
-- [11] publicphotosphotos_job_id_fkey
ALTER TABLE ONLY public.photos ADD CONSTRAINT photos_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicphotosphotos_org_id_fkey
ALTER TABLE ONLY public.photos ADD CONSTRAINT photos_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [11] publicpush_subscriptionspush_subscriptions_user_id_fkey
ALTER TABLE ONLY public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- [11] publicqr_confirmationsqr_confirmations_job_id_fkey
ALTER TABLE ONLY public.qr_confirmations ADD CONSTRAINT qr_confirmations_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
-- [11] publicrole_permission_templatesrole_permission_templates_permis
ALTER TABLE ONLY public.role_permission_templates ADD CONSTRAINT role_permission_templates_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.permissions_catalog(key) ON DELETE CASCADE;
-- [11] publicuser_permission_overridesuser_permission_overrides_grante
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.user_profiles(auth_user_id) ON DELETE SET NULL;
-- [11] publicuser_permission_overridesuser_permission_overrides_permis
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES public.permissions_catalog(key) ON DELETE CASCADE;
-- [11] publicuser_permission_overridesuser_permission_overrides_user_i
ALTER TABLE ONLY public.user_permission_overrides ADD CONSTRAINT user_permission_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.user_profiles(auth_user_id) ON DELETE CASCADE;
-- [11] publicuser_profilesuser_profiles_client_id_fkey
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE RESTRICT;
-- [11] publicuser_profilesuser_profiles_org_id_fkey
ALTER TABLE ONLY public.user_profiles ADD CONSTRAINT user_profiles_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.organisations(id);
-- [12] client_rate_cards_org_id_idx
CREATE INDEX client_rate_cards_org_id_idx ON public.client_rate_cards USING btree (org_id);
-- [12] customer_notifications_client_idx
CREATE INDEX customer_notifications_client_idx ON public.customer_notifications USING btree (client_id, created_at DESC);
-- [12] customer_notifications_open_idx
CREATE INDEX customer_notifications_open_idx ON public.customer_notifications USING btree (status, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'sending'::text, 'failed'::text]));
-- [12] damage_items_inspection_id_idx
CREATE INDEX damage_items_inspection_id_idx ON public.damage_items USING btree (inspection_id);
-- [12] driver_digital_credentials_org_idx
CREATE INDEX driver_digital_credentials_org_idx ON public.driver_digital_credentials USING btree (org_id);
-- [12] driver_digital_events_credential_idx
CREATE INDEX driver_digital_events_credential_idx ON public.driver_digital_credential_events USING btree (credential_id, created_at DESC);
-- [12] idx_admin_audit_log_created_at
CREATE INDEX idx_admin_audit_log_created_at ON public.admin_audit_log USING btree (created_at DESC);
-- [12] idx_admin_audit_log_target_org_id
CREATE INDEX idx_admin_audit_log_target_org_id ON public.admin_audit_log USING btree (target_org_id);
-- [12] idx_admin_audit_log_target_user_id
CREATE INDEX idx_admin_audit_log_target_user_id ON public.admin_audit_log USING btree (target_user_id);
-- [12] idx_attention_ack_exception_id
CREATE INDEX idx_attention_ack_exception_id ON public.attention_acknowledgements USING btree (exception_id);
-- [12] idx_attention_ack_snoozed
CREATE INDEX idx_attention_ack_snoozed ON public.attention_acknowledgements USING btree (snoozed_until) WHERE (snoozed_until IS NOT NULL);
-- [12] idx_clients_org_id
CREATE INDEX idx_clients_org_id ON public.clients USING btree (org_id);
-- [12] idx_clients_org_name
CREATE INDEX idx_clients_org_name ON public.clients USING btree (org_id, name);
-- [12] idx_compliance_checks_due
CREATE INDEX idx_compliance_checks_due ON public.compliance_checks USING btree (due_date) WHERE (due_date IS NOT NULL);
-- [12] idx_compliance_checks_org
CREATE INDEX idx_compliance_checks_org ON public.compliance_checks USING btree (org_id);
-- [12] idx_compliance_checks_related
CREATE INDEX idx_compliance_checks_related ON public.compliance_checks USING btree (related_type, related_id);
-- [12] idx_compliance_checks_status
CREATE INDEX idx_compliance_checks_status ON public.compliance_checks USING btree (status);
-- [12] idx_damage_items_active
CREATE INDEX idx_damage_items_active ON public.damage_items USING btree (inspection_id) WHERE (archived_at IS NULL);
-- [12] idx_damage_items_active_inspection
CREATE INDEX idx_damage_items_active_inspection ON public.damage_items USING btree (inspection_id) WHERE (archived_at IS NULL);
-- [12] idx_damage_items_org_id
CREATE INDEX idx_damage_items_org_id ON public.damage_items USING btree (org_id);
-- [12] idx_damage_items_submission_session
CREATE INDEX idx_damage_items_submission_session ON public.damage_items USING btree (submission_session_id) WHERE (submission_session_id IS NOT NULL);
-- [12] idx_deviation_log_job
CREATE INDEX idx_deviation_log_job ON public.job_deviation_log USING btree (job_id);
-- [12] idx_deviation_log_org
CREATE INDEX idx_deviation_log_org ON public.job_deviation_log USING btree (org_id);
-- [12] idx_driver_profiles_archived
CREATE INDEX idx_driver_profiles_archived ON public.driver_profiles USING btree (archived_at) WHERE (archived_at IS NOT NULL);
-- [12] idx_driver_profiles_archived_at
CREATE INDEX idx_driver_profiles_archived_at ON public.driver_profiles USING btree (archived_at);
-- [12] idx_driver_profiles_is_active_archived
CREATE INDEX idx_driver_profiles_is_active_archived ON public.driver_profiles USING btree (is_active, archived_at);
-- [12] idx_driver_profiles_org_id
CREATE INDEX idx_driver_profiles_org_id ON public.driver_profiles USING btree (org_id);
-- [12] idx_driver_profiles_user_id
CREATE INDEX idx_driver_profiles_user_id ON public.driver_profiles USING btree (user_id);
-- [12] idx_evidence_items_captured_at
CREATE INDEX idx_evidence_items_captured_at ON public.evidence_items USING btree (captured_at);
-- [12] idx_evidence_items_damage_item
CREATE INDEX idx_evidence_items_damage_item ON public.evidence_items USING btree (damage_item_id);
-- [12] idx_evidence_items_hash
CREATE INDEX idx_evidence_items_hash ON public.evidence_items USING btree (hash);
-- [12] idx_evidence_items_inspection
CREATE INDEX idx_evidence_items_inspection ON public.evidence_items USING btree (inspection_id);
-- [12] idx_evidence_items_job_stage
CREATE INDEX idx_evidence_items_job_stage ON public.evidence_items USING btree (job_id, stage);
-- [12] idx_evidence_items_org
CREATE INDEX idx_evidence_items_org ON public.evidence_items USING btree (org_id);
-- [12] idx_expense_receipts_expense_id
CREATE INDEX idx_expense_receipts_expense_id ON public.expense_receipts USING btree (expense_id);
-- [12] idx_expenses_date
CREATE INDEX idx_expenses_date ON public.expenses USING btree (date DESC);
-- [12] idx_expenses_is_hidden
CREATE INDEX idx_expenses_is_hidden ON public.expenses USING btree (is_hidden) WHERE (is_hidden = false);
-- [12] idx_expenses_job_id
CREATE INDEX idx_expenses_job_id ON public.expenses USING btree (job_id);
-- [12] idx_expenses_org_id
CREATE INDEX idx_expenses_org_id ON public.expenses USING btree (org_id);
-- [12] idx_inspections_active
CREATE INDEX idx_inspections_active ON public.inspections USING btree (job_id) WHERE (archived_at IS NULL);
-- [12] idx_inspections_active_job
CREATE INDEX idx_inspections_active_job ON public.inspections USING btree (job_id) WHERE (archived_at IS NULL);
-- [12] idx_inspections_org_id
CREATE INDEX idx_inspections_org_id ON public.inspections USING btree (org_id);
-- [12] idx_inspections_submission_session
CREATE INDEX idx_inspections_submission_session ON public.inspections USING btree (submission_session_id) WHERE (submission_session_id IS NOT NULL);
-- [12] idx_invoice_expenses_invoice_id
CREATE INDEX idx_invoice_expenses_invoice_id ON public.invoice_expenses USING btree (invoice_id);
-- [12] idx_invoice_expenses_job_id
CREATE INDEX idx_invoice_expenses_job_id ON public.invoice_expenses USING btree (job_id);
-- [12] idx_invoice_items_invoice_id
CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items USING btree (invoice_id);
-- [12] idx_invoice_items_job_id
CREATE INDEX idx_invoice_items_job_id ON public.invoice_items USING btree (job_id);
-- [12] idx_invoices_client_id
CREATE INDEX idx_invoices_client_id ON public.invoices USING btree (client_id);
-- [12] idx_invoices_job_id
CREATE INDEX idx_invoices_job_id ON public.invoices USING btree (job_id);
-- [12] idx_invoices_org_id
CREATE INDEX idx_invoices_org_id ON public.invoices USING btree (org_id);
-- [12] idx_invoices_status
CREATE INDEX idx_invoices_status ON public.invoices USING btree (status);
-- [12] idx_job_activity_log_org_id
CREATE INDEX idx_job_activity_log_org_id ON public.job_activity_log USING btree (org_id);
-- [12] idx_jobs_driver_id
CREATE INDEX idx_jobs_driver_id ON public.jobs USING btree (driver_id);
-- [12] idx_jobs_is_hidden
CREATE INDEX idx_jobs_is_hidden ON public.jobs USING btree (is_hidden) WHERE (is_hidden = false);
-- [12] idx_jobs_org_id
CREATE INDEX idx_jobs_org_id ON public.jobs USING btree (org_id);
-- [12] idx_jobs_sheet_job_id
CREATE INDEX idx_jobs_sheet_job_id ON public.jobs USING btree (sheet_job_id);
-- [12] idx_onboarding_documents_expires
CREATE INDEX idx_onboarding_documents_expires ON public.onboarding_documents USING btree (expires_at) WHERE (expires_at IS NOT NULL);
-- [12] idx_onboarding_documents_org
CREATE INDEX idx_onboarding_documents_org ON public.onboarding_documents USING btree (org_id);
-- [12] idx_onboarding_documents_related
CREATE INDEX idx_onboarding_documents_related ON public.onboarding_documents USING btree (related_type, related_id);
-- [12] idx_onboarding_org
CREATE INDEX idx_onboarding_org ON public.driver_onboarding USING btree (org_id);
-- [12] idx_onboarding_status
CREATE INDEX idx_onboarding_status ON public.driver_onboarding USING btree (status);
-- [12] idx_permission_audit_log_created_at
CREATE INDEX idx_permission_audit_log_created_at ON public.permission_audit_log USING btree (created_at DESC);
-- [12] idx_permission_audit_log_permission_key
CREATE INDEX idx_permission_audit_log_permission_key ON public.permission_audit_log USING btree (permission_key);
-- [12] idx_permission_audit_log_target_user_id
CREATE INDEX idx_permission_audit_log_target_user_id ON public.permission_audit_log USING btree (target_user_id);
-- [12] idx_photos_active
CREATE INDEX idx_photos_active ON public.photos USING btree (job_id) WHERE (archived_at IS NULL);
-- [12] idx_photos_active_job
CREATE INDEX idx_photos_active_job ON public.photos USING btree (job_id) WHERE (archived_at IS NULL);
-- [12] idx_photos_damage_item_id
CREATE INDEX idx_photos_damage_item_id ON public.photos USING btree (damage_item_id);
-- [12] idx_photos_org_id
CREATE INDEX idx_photos_org_id ON public.photos USING btree (org_id);
-- [12] idx_pricing_snapshots_job_id
CREATE INDEX idx_pricing_snapshots_job_id ON public.pricing_snapshots USING btree (job_id);
-- [12] idx_pricing_snapshots_org_id
CREATE INDEX idx_pricing_snapshots_org_id ON public.pricing_snapshots USING btree (org_id);
-- [12] idx_role_permission_templates_permission_key
CREATE INDEX idx_role_permission_templates_permission_key ON public.role_permission_templates USING btree (permission_key);
-- [12] idx_role_permission_templates_role
CREATE INDEX idx_role_permission_templates_role ON public.role_permission_templates USING btree (role);
-- [12] idx_user_permission_overrides_permission_key
CREATE INDEX idx_user_permission_overrides_permission_key ON public.user_permission_overrides USING btree (permission_key);
-- [12] idx_user_permission_overrides_user_id
CREATE INDEX idx_user_permission_overrides_user_id ON public.user_permission_overrides USING btree (user_id);
-- [12] idx_user_permission_overrides_user_permission
CREATE INDEX idx_user_permission_overrides_user_permission ON public.user_permission_overrides USING btree (user_id, permission_key);
-- [12] idx_user_profiles_account_status
CREATE INDEX idx_user_profiles_account_status ON public.user_profiles USING btree (account_status);
-- [12] idx_user_profiles_email
CREATE INDEX idx_user_profiles_email ON public.user_profiles USING btree (email);
-- [12] idx_user_profiles_org_id
CREATE INDEX idx_user_profiles_org_id ON public.user_profiles USING btree (org_id);
-- [12] idx_user_profiles_org_role_status
CREATE INDEX idx_user_profiles_org_role_status ON public.user_profiles USING btree (org_id, role, account_status);
-- [12] idx_user_profiles_role
CREATE INDEX idx_user_profiles_role ON public.user_profiles USING btree (role);
-- [12] inspections_job_id_idx
CREATE INDEX inspections_job_id_idx ON public.inspections USING btree (job_id);
-- [12] invoice_expenses_expense_id_unique
CREATE UNIQUE INDEX invoice_expenses_expense_id_unique ON public.invoice_expenses USING btree (expense_id) WHERE ((expense_id IS NOT NULL) AND (NOT voided));
-- [12] invoice_items_job_id_unique
CREATE UNIQUE INDEX invoice_items_job_id_unique ON public.invoice_items USING btree (job_id) WHERE ((job_id IS NOT NULL) AND (NOT voided));
-- [12] invoices_one_credit_note_per_invoice
CREATE UNIQUE INDEX invoices_one_credit_note_per_invoice ON public.invoices USING btree (credits_invoice_id) WHERE (credits_invoice_id IS NOT NULL);
-- [12] job_abort_events_job_idx
CREATE INDEX job_abort_events_job_idx ON public.job_abort_events USING btree (job_id, created_at);
-- [12] job_abort_invoice_corrections_job_idx
CREATE INDEX job_abort_invoice_corrections_job_idx ON public.job_abort_invoice_corrections USING btree (job_id, created_at DESC);
-- [12] job_abort_requests_one_pending
CREATE UNIQUE INDEX job_abort_requests_one_pending ON public.job_abort_requests USING btree (job_id) WHERE (status = 'pending'::text);
-- [12] job_abort_requests_org_status_idx
CREATE INDEX job_abort_requests_org_status_idx ON public.job_abort_requests USING btree (org_id, status, requested_at DESC);
-- [12] job_aborts_job_run_key
CREATE UNIQUE INDEX job_aborts_job_run_key ON public.job_aborts USING btree (job_id, COALESCE(run_id, '00000000-0000-0000-0000-000000000000'::uuid));
-- [12] job_aborts_org_finance_idx
CREATE INDEX job_aborts_org_finance_idx ON public.job_aborts USING btree (org_id, finance_status, confirmed_at DESC);
-- [12] job_activity_log_job_id_idx
CREATE INDEX job_activity_log_job_id_idx ON public.job_activity_log USING btree (job_id);
-- [12] job_pricing_org_idx
CREATE INDEX job_pricing_org_idx ON public.job_pricing USING btree (org_id);
-- [12] job_status_overrides_job_idx
CREATE INDEX job_status_overrides_job_idx ON public.job_status_overrides USING btree (job_id, created_at DESC);
-- [12] jobs_completed_at_idx
CREATE INDEX jobs_completed_at_idx ON public.jobs USING btree (completed_at);
-- [12] jobs_rebooked_from_idx
CREATE INDEX jobs_rebooked_from_idx ON public.jobs USING btree (rebooked_from_job_id) WHERE (rebooked_from_job_id IS NOT NULL);
-- [12] jobs_status_idx
CREATE INDEX jobs_status_idx ON public.jobs USING btree (status);
-- [12] photos_backend_ref_unique
CREATE UNIQUE INDEX photos_backend_ref_unique ON public.photos USING btree (backend_ref);
-- [12] photos_inspection_id_idx
CREATE INDEX photos_inspection_id_idx ON public.photos USING btree (inspection_id);
-- [12] photos_job_id_idx
CREATE INDEX photos_job_id_idx ON public.photos USING btree (job_id);
-- [12] push_subscriptions_user_id_idx
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions USING btree (user_id);
-- [12] uq_inspections_active_per_job_type
CREATE UNIQUE INDEX uq_inspections_active_per_job_type ON public.inspections USING btree (job_id, type) WHERE (archived_at IS NULL);
-- [12] uq_inspections_active_submission_session
CREATE UNIQUE INDEX uq_inspections_active_submission_session ON public.inspections USING btree (submission_session_id) WHERE ((submission_session_id IS NOT NULL) AND (archived_at IS NULL));
-- [12] user_profiles_client_id_idx
CREATE INDEX user_profiles_client_id_idx ON public.user_profiles USING btree (client_id) WHERE (client_id IS NOT NULL);
-- [12] vehicle_catalogue_images_lookup_idx
CREATE INDEX vehicle_catalogue_images_lookup_idx ON public.vehicle_catalogue_images USING btree (lower(make), lower(model), year_from, year_to);
-- [13] app_settingstrg_app_settings_audit
CREATE TRIGGER trg_app_settings_audit AFTER INSERT OR DELETE OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.audit_app_settings_change();
-- [13] client_logsstamp_client_log_identity
CREATE TRIGGER stamp_client_log_identity BEFORE INSERT ON public.client_logs FOR EACH ROW EXECUTE FUNCTION public.stamp_client_log_identity();
-- [13] client_rate_cardstrg_client_rate_cards_updated_at
CREATE TRIGGER trg_client_rate_cards_updated_at BEFORE UPDATE ON public.client_rate_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- [13] clientsset_clients_updated_at
CREATE TRIGGER set_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- [13] compliance_checkstrg_compliance_checks_updated_at
CREATE TRIGGER trg_compliance_checks_updated_at BEFORE UPDATE ON public.compliance_checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- [13] driver_onboardingupdate_driver_onboarding_updated_at
CREATE TRIGGER update_driver_onboarding_updated_at BEFORE UPDATE ON public.driver_onboarding FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- [13] driver_profilesdigital_id_driver_state_change
CREATE TRIGGER digital_id_driver_state_change AFTER INSERT OR UPDATE OF is_active, archived_at, org_id, full_name ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION axentra_private.on_digital_id_driver_change();
-- [13] driver_profilesguard_driver_digital_id_state
CREATE TRIGGER guard_driver_digital_id_state BEFORE UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_driver_digital_id_state();
-- [13] driver_profilesupdate_driver_profiles_updated_at
CREATE TRIGGER update_driver_profiles_updated_at BEFORE UPDATE ON public.driver_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- [13] evidence_itemstrg_evidence_set_org
CREATE TRIGGER trg_evidence_set_org BEFORE INSERT ON public.evidence_items FOR EACH ROW EXECUTE FUNCTION public.set_evidence_org_from_job();
-- [13] evidence_itemstrg_evidence_touch_updated
CREATE TRIGGER trg_evidence_touch_updated BEFORE UPDATE ON public.evidence_items FOR EACH ROW EXECUTE FUNCTION public.touch_evidence_updated_at();
-- [13] expensestrg_expenses_inherit_is_test
CREATE TRIGGER trg_expenses_inherit_is_test BEFORE INSERT ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.inherit_is_test_from_job();
-- [13] expensesupdate_expenses_updated_at
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- [13] inspectionsinspections_link_photos_after_ins
CREATE TRIGGER inspections_link_photos_after_ins AFTER INSERT ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.trg_inspections_link_photos();
-- [13] inspectionsinspections_link_photos_after_update
CREATE TRIGGER inspections_link_photos_after_update AFTER UPDATE OF type, job_id, org_id ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.trg_inspections_link_photos();
-- [13] inspectionsupdate_inspections_updated_at
CREATE TRIGGER update_inspections_updated_at BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- [13] invoice_expensestrg_invoice_expenses_guard_lifecycle
CREATE TRIGGER trg_invoice_expenses_guard_lifecycle BEFORE INSERT OR DELETE OR UPDATE ON public.invoice_expenses FOR EACH ROW EXECUTE FUNCTION public.invoice_lines_guard_lifecycle();
-- [13] invoice_itemstrg_invoice_items_abort_guard
CREATE TRIGGER trg_invoice_items_abort_guard BEFORE INSERT OR UPDATE OF job_id, amount, voided ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.guard_abort_invoicing();
-- [13] invoice_itemstrg_invoice_items_guard_lifecycle
CREATE TRIGGER trg_invoice_items_guard_lifecycle BEFORE INSERT OR DELETE OR UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.invoice_lines_guard_lifecycle();
-- [13] invoice_itemstrg_invoice_items_one_live_per_job
CREATE TRIGGER trg_invoice_items_one_live_per_job BEFORE INSERT OR UPDATE OF job_id, voided, invoice_id ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.guard_one_live_invoice_per_job();
-- [13] invoice_itemstrg_link_corrected_abort_invoice_item
CREATE TRIGGER trg_link_corrected_abort_invoice_item AFTER INSERT ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.link_corrected_abort_invoice();
-- [13] invoicestrg_invoices_abort_guard
CREATE TRIGGER trg_invoices_abort_guard BEFORE INSERT OR UPDATE OF job_id, status, document_type, subtotal ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_abort_invoicing();
-- [13] invoicestrg_invoices_guard_lifecycle
CREATE TRIGGER trg_invoices_guard_lifecycle BEFORE DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoices_guard_lifecycle();
-- [13] invoicestrg_invoices_inherit_is_test
CREATE TRIGGER trg_invoices_inherit_is_test BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.inherit_is_test_from_job();
-- [13] invoicestrg_invoices_one_live_per_job
CREATE TRIGGER trg_invoices_one_live_per_job BEFORE INSERT OR UPDATE OF job_id, status, document_type ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.guard_one_live_invoice_per_job();
-- [13] invoicestrg_link_corrected_abort_legacy_invoice
CREATE TRIGGER trg_link_corrected_abort_legacy_invoice AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.link_corrected_abort_invoice();
-- [13] invoicesupdate_invoices_updated_at
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- [13] job_pricingupdate_job_pricing_updated_at
CREATE TRIGGER update_job_pricing_updated_at BEFORE UPDATE ON public.job_pricing FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- [13] jobstrg_auto_link_job_to_client
CREATE TRIGGER trg_auto_link_job_to_client BEFORE INSERT OR UPDATE OF client_name, client_company, client_id ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.auto_link_job_to_client();
-- [13] jobstrg_enqueue_customer_notification
CREATE TRIGGER trg_enqueue_customer_notification AFTER UPDATE OF status ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.enqueue_customer_notification();
-- [13] jobstrg_jobs_completed_at_semantics
CREATE TRIGGER trg_jobs_completed_at_semantics BEFORE INSERT OR UPDATE OF status, completed_at ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.enforce_completed_at_semantics();
-- [13] jobstrg_jobs_guard_abort_status
CREATE TRIGGER trg_jobs_guard_abort_status BEFORE INSERT OR UPDATE OF status ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.guard_job_abort_status();
-- [13] jobstrg_jobs_guard_driver_writes
CREATE TRIGGER trg_jobs_guard_driver_writes BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.guard_job_driver_writes();
-- [13] jobsupdate_jobs_updated_at
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- [13] jobszz_jobs_catalogue_image
CREATE TRIGGER zz_jobs_catalogue_image BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.jobs_set_catalogue_image();
-- [13] onboarding_documentstrg_onboarding_documents_updated_at
CREATE TRIGGER trg_onboarding_documents_updated_at BEFORE UPDATE ON public.onboarding_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- [13] organisationstrg_organisations_set_updated_at
CREATE TRIGGER trg_organisations_set_updated_at BEFORE UPDATE ON public.organisations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- [13] pauthuserson_auth_user_created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- [13] photosset_photos_updated_at
CREATE TRIGGER set_photos_updated_at BEFORE UPDATE ON public.photos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- [13] photostrg_link_photo_to_inspection_on_insert
CREATE TRIGGER trg_link_photo_to_inspection_on_insert AFTER INSERT ON public.photos FOR EACH ROW EXECUTE FUNCTION public.link_photo_to_inspection_on_insert();
-- [13] photostrg_link_photo_to_inspection_on_update
CREATE TRIGGER trg_link_photo_to_inspection_on_update AFTER UPDATE OF type, inspection_id ON public.photos FOR EACH ROW EXECUTE FUNCTION public.link_photo_to_inspection_on_update();
-- [13] photostrg_photos_guard_identity
CREATE TRIGGER trg_photos_guard_identity BEFORE UPDATE OF job_id, org_id, run_id ON public.photos FOR EACH ROW EXECUTE FUNCTION public.guard_photo_identity_columns();
-- [13] photostrg_photos_set_org
CREATE TRIGGER trg_photos_set_org BEFORE INSERT ON public.photos FOR EACH ROW EXECUTE FUNCTION public.set_photo_org_from_job();
-- [13] photostrg_photos_sync_damage
CREATE TRIGGER trg_photos_sync_damage AFTER INSERT ON public.photos FOR EACH ROW EXECUTE FUNCTION public.sync_damage_photo_url();
-- [13] user_permission_overridestrg_user_permission_overrides_updated_
CREATE TRIGGER trg_user_permission_overrides_updated_at BEFORE UPDATE ON public.user_permission_overrides FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- [13] user_profilesdigital_id_account_state_change
CREATE TRIGGER digital_id_account_state_change AFTER INSERT OR UPDATE OF account_status, role, org_id, full_name, first_name, last_name ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION axentra_private.on_digital_id_account_change();
-- [13] user_profilestrg_user_profiles_full_name
CREATE TRIGGER trg_user_profiles_full_name BEFORE INSERT OR UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.user_profiles_sync_full_name();
-- [13] user_profilestrg_user_profiles_guard_privileged
CREATE TRIGGER trg_user_profiles_guard_privileged BEFORE INSERT OR UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.guard_user_profile_privileged_columns();
-- [13] user_profilestrg_user_profiles_updated_at
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- [13] user_profilesupdate_user_profiles_updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- [13] vehicle_catalogue_imagescatalogue_images_refresh_jobs
CREATE TRIGGER catalogue_images_refresh_jobs AFTER INSERT OR DELETE OR UPDATE ON public.vehicle_catalogue_images FOR EACH ROW EXECUTE FUNCTION public.catalogue_refresh_jobs();
-- [13] vehicle_make_aliasesmake_aliases_refresh_jobs
CREATE TRIGGER make_aliases_refresh_jobs AFTER INSERT OR UPDATE ON public.vehicle_make_aliases FOR EACH STATEMENT EXECUTE FUNCTION public.catalogue_refresh_jobs();
-- [14] publicadmin_audit_log
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
-- [14] publicapp_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
-- [14] publicattention_acknowledgements
ALTER TABLE public.attention_acknowledgements ENABLE ROW LEVEL SECURITY;
-- [14] publicclient_logs
ALTER TABLE public.client_logs ENABLE ROW LEVEL SECURITY;
-- [14] publicclient_rate_cards
ALTER TABLE public.client_rate_cards ENABLE ROW LEVEL SECURITY;
-- [14] publicclients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
-- [14] publiccompliance_checks
ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;
-- [14] publiccustomer_notifications
ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;
-- [14] publicdamage_items
ALTER TABLE public.damage_items ENABLE ROW LEVEL SECURITY;
-- [14] publicdriver_digital_credential_events
ALTER TABLE public.driver_digital_credential_events ENABLE ROW LEVEL SECURITY;
-- [14] publicdriver_digital_credentials
ALTER TABLE public.driver_digital_credentials ENABLE ROW LEVEL SECURITY;
-- [14] publicdriver_onboarding
ALTER TABLE public.driver_onboarding ENABLE ROW LEVEL SECURITY;
-- [14] publicdriver_profiles
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
-- [14] publicevidence_items
ALTER TABLE public.evidence_items ENABLE ROW LEVEL SECURITY;
-- [14] publicexpense_receipts
ALTER TABLE public.expense_receipts ENABLE ROW LEVEL SECURITY;
-- [14] publicexpenses
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
-- [14] publicinspections
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
-- [14] publicinvoice_expenses
ALTER TABLE public.invoice_expenses ENABLE ROW LEVEL SECURITY;
-- [14] publicinvoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
-- [14] publicinvoice_number_counters
ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;
-- [14] publicinvoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
-- [14] publicjob_abort_events
ALTER TABLE public.job_abort_events ENABLE ROW LEVEL SECURITY;
-- [14] publicjob_abort_invoice_corrections
ALTER TABLE public.job_abort_invoice_corrections ENABLE ROW LEVEL SECURITY;
-- [14] publicjob_abort_requests
ALTER TABLE public.job_abort_requests ENABLE ROW LEVEL SECURITY;
-- [14] publicjob_aborts
ALTER TABLE public.job_aborts ENABLE ROW LEVEL SECURITY;
-- [14] publicjob_activity_log
ALTER TABLE public.job_activity_log ENABLE ROW LEVEL SECURITY;
-- [14] publicjob_deviation_log
ALTER TABLE public.job_deviation_log ENABLE ROW LEVEL SECURITY;
-- [14] publicjob_pricing
ALTER TABLE public.job_pricing ENABLE ROW LEVEL SECURITY;
-- [14] publicjob_status_overrides
ALTER TABLE public.job_status_overrides ENABLE ROW LEVEL SECURITY;
-- [14] publicjobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
-- [14] publiconboarding_documents
ALTER TABLE public.onboarding_documents ENABLE ROW LEVEL SECURITY;
-- [14] publicorganisations
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
-- [14] publicpermission_audit_log
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
-- [14] publicpermissions_catalog
ALTER TABLE public.permissions_catalog ENABLE ROW LEVEL SECURITY;
-- [14] publicphotos
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
-- [14] publicpricing_snapshots
ALTER TABLE public.pricing_snapshots ENABLE ROW LEVEL SECURITY;
-- [14] publicpush_config
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
-- [14] publicpush_subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
-- [14] publicqr_confirmations
ALTER TABLE public.qr_confirmations ENABLE ROW LEVEL SECURITY;
-- [14] publicrole_permission_templates
ALTER TABLE public.role_permission_templates ENABLE ROW LEVEL SECURITY;
-- [14] publicuser_permission_overrides
ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;
-- [14] publicuser_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
-- [14] publicvehicle_catalogue_images
ALTER TABLE public.vehicle_catalogue_images ENABLE ROW LEVEL SECURITY;
-- [14] publicvehicle_make_aliases
ALTER TABLE public.vehicle_make_aliases ENABLE ROW LEVEL SECURITY;
-- [15] publicadmin_audit_logadmin_audit_log_select_admin_super
CREATE POLICY admin_audit_log_select_admin_super ON public.admin_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (target_org_id = public.user_org_id()))));
-- [15] publicapp_settingsSuper admins can write app_settings
CREATE POLICY "Super admins can write app_settings" ON public.app_settings AS PERMISSIVE FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
-- [15] publicapp_settingsapp_settings_legacy_no_access
CREATE POLICY app_settings_legacy_no_access ON public.app_settings AS PERMISSIVE FOR SELECT TO anon USING (false);
-- [15] publicapp_settingsapp_settings_read_feature_flags
CREATE POLICY app_settings_read_feature_flags ON public.app_settings AS PERMISSIVE FOR SELECT TO anon, authenticated USING (((jsonb_typeof(value) = 'boolean'::text) OR (value = ANY (ARRAY['"true"'::jsonb, '"false"'::jsonb]))));
-- [15] publicapp_settingsapp_settings_read_staff
CREATE POLICY app_settings_read_staff ON public.app_settings AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.user_org_id() IS NOT NULL)));
-- [15] publicattention_acknowledgementsAdmins can manage attention ack
CREATE POLICY "Admins can manage attention acknowledgements" ON public.attention_acknowledgements AS PERMISSIVE FOR ALL TO authenticated USING ((public.user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text]))) WITH CHECK ((public.user_role() = ANY (ARRAY['admin'::text, 'super_admin'::text])));
-- [15] publicclient_logsAllow insert for anon on client_logs
CREATE POLICY "Allow insert for anon on client_logs" ON public.client_logs AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK (((severity = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text])) AND (event IS NOT NULL) AND ((char_length(event) >= 1) AND (char_length(event) <= 128)) AND ((message IS NULL) OR (char_length(message) <= 4000)) AND ((user_id IS NULL) OR (char_length(user_id) <= 64)) AND ((job_id IS NULL) OR (char_length(job_id) <= 64)) AND ((context IS NULL) OR (char_length((context)::text) <= 16384))));
-- [15] publicclient_logsAuthenticated users can read client_logs
CREATE POLICY "Authenticated users can read client_logs" ON public.client_logs AS PERMISSIVE FOR SELECT TO authenticated USING (public.is_super_admin());
-- [15] publicclient_logsclient_logs_select_admin
CREATE POLICY client_logs_select_admin ON public.client_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((((context ->> 'org_id'::text))::uuid = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicclient_rate_cardsAdmins can delete rate cards in their or
CREATE POLICY "Admins can delete rate cards in their org" ON public.client_rate_cards AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicclient_rate_cardsAdmins can insert rate cards in their or
CREATE POLICY "Admins can insert rate cards in their org" ON public.client_rate_cards AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicclient_rate_cardsAdmins can update rate cards in their or
CREATE POLICY "Admins can update rate cards in their org" ON public.client_rate_cards AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicclient_rate_cardsAdmins can view rate cards in their org
CREATE POLICY "Admins can view rate cards in their org" ON public.client_rate_cards AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicclientsclients_delete_admin
CREATE POLICY clients_delete_admin ON public.clients AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicclientsclients_insert_admin
CREATE POLICY clients_insert_admin ON public.clients AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicclientsclients_select
CREATE POLICY clients_select ON public.clients AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicclientsclients_update_admin
CREATE POLICY clients_update_admin ON public.clients AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin()))) WITH CHECK ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publiccompliance_checkscompliance_checks_select_scoped
CREATE POLICY compliance_checks_select_scoped ON public.compliance_checks AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())) OR ((related_type = 'driver'::text) AND (related_id IN ( SELECT driver_profiles.id
   FROM public.driver_profiles
  WHERE (driver_profiles.user_id = auth.uid()))))));
-- [15] publiccompliance_checkscompliance_checks_write_admin
CREATE POLICY compliance_checks_write_admin ON public.compliance_checks AS PERMISSIVE FOR ALL TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publiccustomer_notificationscustomer_notifications_select_admin
CREATE POLICY customer_notifications_select_admin ON public.customer_notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicdamage_itemsdamage_items_delete_org
CREATE POLICY damage_items_delete_org ON public.damage_items AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicdamage_itemsdamage_items_insert_org
CREATE POLICY damage_items_insert_org ON public.damage_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicdamage_itemsdamage_items_select_scoped
CREATE POLICY damage_items_select_scoped ON public.damage_items AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR public.driver_can_read_inspection_evidence(inspection_id)))));
-- [15] publicdamage_itemsdamage_items_update_org
CREATE POLICY damage_items_update_org ON public.damage_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id()))) WITH CHECK ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicdriver_digital_credential_eventsdigital_id_history_admin_
CREATE POLICY digital_id_history_admin_only ON public.driver_digital_credential_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.driver_digital_credentials c
  WHERE ((c.id = driver_digital_credential_events.credential_id) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (c.org_id = public.user_org_id())))))));
-- [15] publicdriver_digital_credentialsdigital_id_credential_read_self
CREATE POLICY digital_id_credential_read_self_or_admin ON public.driver_digital_credentials AS PERMISSIVE FOR SELECT TO authenticated USING ((((user_id = ( SELECT auth.uid() AS uid)) AND (status = 'active'::text) AND (EXISTS ( SELECT 1
   FROM (public.user_profiles u
     LEFT JOIN public.driver_profiles d ON ((d.user_id = u.auth_user_id)))
  WHERE ((u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (u.account_status = 'active'::text) AND ((u.role = 'driver'::text) OR ((u.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (d.id IS NOT NULL) AND d.is_active AND (d.archived_at IS NULL) AND (NOT (d.org_id IS DISTINCT FROM u.org_id)))))))) OR public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicdriver_onboardingdriver_onboarding_delete_admin
CREATE POLICY driver_onboarding_delete_admin ON public.driver_onboarding AS PERMISSIVE FOR DELETE TO PUBLIC USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicdriver_onboardingdriver_onboarding_insert_admin
CREATE POLICY driver_onboarding_insert_admin ON public.driver_onboarding AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicdriver_onboardingdriver_onboarding_select
CREATE POLICY driver_onboarding_select ON public.driver_onboarding AS PERMISSIVE FOR SELECT TO PUBLIC USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin()) OR (linked_user_id = auth.uid()) OR ((email IS NOT NULL) AND (email = (auth.jwt() ->> 'email'::text)))));
-- [15] publicdriver_onboardingdriver_onboarding_update_admin
CREATE POLICY driver_onboarding_update_admin ON public.driver_onboarding AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin()))) WITH CHECK ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicdriver_profilesdriver_profiles_insert_self_admin_super
CREATE POLICY driver_profiles_insert_self_admin_super ON public.driver_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((((user_id = auth.uid()) AND (org_id = public.user_org_id())) OR public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicdriver_profilesdriver_profiles_select_self_admin_super
CREATE POLICY driver_profiles_select_self_admin_super ON public.driver_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicdriver_profilesdriver_profiles_update_admin_super_same_or
CREATE POLICY driver_profiles_update_admin_super_same_org ON public.driver_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())))) WITH CHECK (((user_id = auth.uid()) OR public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicevidence_itemsevidence_items_delete_org
CREATE POLICY evidence_items_delete_org ON public.evidence_items AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicevidence_itemsevidence_items_insert_job_org
CREATE POLICY evidence_items_insert_job_org ON public.evidence_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.id = evidence_items.job_id) AND (j.org_id = public.user_org_id()))))));
-- [15] publicevidence_itemsevidence_items_select_org
CREATE POLICY evidence_items_select_org ON public.evidence_items AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR public.driver_can_read_job_evidence(job_id)))));
-- [15] publicevidence_itemsevidence_items_update_org
CREATE POLICY evidence_items_update_org ON public.evidence_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id()))) WITH CHECK ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicexpense_receiptsexpense_receipts_delete_scoped
CREATE POLICY expense_receipts_delete_scoped ON public.expense_receipts AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.expenses e
  WHERE ((e.id = expense_receipts.expense_id) AND (e.org_id = public.user_org_id()))))) OR (public.driver_can_access_expense((expense_id)::text) AND (NOT public.expense_is_invoiced(expense_id)))));
-- [15] publicexpense_receiptsexpense_receipts_insert_scoped
CREATE POLICY expense_receipts_insert_scoped ON public.expense_receipts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.expenses e
  WHERE ((e.id = expense_receipts.expense_id) AND (e.org_id = public.user_org_id()))))) OR public.driver_can_access_expense((expense_id)::text)));
-- [15] publicexpense_receiptsexpense_receipts_select_scoped
CREATE POLICY expense_receipts_select_scoped ON public.expense_receipts AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.expenses e
  WHERE ((e.id = expense_receipts.expense_id) AND (e.org_id = public.user_org_id()))))) OR public.driver_can_access_expense((expense_id)::text)));
-- [15] publicexpense_receiptsexpense_receipts_update_scoped
CREATE POLICY expense_receipts_update_scoped ON public.expense_receipts AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.expenses e
  WHERE ((e.id = expense_receipts.expense_id) AND (e.org_id = public.user_org_id()))))) OR (public.driver_can_access_expense((expense_id)::text) AND (NOT public.expense_is_invoiced(expense_id))))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.expenses e
  WHERE ((e.id = expense_receipts.expense_id) AND (e.org_id = public.user_org_id()))))) OR public.driver_can_access_expense((expense_id)::text)));
-- [15] publicexpensesexpenses_delete_scoped
CREATE POLICY expenses_delete_scoped ON public.expenses AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR (public.driver_owns_job(job_id) AND (NOT public.expense_is_invoiced(id)))))));
-- [15] publicexpensesexpenses_hide_test_data
CREATE POLICY expenses_hide_test_data ON public.expenses AS RESTRICTIVE FOR SELECT TO anon, authenticated USING ((is_test = false));
-- [15] publicexpensesexpenses_insert_scoped
CREATE POLICY expenses_insert_scoped ON public.expenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR public.driver_owns_job(job_id)))));
-- [15] publicexpensesexpenses_select_scoped
CREATE POLICY expenses_select_scoped ON public.expenses AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR public.driver_owns_job(job_id)))));
-- [15] publicexpensesexpenses_update_scoped
CREATE POLICY expenses_update_scoped ON public.expenses AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR (public.driver_owns_job(job_id) AND (NOT public.expense_is_invoiced(id))))))) WITH CHECK ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR public.driver_owns_job(job_id)))));
-- [15] publicinspectionsinspections_delete_org
CREATE POLICY inspections_delete_org ON public.inspections AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicinspectionsinspections_insert_org
CREATE POLICY inspections_insert_org ON public.inspections AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicinspectionsinspections_select_scoped
CREATE POLICY inspections_select_scoped ON public.inspections AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR public.driver_can_read_job_evidence(job_id)))));
-- [15] publicinspectionsinspections_update_org
CREATE POLICY inspections_update_org ON public.inspections AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id()))) WITH CHECK ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicinvoice_expensesinvoice_expenses_delete_admin
CREATE POLICY invoice_expenses_delete_admin ON public.invoice_expenses AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_expenses.invoice_id) AND (i.org_id = public.user_org_id())))))));
-- [15] publicinvoice_expensesinvoice_expenses_insert_admin
CREATE POLICY invoice_expenses_insert_admin ON public.invoice_expenses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_expenses.invoice_id) AND (i.org_id = public.user_org_id())))))));
-- [15] publicinvoice_expensesinvoice_expenses_select
CREATE POLICY invoice_expenses_select ON public.invoice_expenses AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_expenses.invoice_id) AND (i.org_id = public.user_org_id())))))));
-- [15] publicinvoice_expensesinvoice_expenses_update_admin
CREATE POLICY invoice_expenses_update_admin ON public.invoice_expenses AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_expenses.invoice_id) AND (i.org_id = public.user_org_id()))))))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_expenses.invoice_id) AND (i.org_id = public.user_org_id())))))));
-- [15] publicinvoice_itemsinvoice_items_delete_admin
CREATE POLICY invoice_items_delete_admin ON public.invoice_items AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND (i.org_id = public.user_org_id())))))));
-- [15] publicinvoice_itemsinvoice_items_insert_admin
CREATE POLICY invoice_items_insert_admin ON public.invoice_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND (i.org_id = public.user_org_id())))))));
-- [15] publicinvoice_itemsinvoice_items_select
CREATE POLICY invoice_items_select ON public.invoice_items AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND (i.org_id = public.user_org_id())))))));
-- [15] publicinvoice_itemsinvoice_items_update_admin
CREATE POLICY invoice_items_update_admin ON public.invoice_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND (i.org_id = public.user_org_id()))))))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND (i.org_id = public.user_org_id())))))));
-- [15] publicinvoicesinvoices_delete_admin
CREATE POLICY invoices_delete_admin ON public.invoices AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicinvoicesinvoices_hide_test_data
CREATE POLICY invoices_hide_test_data ON public.invoices AS RESTRICTIVE FOR SELECT TO anon, authenticated USING ((is_test = false));
-- [15] publicinvoicesinvoices_insert_admin
CREATE POLICY invoices_insert_admin ON public.invoices AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicinvoicesinvoices_select
CREATE POLICY invoices_select ON public.invoices AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicinvoicesinvoices_update_admin
CREATE POLICY invoices_update_admin ON public.invoices AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin()))) WITH CHECK ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND public.is_admin_or_super_admin())));
-- [15] publicjob_abort_eventsjob_abort_events_select_admin
CREATE POLICY job_abort_events_select_admin ON public.job_abort_events AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicjob_abort_invoice_correctionsabort_invoice_corrections_ad
CREATE POLICY abort_invoice_corrections_admin_read ON public.job_abort_invoice_corrections AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_admin_or_super_admin() AND (org_id = public.user_org_id())));
-- [15] publicjob_abort_requestsjob_abort_requests_select
CREATE POLICY job_abort_requests_select ON public.job_abort_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())) OR ((requested_by = auth.uid()) AND (org_id = public.user_org_id()))));
-- [15] publicjob_abortsjob_aborts_select_admin
CREATE POLICY job_aborts_select_admin ON public.job_aborts AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicjob_activity_logjob_activity_log_insert_org
CREATE POLICY job_activity_log_insert_org ON public.job_activity_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicjob_activity_logjob_activity_log_select_org
CREATE POLICY job_activity_log_select_org ON public.job_activity_log AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicjob_deviation_logjob_deviation_log_insert_org
CREATE POLICY job_deviation_log_insert_org ON public.job_deviation_log AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicjob_deviation_logjob_deviation_log_select_org
CREATE POLICY job_deviation_log_select_org ON public.job_deviation_log AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicjob_pricingjob_pricing_delete_admin
CREATE POLICY job_pricing_delete_admin ON public.job_pricing AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicjob_pricingjob_pricing_insert_admin
CREATE POLICY job_pricing_insert_admin ON public.job_pricing AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicjob_pricingjob_pricing_select_admin
CREATE POLICY job_pricing_select_admin ON public.job_pricing AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicjob_pricingjob_pricing_update_admin
CREATE POLICY job_pricing_update_admin ON public.job_pricing AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicjob_status_overridesSuper admins can read job status over
CREATE POLICY "Super admins can read job status overrides" ON public.job_status_overrides AS PERMISSIVE FOR SELECT TO authenticated USING (public.is_super_admin());
-- [15] publicjobsjobs_delete_admin
CREATE POLICY jobs_delete_admin ON public.jobs AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_admin_or_super_admin() AND (public.is_super_admin() OR (org_id = public.user_org_id()))));
-- [15] publicjobsjobs_hide_test_data
CREATE POLICY jobs_hide_test_data ON public.jobs AS RESTRICTIVE FOR SELECT TO anon, authenticated USING ((is_test = false));
-- [15] publicjobsjobs_insert_admin
CREATE POLICY jobs_insert_admin ON public.jobs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_admin_or_super_admin() AND (public.is_super_admin() OR (org_id = public.user_org_id()))));
-- [15] publicjobsjobs_select_org
CREATE POLICY jobs_select_org ON public.jobs AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR (driver_id = public.current_driver_profile_id())))));
-- [15] publicjobsjobs_update_org
CREATE POLICY jobs_update_org ON public.jobs AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id()))) WITH CHECK ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publiconboarding_documentsonboarding_documents_delete_admin
CREATE POLICY onboarding_documents_delete_admin ON public.onboarding_documents AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publiconboarding_documentsonboarding_documents_insert_scoped
CREATE POLICY onboarding_documents_insert_scoped ON public.onboarding_documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())) OR ((related_type = 'driver'::text) AND (related_id IN ( SELECT driver_profiles.id
   FROM public.driver_profiles
  WHERE (driver_profiles.user_id = auth.uid()))) AND (org_id = public.user_org_id()))));
-- [15] publiconboarding_documentsonboarding_documents_select_scoped
CREATE POLICY onboarding_documents_select_scoped ON public.onboarding_documents AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())) OR ((related_type = 'driver'::text) AND (related_id IN ( SELECT driver_profiles.id
   FROM public.driver_profiles
  WHERE (driver_profiles.user_id = auth.uid()))))));
-- [15] publiconboarding_documentsonboarding_documents_update_scoped
CREATE POLICY onboarding_documents_update_scoped ON public.onboarding_documents AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())) OR ((related_type = 'driver'::text) AND (related_id IN ( SELECT driver_profiles.id
   FROM public.driver_profiles
  WHERE (driver_profiles.user_id = auth.uid())))))) WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())) OR ((related_type = 'driver'::text) AND (related_id IN ( SELECT driver_profiles.id
   FROM public.driver_profiles
  WHERE (driver_profiles.user_id = auth.uid()))))));
-- [15] publicorganisationsSuper admins can manage organisations
CREATE POLICY "Super admins can manage organisations" ON public.organisations AS PERMISSIVE FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
-- [15] publicorganisationsUsers can read their organisation
CREATE POLICY "Users can read their organisation" ON public.organisations AS PERMISSIVE FOR SELECT TO authenticated USING (((id = public.user_org_id()) OR public.is_super_admin()));
-- [15] publicorganisationsorganisations_anon_no_access
CREATE POLICY organisations_anon_no_access ON public.organisations AS PERMISSIVE FOR SELECT TO anon USING (false);
-- [15] publicpermission_audit_logpermission_audit_log_select_scoped
CREATE POLICY permission_audit_log_select_scoped ON public.permission_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (target_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM (public.user_profiles actor
     JOIN public.user_profiles target ON ((target.auth_user_id = permission_audit_log.target_user_id)))
  WHERE ((actor.auth_user_id = auth.uid()) AND (actor.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (actor.org_id = target.org_id))))));
-- [15] publicpermissions_catalogpermissions_catalog_select_authenticat
CREATE POLICY permissions_catalog_select_authenticated ON public.permissions_catalog AS PERMISSIVE FOR SELECT TO authenticated USING (true);
-- [15] publicphotosphotos_delete_org
CREATE POLICY photos_delete_org ON public.photos AS PERMISSIVE FOR DELETE TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicphotosphotos_insert_job_org
CREATE POLICY photos_insert_job_org ON public.photos AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.id = photos.job_id) AND (j.org_id = public.user_org_id()))))));
-- [15] publicphotosphotos_select_org
CREATE POLICY photos_select_org ON public.photos AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR ((org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR public.driver_can_read_job_evidence(job_id)))));
-- [15] publicphotosphotos_update_org
CREATE POLICY photos_update_org ON public.photos AS PERMISSIVE FOR UPDATE TO authenticated USING ((public.is_super_admin() OR (org_id = public.user_org_id()))) WITH CHECK ((public.is_super_admin() OR (org_id = public.user_org_id())));
-- [15] publicpricing_snapshotsAdmins can insert pricing_snapshots
CREATE POLICY "Admins can insert pricing_snapshots" ON public.pricing_snapshots AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicpricing_snapshotspricing_snapshots_select_admin
CREATE POLICY pricing_snapshots_select_admin ON public.pricing_snapshots AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicpush_subscriptionspush_subscriptions_delete_own
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions AS PERMISSIVE FOR DELETE TO PUBLIC USING ((auth.uid() = user_id));
-- [15] publicpush_subscriptionspush_subscriptions_insert_own
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions AS PERMISSIVE FOR INSERT TO PUBLIC WITH CHECK ((auth.uid() = user_id));
-- [15] publicpush_subscriptionspush_subscriptions_select_own
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions AS PERMISSIVE FOR SELECT TO PUBLIC USING ((auth.uid() = user_id));
-- [15] publicpush_subscriptionspush_subscriptions_update_own
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions AS PERMISSIVE FOR UPDATE TO PUBLIC USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
-- [15] publicqr_confirmationsqr_confirmations_insert_scoped
CREATE POLICY qr_confirmations_insert_scoped ON public.qr_confirmations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((confirmed_at IS NULL) AND (customer_name IS NULL) AND (public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.id = qr_confirmations.job_id) AND (j.org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR public.driver_owns_job(j.id))))))));
-- [15] publicqr_confirmationsqr_confirmations_select_scoped
CREATE POLICY qr_confirmations_select_scoped ON public.qr_confirmations AS PERMISSIVE FOR SELECT TO authenticated USING ((public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.id = qr_confirmations.job_id) AND (j.org_id = public.user_org_id()) AND (public.is_admin_or_super_admin() OR public.driver_can_read_job_evidence(j.id)))))));
-- [15] publicrole_permission_templatesrole_permission_templates_select
CREATE POLICY role_permission_templates_select_authenticated ON public.role_permission_templates AS PERMISSIVE FOR SELECT TO authenticated USING (true);
-- [15] publicuser_permission_overridesuser_permission_overrides_select
CREATE POLICY user_permission_overrides_select_scoped ON public.user_permission_overrides AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM (public.user_profiles actor
     JOIN public.user_profiles target ON ((target.auth_user_id = user_permission_overrides.user_id)))
  WHERE ((actor.auth_user_id = auth.uid()) AND (actor.role = ANY (ARRAY['admin'::text, 'super_admin'::text])) AND (actor.org_id = target.org_id))))));
-- [15] publicuser_profilesuser_profiles_insert_admin_super
CREATE POLICY user_profiles_insert_admin_super ON public.user_profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicuser_profilesuser_profiles_select_self_admin_super
CREATE POLICY user_profiles_select_self_admin_super ON public.user_profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = auth_user_id) OR public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicuser_profilesuser_profiles_update_self_admin_super
CREATE POLICY user_profiles_update_self_admin_super ON public.user_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (((auth.uid() = auth_user_id) OR public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id())))) WITH CHECK (((auth.uid() = auth_user_id) OR public.is_super_admin() OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))));
-- [15] publicvehicle_catalogue_imagescatalogue images delete by super 
CREATE POLICY "catalogue images delete by super admin" ON public.vehicle_catalogue_images AS PERMISSIVE FOR DELETE TO authenticated USING (public.is_super_admin());
-- [15] publicvehicle_catalogue_imagescatalogue images insert by super 
CREATE POLICY "catalogue images insert by super admin" ON public.vehicle_catalogue_images AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
-- [15] publicvehicle_catalogue_imagescatalogue images readable by sign
CREATE POLICY "catalogue images readable by signed-in users" ON public.vehicle_catalogue_images AS PERMISSIVE FOR SELECT TO authenticated USING (true);
-- [15] publicvehicle_catalogue_imagescatalogue images update by super 
CREATE POLICY "catalogue images update by super admin" ON public.vehicle_catalogue_images AS PERMISSIVE FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
-- [15] publicvehicle_make_aliasesmake aliases managed by super admin
CREATE POLICY "make aliases managed by super admin" ON public.vehicle_make_aliases AS PERMISSIVE FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
-- [15] publicvehicle_make_aliasesmake aliases readable by signed-in us
CREATE POLICY "make aliases readable by signed-in users" ON public.vehicle_make_aliases AS PERMISSIVE FOR SELECT TO authenticated USING (true);
-- [15] storageobjectsAuthenticated users can read org signatures
DROP POLICY IF EXISTS "Authenticated users can read org signatures" ON storage.objects; CREATE POLICY "Authenticated users can read org signatures" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'vehicle-signatures'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))) OR public.driver_can_use_job_path(name))));
-- [15] storageobjectsdigital_id_photo_admin_delete
DROP POLICY IF EXISTS digital_id_photo_admin_delete ON storage.objects; CREATE POLICY digital_id_photo_admin_delete ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'digital-id-photos'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text)))));
-- [15] storageobjectsdigital_id_photo_admin_insert
DROP POLICY IF EXISTS digital_id_photo_admin_insert ON storage.objects; CREATE POLICY digital_id_photo_admin_insert ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'digital-id-photos'::text) AND (split_part(name, '/'::text, 2) <> ''::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text))) AND (EXISTS ( SELECT 1
   FROM public.driver_digital_credentials c
  WHERE (((c.user_id)::text = split_part(objects.name, '/'::text, 2)) AND (public.is_super_admin() OR ((c.org_id)::text = split_part(objects.name, '/'::text, 1))))))));
-- [15] storageobjectsdigital_id_photo_admin_update
DROP POLICY IF EXISTS digital_id_photo_admin_update ON storage.objects; CREATE POLICY digital_id_photo_admin_update ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'digital-id-photos'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text))))) WITH CHECK (((bucket_id = 'digital-id-photos'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text)))));
-- [15] storageobjectsdigital_id_photo_read
DROP POLICY IF EXISTS digital_id_photo_read ON storage.objects; CREATE POLICY digital_id_photo_read ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'digital-id-photos'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text)) OR ((split_part(name, '/'::text, 2) = (( SELECT auth.uid() AS uid))::text) AND (EXISTS ( SELECT 1
   FROM public.driver_digital_credentials c
  WHERE ((c.user_id = ( SELECT auth.uid() AS uid)) AND (c.status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM public.user_profiles u
  WHERE ((u.auth_user_id = ( SELECT auth.uid() AS uid)) AND (u.account_status = 'active'::text))))))));
-- [15] storageobjectsexpense_receipts_delete_org
DROP POLICY IF EXISTS expense_receipts_delete_org ON storage.objects; CREATE POLICY expense_receipts_delete_org ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'expense-receipts'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.expenses e
  WHERE (((e.id)::text = split_part(objects.name, '/'::text, 1)) AND (e.org_id = public.user_org_id()))))) OR public.driver_can_access_expense(split_part(name, '/'::text, 1)))));
-- [15] storageobjectsexpense_receipts_insert_org
DROP POLICY IF EXISTS expense_receipts_insert_org ON storage.objects; CREATE POLICY expense_receipts_insert_org ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'expense-receipts'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.expenses e
  WHERE (((e.id)::text = split_part(objects.name, '/'::text, 1)) AND (e.org_id = public.user_org_id()))))) OR public.driver_can_access_expense(split_part(name, '/'::text, 1)))));
-- [15] storageobjectsexpense_receipts_select_org
DROP POLICY IF EXISTS expense_receipts_select_org ON storage.objects; CREATE POLICY expense_receipts_select_org ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'expense-receipts'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.expenses e
  WHERE (((e.id)::text = split_part(objects.name, '/'::text, 1)) AND (e.org_id = public.user_org_id()))))) OR public.driver_can_access_expense(split_part(name, '/'::text, 1)))));
-- [15] storageobjectsinvoice_pdfs_delete_org
DROP POLICY IF EXISTS invoice_pdfs_delete_org ON storage.objects; CREATE POLICY invoice_pdfs_delete_org ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'invoice-pdfs'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text)))));
-- [15] storageobjectsinvoice_pdfs_insert_org
DROP POLICY IF EXISTS invoice_pdfs_insert_org ON storage.objects; CREATE POLICY invoice_pdfs_insert_org ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'invoice-pdfs'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text)))));
-- [15] storageobjectsinvoice_pdfs_select_org
DROP POLICY IF EXISTS invoice_pdfs_select_org ON storage.objects; CREATE POLICY invoice_pdfs_select_org ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'invoice-pdfs'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text)))));
-- [15] storageobjectsinvoice_pdfs_select_portal_client
DROP POLICY IF EXISTS invoice_pdfs_select_portal_client ON storage.objects; CREATE POLICY invoice_pdfs_select_portal_client ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'invoice-pdfs'::text) AND public.portal_can_read_invoice_pdf(name)));
-- [15] storageobjectsinvoice_pdfs_update_org
DROP POLICY IF EXISTS invoice_pdfs_update_org ON storage.objects; CREATE POLICY invoice_pdfs_update_org ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'invoice-pdfs'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text))))) WITH CHECK (((bucket_id = 'invoice-pdfs'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (split_part(name, '/'::text, 1) = (public.user_org_id())::text)))));
-- [15] storageobjectsonboarding_docs_delete_org
DROP POLICY IF EXISTS onboarding_docs_delete_org ON storage.objects; CREATE POLICY onboarding_docs_delete_org ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'onboarding-docs'::text) AND (public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.driver_onboarding d
  WHERE (((d.id)::text = split_part(objects.name, '/'::text, 1)) AND (d.org_id = public.user_org_id()) AND public.is_admin_or_super_admin()))))));
-- [15] storageobjectsonboarding_docs_insert_org
DROP POLICY IF EXISTS onboarding_docs_insert_org ON storage.objects; CREATE POLICY onboarding_docs_insert_org ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'onboarding-docs'::text) AND (public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.driver_onboarding d
  WHERE (((d.id)::text = split_part(objects.name, '/'::text, 1)) AND (d.org_id = public.user_org_id()) AND public.is_admin_or_super_admin()))))));
-- [15] storageobjectsonboarding_docs_select_org
DROP POLICY IF EXISTS onboarding_docs_select_org ON storage.objects; CREATE POLICY onboarding_docs_select_org ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'onboarding-docs'::text) AND (public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.driver_onboarding d
  WHERE (((d.id)::text = split_part(objects.name, '/'::text, 1)) AND (d.org_id = public.user_org_id()) AND public.is_admin_or_super_admin()))))));
-- [15] storageobjectsonboarding_docs_update_org
DROP POLICY IF EXISTS onboarding_docs_update_org ON storage.objects; CREATE POLICY onboarding_docs_update_org ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'onboarding-docs'::text) AND (public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.driver_onboarding d
  WHERE (((d.id)::text = split_part(objects.name, '/'::text, 1)) AND (d.org_id = public.user_org_id()) AND public.is_admin_or_super_admin())))))) WITH CHECK (((bucket_id = 'onboarding-docs'::text) AND (public.is_super_admin() OR (EXISTS ( SELECT 1
   FROM public.driver_onboarding d
  WHERE (((d.id)::text = split_part(objects.name, '/'::text, 1)) AND (d.org_id = public.user_org_id()) AND public.is_admin_or_super_admin()))))));
-- [15] storageobjectspod_pdfs_delete_org
DROP POLICY IF EXISTS pod_pdfs_delete_org ON storage.objects; CREATE POLICY pod_pdfs_delete_org ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'pod-pdfs'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.manage'::text))))));
-- [15] storageobjectspod_pdfs_insert_org
DROP POLICY IF EXISTS pod_pdfs_insert_org ON storage.objects; CREATE POLICY pod_pdfs_insert_org ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'pod-pdfs'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'::text))))));
-- [15] storageobjectspod_pdfs_select_org
DROP POLICY IF EXISTS pod_pdfs_select_org ON storage.objects; CREATE POLICY pod_pdfs_select_org ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'pod-pdfs'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'::text))))));
-- [15] storageobjectspod_pdfs_update_org
DROP POLICY IF EXISTS pod_pdfs_update_org ON storage.objects; CREATE POLICY pod_pdfs_update_org ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'pod-pdfs'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'::text)))))) WITH CHECK (((bucket_id = 'pod-pdfs'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'::text))))));
-- [15] storageobjectspod_photos_delete_org
DROP POLICY IF EXISTS pod_photos_delete_org ON storage.objects; CREATE POLICY pod_photos_delete_org ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'pod-photos'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.manage'::text))))));
-- [15] storageobjectspod_photos_insert_org
DROP POLICY IF EXISTS pod_photos_insert_org ON storage.objects; CREATE POLICY pod_photos_insert_org ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'pod-photos'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'::text))))));
-- [15] storageobjectspod_photos_select_org
DROP POLICY IF EXISTS pod_photos_select_org ON storage.objects; CREATE POLICY pod_photos_select_org ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'pod-photos'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'::text))))));
-- [15] storageobjectspod_photos_update_org
DROP POLICY IF EXISTS pod_photos_update_org ON storage.objects; CREATE POLICY pod_photos_update_org ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'pod-photos'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'::text)))))) WITH CHECK (((bucket_id = 'pod-photos'::text) AND (public.is_super_admin() OR ((split_part(name, '/'::text, 1) = (public.user_org_id())::text) AND (public.is_admin_or_super_admin() OR public.user_has_permission(auth.uid(), 'pod.view'::text))))));
-- [15] storageobjectsprofile_photos_delete_own_org_or_super
DROP POLICY IF EXISTS profile_photos_delete_own_org_or_super ON storage.objects; CREATE POLICY profile_photos_delete_own_org_or_super ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'profile-photos'::text) AND (public.is_super_admin() OR (split_part(name, '/'::text, 1) = COALESCE((public.user_org_id())::text, ''::text)))));
-- [15] storageobjectsprofile_photos_insert_own_org_or_super
DROP POLICY IF EXISTS profile_photos_insert_own_org_or_super ON storage.objects; CREATE POLICY profile_photos_insert_own_org_or_super ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'profile-photos'::text) AND (public.is_super_admin() OR (split_part(name, '/'::text, 1) = COALESCE((public.user_org_id())::text, ''::text)))));
-- [15] storageobjectsprofile_photos_select_own_org_or_super
DROP POLICY IF EXISTS profile_photos_select_own_org_or_super ON storage.objects; CREATE POLICY profile_photos_select_own_org_or_super ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'profile-photos'::text) AND (public.is_super_admin() OR (split_part(name, '/'::text, 1) = COALESCE((public.user_org_id())::text, ''::text)))));
-- [15] storageobjectsprofile_photos_update_own_org_or_super
DROP POLICY IF EXISTS profile_photos_update_own_org_or_super ON storage.objects; CREATE POLICY profile_photos_update_own_org_or_super ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'profile-photos'::text) AND (public.is_super_admin() OR (split_part(name, '/'::text, 1) = COALESCE((public.user_org_id())::text, ''::text))))) WITH CHECK (((bucket_id = 'profile-photos'::text) AND (public.is_super_admin() OR (split_part(name, '/'::text, 1) = COALESCE((public.user_org_id())::text, ''::text)))));
-- [15] storageobjectsvehicle-images super admin delete
DROP POLICY IF EXISTS "vehicle-images super admin delete" ON storage.objects; CREATE POLICY "vehicle-images super admin delete" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'vehicle-images'::text) AND public.is_super_admin()));
-- [15] storageobjectsvehicle-images super admin insert
DROP POLICY IF EXISTS "vehicle-images super admin insert" ON storage.objects; CREATE POLICY "vehicle-images super admin insert" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'vehicle-images'::text) AND public.is_super_admin()));
-- [15] storageobjectsvehicle-images super admin read
DROP POLICY IF EXISTS "vehicle-images super admin read" ON storage.objects; CREATE POLICY "vehicle-images super admin read" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'vehicle-images'::text) AND public.is_super_admin()));
-- [15] storageobjectsvehicle-images super admin update
DROP POLICY IF EXISTS "vehicle-images super admin update" ON storage.objects; CREATE POLICY "vehicle-images super admin update" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'vehicle-images'::text) AND public.is_super_admin())) WITH CHECK (((bucket_id = 'vehicle-images'::text) AND public.is_super_admin()));
-- [15] storageobjectsvehicle_photos_delete_org
DROP POLICY IF EXISTS vehicle_photos_delete_org ON storage.objects; CREATE POLICY vehicle_photos_delete_org ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'vehicle-photos'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))) OR public.driver_can_use_job_path(name))));
-- [15] storageobjectsvehicle_photos_insert_org
DROP POLICY IF EXISTS vehicle_photos_insert_org ON storage.objects; CREATE POLICY vehicle_photos_insert_org ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'vehicle-photos'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))) OR public.driver_can_use_job_path(name))));
-- [15] storageobjectsvehicle_photos_select_org
DROP POLICY IF EXISTS vehicle_photos_select_org ON storage.objects; CREATE POLICY vehicle_photos_select_org ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'vehicle-photos'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND ((EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text))))) OR (EXISTS ( SELECT 1
   FROM public.expenses e
  WHERE ((e.org_id = public.user_org_id()) AND (objects.name ~~ (('expense-receipts/'::text || (e.id)::text) || '/%'::text))))))) OR public.driver_can_use_job_path(name) OR ((split_part(name, '/'::text, 1) = 'expense-receipts'::text) AND public.driver_can_access_expense(split_part(name, '/'::text, 2))))));
-- [15] storageobjectsvehicle_photos_update_org
DROP POLICY IF EXISTS vehicle_photos_update_org ON storage.objects; CREATE POLICY vehicle_photos_update_org ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'vehicle-photos'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))) OR public.driver_can_use_job_path(name)))) WITH CHECK (((bucket_id = 'vehicle-photos'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))) OR public.driver_can_use_job_path(name))));
-- [15] storageobjectsvehicle_signatures_delete_org
DROP POLICY IF EXISTS vehicle_signatures_delete_org ON storage.objects; CREATE POLICY vehicle_signatures_delete_org ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'vehicle-signatures'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))) OR public.driver_can_use_job_path(name))));
-- [15] storageobjectsvehicle_signatures_insert_org
DROP POLICY IF EXISTS vehicle_signatures_insert_org ON storage.objects; CREATE POLICY vehicle_signatures_insert_org ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'vehicle-signatures'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))) OR public.driver_can_use_job_path(name))));
-- [15] storageobjectsvehicle_signatures_update_org
DROP POLICY IF EXISTS vehicle_signatures_update_org ON storage.objects; CREATE POLICY vehicle_signatures_update_org ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'vehicle-signatures'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))) OR public.driver_can_use_job_path(name)))) WITH CHECK (((bucket_id = 'vehicle-signatures'::text) AND (public.is_super_admin() OR (public.is_admin_or_super_admin() AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.org_id = public.user_org_id()) AND (objects.name ~~ (('jobs/'::text || (j.id)::text) || '/%'::text)))))) OR public.driver_can_use_job_path(name))));
-- [17] apublicactive_driver_profiles
REVOKE ALL ON TABLE public.active_driver_profiles FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicadmin_audit_log
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicapp_settings
REVOKE ALL ON TABLE public.app_settings FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicattention_acknowledgements
REVOKE ALL ON TABLE public.attention_acknowledgements FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicclient_logs
REVOKE ALL ON TABLE public.client_logs FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicclient_rate_cards
REVOKE ALL ON TABLE public.client_rate_cards FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicclients
REVOKE ALL ON TABLE public.clients FROM PUBLIC, anon, authenticated, service_role;
-- [17] apubliccompliance_checks
REVOKE ALL ON TABLE public.compliance_checks FROM PUBLIC, anon, authenticated, service_role;
-- [17] apubliccustomer_notifications
REVOKE ALL ON TABLE public.customer_notifications FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicdamage_items
REVOKE ALL ON TABLE public.damage_items FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicdriver_digital_credential_events
REVOKE ALL ON TABLE public.driver_digital_credential_events FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicdriver_digital_credential_events_id_seq
REVOKE ALL ON SEQUENCE public.driver_digital_credential_events_id_seq FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicdriver_digital_credentials
REVOKE ALL ON TABLE public.driver_digital_credentials FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicdriver_digital_credentials_serial_number_seq
REVOKE ALL ON SEQUENCE public.driver_digital_credentials_serial_number_seq FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicdriver_onboarding
REVOKE ALL ON TABLE public.driver_onboarding FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicdriver_profiles
REVOKE ALL ON TABLE public.driver_profiles FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicevidence_items
REVOKE ALL ON TABLE public.evidence_items FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicexpense_receipts
REVOKE ALL ON TABLE public.expense_receipts FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicexpenses
REVOKE ALL ON TABLE public.expenses FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicinspections
REVOKE ALL ON TABLE public.inspections FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicinvoice_expenses
REVOKE ALL ON TABLE public.invoice_expenses FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicinvoice_items
REVOKE ALL ON TABLE public.invoice_items FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicinvoice_number_counters
REVOKE ALL ON TABLE public.invoice_number_counters FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicinvoices
REVOKE ALL ON TABLE public.invoices FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjob_abort_events
REVOKE ALL ON TABLE public.job_abort_events FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjob_abort_invoice_corrections
REVOKE ALL ON TABLE public.job_abort_invoice_corrections FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjob_abort_requests
REVOKE ALL ON TABLE public.job_abort_requests FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjob_aborts
REVOKE ALL ON TABLE public.job_aborts FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjob_activity_log
REVOKE ALL ON TABLE public.job_activity_log FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjob_deviation_log
REVOKE ALL ON TABLE public.job_deviation_log FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjob_number_seq
REVOKE ALL ON SEQUENCE public.job_number_seq FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjob_pricing
REVOKE ALL ON TABLE public.job_pricing FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjob_status_overrides
REVOKE ALL ON TABLE public.job_status_overrides FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicjobs
REVOKE ALL ON TABLE public.jobs FROM PUBLIC, anon, authenticated, service_role;
-- [17] apubliconboarding_documents
REVOKE ALL ON TABLE public.onboarding_documents FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicorganisations
REVOKE ALL ON TABLE public.organisations FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicpermission_audit_log
REVOKE ALL ON TABLE public.permission_audit_log FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicpermissions_catalog
REVOKE ALL ON TABLE public.permissions_catalog FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicphotos
REVOKE ALL ON TABLE public.photos FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicpricing_snapshots
REVOKE ALL ON TABLE public.pricing_snapshots FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicpush_config
REVOKE ALL ON TABLE public.push_config FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicpush_subscriptions
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicqr_confirmations
REVOKE ALL ON TABLE public.qr_confirmations FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicrole_permission_templates
REVOKE ALL ON TABLE public.role_permission_templates FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicuser_effective_permissions
REVOKE ALL ON TABLE public.user_effective_permissions FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicuser_permission_overrides
REVOKE ALL ON TABLE public.user_permission_overrides FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicuser_permission_overrides_detailed
REVOKE ALL ON TABLE public.user_permission_overrides_detailed FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicuser_permissions_matrix
REVOKE ALL ON TABLE public.user_permissions_matrix FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicuser_profiles
REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicvehicle_catalogue_images
REVOKE ALL ON TABLE public.vehicle_catalogue_images FROM PUBLIC, anon, authenticated, service_role;
-- [17] apublicvehicle_make_aliases
REVOKE ALL ON TABLE public.vehicle_make_aliases FROM PUBLIC, anon, authenticated, service_role;
-- [17] bpublicactive_driver_profiles16480DELETE
GRANT DELETE ON TABLE public.active_driver_profiles TO anon;
-- [17] bpublicactive_driver_profiles16480INSERT
GRANT INSERT ON TABLE public.active_driver_profiles TO anon;
-- [17] bpublicactive_driver_profiles16480MAINTAIN
GRANT MAINTAIN ON TABLE public.active_driver_profiles TO anon;
-- [17] bpublicactive_driver_profiles16480REFERENCES
GRANT REFERENCES ON TABLE public.active_driver_profiles TO anon;
-- [17] bpublicactive_driver_profiles16480SELECT
GRANT SELECT ON TABLE public.active_driver_profiles TO anon;
-- [17] bpublicactive_driver_profiles16480TRIGGER
GRANT TRIGGER ON TABLE public.active_driver_profiles TO anon;
-- [17] bpublicactive_driver_profiles16480TRUNCATE
GRANT TRUNCATE ON TABLE public.active_driver_profiles TO anon;
-- [17] bpublicactive_driver_profiles16480UPDATE
GRANT UPDATE ON TABLE public.active_driver_profiles TO anon;
-- [17] bpublicactive_driver_profiles16481DELETE
GRANT DELETE ON TABLE public.active_driver_profiles TO authenticated;
-- [17] bpublicactive_driver_profiles16481INSERT
GRANT INSERT ON TABLE public.active_driver_profiles TO authenticated;
-- [17] bpublicactive_driver_profiles16481MAINTAIN
GRANT MAINTAIN ON TABLE public.active_driver_profiles TO authenticated;
-- [17] bpublicactive_driver_profiles16481REFERENCES
GRANT REFERENCES ON TABLE public.active_driver_profiles TO authenticated;
-- [17] bpublicactive_driver_profiles16481SELECT
GRANT SELECT ON TABLE public.active_driver_profiles TO authenticated;
-- [17] bpublicactive_driver_profiles16481TRIGGER
GRANT TRIGGER ON TABLE public.active_driver_profiles TO authenticated;
-- [17] bpublicactive_driver_profiles16481TRUNCATE
GRANT TRUNCATE ON TABLE public.active_driver_profiles TO authenticated;
-- [17] bpublicactive_driver_profiles16481UPDATE
GRANT UPDATE ON TABLE public.active_driver_profiles TO authenticated;
-- [17] bpublicactive_driver_profiles16482DELETE
GRANT DELETE ON TABLE public.active_driver_profiles TO service_role;
-- [17] bpublicactive_driver_profiles16482INSERT
GRANT INSERT ON TABLE public.active_driver_profiles TO service_role;
-- [17] bpublicactive_driver_profiles16482MAINTAIN
GRANT MAINTAIN ON TABLE public.active_driver_profiles TO service_role;
-- [17] bpublicactive_driver_profiles16482REFERENCES
GRANT REFERENCES ON TABLE public.active_driver_profiles TO service_role;
-- [17] bpublicactive_driver_profiles16482SELECT
GRANT SELECT ON TABLE public.active_driver_profiles TO service_role;
-- [17] bpublicactive_driver_profiles16482TRIGGER
GRANT TRIGGER ON TABLE public.active_driver_profiles TO service_role;
-- [17] bpublicactive_driver_profiles16482TRUNCATE
GRANT TRUNCATE ON TABLE public.active_driver_profiles TO service_role;
-- [17] bpublicactive_driver_profiles16482UPDATE
GRANT UPDATE ON TABLE public.active_driver_profiles TO service_role;
-- [17] bpublicadmin_audit_log16480DELETE
GRANT DELETE ON TABLE public.admin_audit_log TO anon;
-- [17] bpublicadmin_audit_log16480INSERT
GRANT INSERT ON TABLE public.admin_audit_log TO anon;
-- [17] bpublicadmin_audit_log16480MAINTAIN
GRANT MAINTAIN ON TABLE public.admin_audit_log TO anon;
-- [17] bpublicadmin_audit_log16480REFERENCES
GRANT REFERENCES ON TABLE public.admin_audit_log TO anon;
-- [17] bpublicadmin_audit_log16480SELECT
GRANT SELECT ON TABLE public.admin_audit_log TO anon;
-- [17] bpublicadmin_audit_log16480TRIGGER
GRANT TRIGGER ON TABLE public.admin_audit_log TO anon;
-- [17] bpublicadmin_audit_log16480TRUNCATE
GRANT TRUNCATE ON TABLE public.admin_audit_log TO anon;
-- [17] bpublicadmin_audit_log16480UPDATE
GRANT UPDATE ON TABLE public.admin_audit_log TO anon;
-- [17] bpublicadmin_audit_log16481MAINTAIN
GRANT MAINTAIN ON TABLE public.admin_audit_log TO authenticated;
-- [17] bpublicadmin_audit_log16481REFERENCES
GRANT REFERENCES ON TABLE public.admin_audit_log TO authenticated;
-- [17] bpublicadmin_audit_log16481SELECT
GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;
-- [17] bpublicadmin_audit_log16481TRIGGER
GRANT TRIGGER ON TABLE public.admin_audit_log TO authenticated;
-- [17] bpublicadmin_audit_log16481TRUNCATE
GRANT TRUNCATE ON TABLE public.admin_audit_log TO authenticated;
-- [17] bpublicadmin_audit_log16482DELETE
GRANT DELETE ON TABLE public.admin_audit_log TO service_role;
-- [17] bpublicadmin_audit_log16482INSERT
GRANT INSERT ON TABLE public.admin_audit_log TO service_role;
-- [17] bpublicadmin_audit_log16482MAINTAIN
GRANT MAINTAIN ON TABLE public.admin_audit_log TO service_role;
-- [17] bpublicadmin_audit_log16482REFERENCES
GRANT REFERENCES ON TABLE public.admin_audit_log TO service_role;
-- [17] bpublicadmin_audit_log16482SELECT
GRANT SELECT ON TABLE public.admin_audit_log TO service_role;
-- [17] bpublicadmin_audit_log16482TRIGGER
GRANT TRIGGER ON TABLE public.admin_audit_log TO service_role;
-- [17] bpublicadmin_audit_log16482TRUNCATE
GRANT TRUNCATE ON TABLE public.admin_audit_log TO service_role;
-- [17] bpublicadmin_audit_log16482UPDATE
GRANT UPDATE ON TABLE public.admin_audit_log TO service_role;
-- [17] bpublicapp_settings16480DELETE
GRANT DELETE ON TABLE public.app_settings TO anon;
-- [17] bpublicapp_settings16480INSERT
GRANT INSERT ON TABLE public.app_settings TO anon;
-- [17] bpublicapp_settings16480MAINTAIN
GRANT MAINTAIN ON TABLE public.app_settings TO anon;
-- [17] bpublicapp_settings16480REFERENCES
GRANT REFERENCES ON TABLE public.app_settings TO anon;
-- [17] bpublicapp_settings16480SELECT
GRANT SELECT ON TABLE public.app_settings TO anon;
-- [17] bpublicapp_settings16480TRIGGER
GRANT TRIGGER ON TABLE public.app_settings TO anon;
-- [17] bpublicapp_settings16480TRUNCATE
GRANT TRUNCATE ON TABLE public.app_settings TO anon;
-- [17] bpublicapp_settings16480UPDATE
GRANT UPDATE ON TABLE public.app_settings TO anon;
-- [17] bpublicapp_settings16481DELETE
GRANT DELETE ON TABLE public.app_settings TO authenticated;
-- [17] bpublicapp_settings16481INSERT
GRANT INSERT ON TABLE public.app_settings TO authenticated;
-- [17] bpublicapp_settings16481MAINTAIN
GRANT MAINTAIN ON TABLE public.app_settings TO authenticated;
-- [17] bpublicapp_settings16481REFERENCES
GRANT REFERENCES ON TABLE public.app_settings TO authenticated;
-- [17] bpublicapp_settings16481SELECT
GRANT SELECT ON TABLE public.app_settings TO authenticated;
-- [17] bpublicapp_settings16481TRIGGER
GRANT TRIGGER ON TABLE public.app_settings TO authenticated;
-- [17] bpublicapp_settings16481TRUNCATE
GRANT TRUNCATE ON TABLE public.app_settings TO authenticated;
-- [17] bpublicapp_settings16481UPDATE
GRANT UPDATE ON TABLE public.app_settings TO authenticated;
-- [17] bpublicapp_settings16482DELETE
GRANT DELETE ON TABLE public.app_settings TO service_role;
-- [17] bpublicapp_settings16482INSERT
GRANT INSERT ON TABLE public.app_settings TO service_role;
-- [17] bpublicapp_settings16482MAINTAIN
GRANT MAINTAIN ON TABLE public.app_settings TO service_role;
-- [17] bpublicapp_settings16482REFERENCES
GRANT REFERENCES ON TABLE public.app_settings TO service_role;
-- [17] bpublicapp_settings16482SELECT
GRANT SELECT ON TABLE public.app_settings TO service_role;
-- [17] bpublicapp_settings16482TRIGGER
GRANT TRIGGER ON TABLE public.app_settings TO service_role;
-- [17] bpublicapp_settings16482TRUNCATE
GRANT TRUNCATE ON TABLE public.app_settings TO service_role;
-- [17] bpublicapp_settings16482UPDATE
GRANT UPDATE ON TABLE public.app_settings TO service_role;
-- [17] bpublicattention_acknowledgements16480DELETE
GRANT DELETE ON TABLE public.attention_acknowledgements TO anon;
-- [17] bpublicattention_acknowledgements16480INSERT
GRANT INSERT ON TABLE public.attention_acknowledgements TO anon;
-- [17] bpublicattention_acknowledgements16480MAINTAIN
GRANT MAINTAIN ON TABLE public.attention_acknowledgements TO anon;
-- [17] bpublicattention_acknowledgements16480REFERENCES
GRANT REFERENCES ON TABLE public.attention_acknowledgements TO anon;
-- [17] bpublicattention_acknowledgements16480SELECT
GRANT SELECT ON TABLE public.attention_acknowledgements TO anon;
-- [17] bpublicattention_acknowledgements16480TRIGGER
GRANT TRIGGER ON TABLE public.attention_acknowledgements TO anon;
-- [17] bpublicattention_acknowledgements16480TRUNCATE
GRANT TRUNCATE ON TABLE public.attention_acknowledgements TO anon;
-- [17] bpublicattention_acknowledgements16480UPDATE
GRANT UPDATE ON TABLE public.attention_acknowledgements TO anon;
-- [17] bpublicattention_acknowledgements16481DELETE
GRANT DELETE ON TABLE public.attention_acknowledgements TO authenticated;
-- [17] bpublicattention_acknowledgements16481INSERT
GRANT INSERT ON TABLE public.attention_acknowledgements TO authenticated;
-- [17] bpublicattention_acknowledgements16481MAINTAIN
GRANT MAINTAIN ON TABLE public.attention_acknowledgements TO authenticated;
-- [17] bpublicattention_acknowledgements16481REFERENCES
GRANT REFERENCES ON TABLE public.attention_acknowledgements TO authenticated;
-- [17] bpublicattention_acknowledgements16481SELECT
GRANT SELECT ON TABLE public.attention_acknowledgements TO authenticated;
-- [17] bpublicattention_acknowledgements16481TRIGGER
GRANT TRIGGER ON TABLE public.attention_acknowledgements TO authenticated;
-- [17] bpublicattention_acknowledgements16481TRUNCATE
GRANT TRUNCATE ON TABLE public.attention_acknowledgements TO authenticated;
-- [17] bpublicattention_acknowledgements16481UPDATE
GRANT UPDATE ON TABLE public.attention_acknowledgements TO authenticated;
-- [17] bpublicattention_acknowledgements16482DELETE
GRANT DELETE ON TABLE public.attention_acknowledgements TO service_role;
-- [17] bpublicattention_acknowledgements16482INSERT
GRANT INSERT ON TABLE public.attention_acknowledgements TO service_role;
-- [17] bpublicattention_acknowledgements16482MAINTAIN
GRANT MAINTAIN ON TABLE public.attention_acknowledgements TO service_role;
-- [17] bpublicattention_acknowledgements16482REFERENCES
GRANT REFERENCES ON TABLE public.attention_acknowledgements TO service_role;
-- [17] bpublicattention_acknowledgements16482SELECT
GRANT SELECT ON TABLE public.attention_acknowledgements TO service_role;
-- [17] bpublicattention_acknowledgements16482TRIGGER
GRANT TRIGGER ON TABLE public.attention_acknowledgements TO service_role;
-- [17] bpublicattention_acknowledgements16482TRUNCATE
GRANT TRUNCATE ON TABLE public.attention_acknowledgements TO service_role;
-- [17] bpublicattention_acknowledgements16482UPDATE
GRANT UPDATE ON TABLE public.attention_acknowledgements TO service_role;
-- [17] bpublicclient_logs16480DELETE
GRANT DELETE ON TABLE public.client_logs TO anon;
-- [17] bpublicclient_logs16480INSERT
GRANT INSERT ON TABLE public.client_logs TO anon;
-- [17] bpublicclient_logs16480MAINTAIN
GRANT MAINTAIN ON TABLE public.client_logs TO anon;
-- [17] bpublicclient_logs16480REFERENCES
GRANT REFERENCES ON TABLE public.client_logs TO anon;
-- [17] bpublicclient_logs16480SELECT
GRANT SELECT ON TABLE public.client_logs TO anon;
-- [17] bpublicclient_logs16480TRIGGER
GRANT TRIGGER ON TABLE public.client_logs TO anon;
-- [17] bpublicclient_logs16480TRUNCATE
GRANT TRUNCATE ON TABLE public.client_logs TO anon;
-- [17] bpublicclient_logs16480UPDATE
GRANT UPDATE ON TABLE public.client_logs TO anon;
-- [17] bpublicclient_logs16481DELETE
GRANT DELETE ON TABLE public.client_logs TO authenticated;
-- [17] bpublicclient_logs16481INSERT
GRANT INSERT ON TABLE public.client_logs TO authenticated;
-- [17] bpublicclient_logs16481MAINTAIN
GRANT MAINTAIN ON TABLE public.client_logs TO authenticated;
-- [17] bpublicclient_logs16481REFERENCES
GRANT REFERENCES ON TABLE public.client_logs TO authenticated;
-- [17] bpublicclient_logs16481SELECT
GRANT SELECT ON TABLE public.client_logs TO authenticated;
-- [17] bpublicclient_logs16481TRIGGER
GRANT TRIGGER ON TABLE public.client_logs TO authenticated;
-- [17] bpublicclient_logs16481TRUNCATE
GRANT TRUNCATE ON TABLE public.client_logs TO authenticated;
-- [17] bpublicclient_logs16481UPDATE
GRANT UPDATE ON TABLE public.client_logs TO authenticated;
-- [17] bpublicclient_logs16482DELETE
GRANT DELETE ON TABLE public.client_logs TO service_role;
-- [17] bpublicclient_logs16482INSERT
GRANT INSERT ON TABLE public.client_logs TO service_role;
-- [17] bpublicclient_logs16482MAINTAIN
GRANT MAINTAIN ON TABLE public.client_logs TO service_role;
-- [17] bpublicclient_logs16482REFERENCES
GRANT REFERENCES ON TABLE public.client_logs TO service_role;
-- [17] bpublicclient_logs16482SELECT
GRANT SELECT ON TABLE public.client_logs TO service_role;
-- [17] bpublicclient_logs16482TRIGGER
GRANT TRIGGER ON TABLE public.client_logs TO service_role;
-- [17] bpublicclient_logs16482TRUNCATE
GRANT TRUNCATE ON TABLE public.client_logs TO service_role;
-- [17] bpublicclient_logs16482UPDATE
GRANT UPDATE ON TABLE public.client_logs TO service_role;
-- [17] bpublicclient_rate_cards16480DELETE
GRANT DELETE ON TABLE public.client_rate_cards TO anon;
-- [17] bpublicclient_rate_cards16480INSERT
GRANT INSERT ON TABLE public.client_rate_cards TO anon;
-- [17] bpublicclient_rate_cards16480MAINTAIN
GRANT MAINTAIN ON TABLE public.client_rate_cards TO anon;
-- [17] bpublicclient_rate_cards16480REFERENCES
GRANT REFERENCES ON TABLE public.client_rate_cards TO anon;
-- [17] bpublicclient_rate_cards16480SELECT
GRANT SELECT ON TABLE public.client_rate_cards TO anon;
-- [17] bpublicclient_rate_cards16480TRIGGER
GRANT TRIGGER ON TABLE public.client_rate_cards TO anon;
-- [17] bpublicclient_rate_cards16480TRUNCATE
GRANT TRUNCATE ON TABLE public.client_rate_cards TO anon;
-- [17] bpublicclient_rate_cards16480UPDATE
GRANT UPDATE ON TABLE public.client_rate_cards TO anon;
-- [17] bpublicclient_rate_cards16481DELETE
GRANT DELETE ON TABLE public.client_rate_cards TO authenticated;
-- [17] bpublicclient_rate_cards16481INSERT
GRANT INSERT ON TABLE public.client_rate_cards TO authenticated;
-- [17] bpublicclient_rate_cards16481MAINTAIN
GRANT MAINTAIN ON TABLE public.client_rate_cards TO authenticated;
-- [17] bpublicclient_rate_cards16481REFERENCES
GRANT REFERENCES ON TABLE public.client_rate_cards TO authenticated;
-- [17] bpublicclient_rate_cards16481SELECT
GRANT SELECT ON TABLE public.client_rate_cards TO authenticated;
-- [17] bpublicclient_rate_cards16481TRIGGER
GRANT TRIGGER ON TABLE public.client_rate_cards TO authenticated;
-- [17] bpublicclient_rate_cards16481TRUNCATE
GRANT TRUNCATE ON TABLE public.client_rate_cards TO authenticated;
-- [17] bpublicclient_rate_cards16481UPDATE
GRANT UPDATE ON TABLE public.client_rate_cards TO authenticated;
-- [17] bpublicclient_rate_cards16482DELETE
GRANT DELETE ON TABLE public.client_rate_cards TO service_role;
-- [17] bpublicclient_rate_cards16482INSERT
GRANT INSERT ON TABLE public.client_rate_cards TO service_role;
-- [17] bpublicclient_rate_cards16482MAINTAIN
GRANT MAINTAIN ON TABLE public.client_rate_cards TO service_role;
-- [17] bpublicclient_rate_cards16482REFERENCES
GRANT REFERENCES ON TABLE public.client_rate_cards TO service_role;
-- [17] bpublicclient_rate_cards16482SELECT
GRANT SELECT ON TABLE public.client_rate_cards TO service_role;
-- [17] bpublicclient_rate_cards16482TRIGGER
GRANT TRIGGER ON TABLE public.client_rate_cards TO service_role;
-- [17] bpublicclient_rate_cards16482TRUNCATE
GRANT TRUNCATE ON TABLE public.client_rate_cards TO service_role;
-- [17] bpublicclient_rate_cards16482UPDATE
GRANT UPDATE ON TABLE public.client_rate_cards TO service_role;
-- [17] bpublicclients16480DELETE
GRANT DELETE ON TABLE public.clients TO anon;
-- [17] bpublicclients16480INSERT
GRANT INSERT ON TABLE public.clients TO anon;
-- [17] bpublicclients16480MAINTAIN
GRANT MAINTAIN ON TABLE public.clients TO anon;
-- [17] bpublicclients16480REFERENCES
GRANT REFERENCES ON TABLE public.clients TO anon;
-- [17] bpublicclients16480SELECT
GRANT SELECT ON TABLE public.clients TO anon;
-- [17] bpublicclients16480TRIGGER
GRANT TRIGGER ON TABLE public.clients TO anon;
-- [17] bpublicclients16480TRUNCATE
GRANT TRUNCATE ON TABLE public.clients TO anon;
-- [17] bpublicclients16480UPDATE
GRANT UPDATE ON TABLE public.clients TO anon;
-- [17] bpublicclients16481DELETE
GRANT DELETE ON TABLE public.clients TO authenticated;
-- [17] bpublicclients16481INSERT
GRANT INSERT ON TABLE public.clients TO authenticated;
-- [17] bpublicclients16481MAINTAIN
GRANT MAINTAIN ON TABLE public.clients TO authenticated;
-- [17] bpublicclients16481REFERENCES
GRANT REFERENCES ON TABLE public.clients TO authenticated;
-- [17] bpublicclients16481SELECT
GRANT SELECT ON TABLE public.clients TO authenticated;
-- [17] bpublicclients16481TRIGGER
GRANT TRIGGER ON TABLE public.clients TO authenticated;
-- [17] bpublicclients16481TRUNCATE
GRANT TRUNCATE ON TABLE public.clients TO authenticated;
-- [17] bpublicclients16481UPDATE
GRANT UPDATE ON TABLE public.clients TO authenticated;
-- [17] bpublicclients16482DELETE
GRANT DELETE ON TABLE public.clients TO service_role;
-- [17] bpublicclients16482INSERT
GRANT INSERT ON TABLE public.clients TO service_role;
-- [17] bpublicclients16482MAINTAIN
GRANT MAINTAIN ON TABLE public.clients TO service_role;
-- [17] bpublicclients16482REFERENCES
GRANT REFERENCES ON TABLE public.clients TO service_role;
-- [17] bpublicclients16482SELECT
GRANT SELECT ON TABLE public.clients TO service_role;
-- [17] bpublicclients16482TRIGGER
GRANT TRIGGER ON TABLE public.clients TO service_role;
-- [17] bpublicclients16482TRUNCATE
GRANT TRUNCATE ON TABLE public.clients TO service_role;
-- [17] bpublicclients16482UPDATE
GRANT UPDATE ON TABLE public.clients TO service_role;
-- [17] bpubliccompliance_checks16480DELETE
GRANT DELETE ON TABLE public.compliance_checks TO anon;
-- [17] bpubliccompliance_checks16480INSERT
GRANT INSERT ON TABLE public.compliance_checks TO anon;
-- [17] bpubliccompliance_checks16480MAINTAIN
GRANT MAINTAIN ON TABLE public.compliance_checks TO anon;
-- [17] bpubliccompliance_checks16480REFERENCES
GRANT REFERENCES ON TABLE public.compliance_checks TO anon;
-- [17] bpubliccompliance_checks16480SELECT
GRANT SELECT ON TABLE public.compliance_checks TO anon;
-- [17] bpubliccompliance_checks16480TRIGGER
GRANT TRIGGER ON TABLE public.compliance_checks TO anon;
-- [17] bpubliccompliance_checks16480TRUNCATE
GRANT TRUNCATE ON TABLE public.compliance_checks TO anon;
-- [17] bpubliccompliance_checks16480UPDATE
GRANT UPDATE ON TABLE public.compliance_checks TO anon;
-- [17] bpubliccompliance_checks16481DELETE
GRANT DELETE ON TABLE public.compliance_checks TO authenticated;
-- [17] bpubliccompliance_checks16481INSERT
GRANT INSERT ON TABLE public.compliance_checks TO authenticated;
-- [17] bpubliccompliance_checks16481MAINTAIN
GRANT MAINTAIN ON TABLE public.compliance_checks TO authenticated;
-- [17] bpubliccompliance_checks16481REFERENCES
GRANT REFERENCES ON TABLE public.compliance_checks TO authenticated;
-- [17] bpubliccompliance_checks16481SELECT
GRANT SELECT ON TABLE public.compliance_checks TO authenticated;
-- [17] bpubliccompliance_checks16481TRIGGER
GRANT TRIGGER ON TABLE public.compliance_checks TO authenticated;
-- [17] bpubliccompliance_checks16481TRUNCATE
GRANT TRUNCATE ON TABLE public.compliance_checks TO authenticated;
-- [17] bpubliccompliance_checks16481UPDATE
GRANT UPDATE ON TABLE public.compliance_checks TO authenticated;
-- [17] bpubliccompliance_checks16482DELETE
GRANT DELETE ON TABLE public.compliance_checks TO service_role;
-- [17] bpubliccompliance_checks16482INSERT
GRANT INSERT ON TABLE public.compliance_checks TO service_role;
-- [17] bpubliccompliance_checks16482MAINTAIN
GRANT MAINTAIN ON TABLE public.compliance_checks TO service_role;
-- [17] bpubliccompliance_checks16482REFERENCES
GRANT REFERENCES ON TABLE public.compliance_checks TO service_role;
-- [17] bpubliccompliance_checks16482SELECT
GRANT SELECT ON TABLE public.compliance_checks TO service_role;
-- [17] bpubliccompliance_checks16482TRIGGER
GRANT TRIGGER ON TABLE public.compliance_checks TO service_role;
-- [17] bpubliccompliance_checks16482TRUNCATE
GRANT TRUNCATE ON TABLE public.compliance_checks TO service_role;
-- [17] bpubliccompliance_checks16482UPDATE
GRANT UPDATE ON TABLE public.compliance_checks TO service_role;
-- [17] bpubliccustomer_notifications16480DELETE
GRANT DELETE ON TABLE public.customer_notifications TO anon;
-- [17] bpubliccustomer_notifications16480INSERT
GRANT INSERT ON TABLE public.customer_notifications TO anon;
-- [17] bpubliccustomer_notifications16480MAINTAIN
GRANT MAINTAIN ON TABLE public.customer_notifications TO anon;
-- [17] bpubliccustomer_notifications16480REFERENCES
GRANT REFERENCES ON TABLE public.customer_notifications TO anon;
-- [17] bpubliccustomer_notifications16480SELECT
GRANT SELECT ON TABLE public.customer_notifications TO anon;
-- [17] bpubliccustomer_notifications16480TRIGGER
GRANT TRIGGER ON TABLE public.customer_notifications TO anon;
-- [17] bpubliccustomer_notifications16480TRUNCATE
GRANT TRUNCATE ON TABLE public.customer_notifications TO anon;
-- [17] bpubliccustomer_notifications16480UPDATE
GRANT UPDATE ON TABLE public.customer_notifications TO anon;
-- [17] bpubliccustomer_notifications16481DELETE
GRANT DELETE ON TABLE public.customer_notifications TO authenticated;
-- [17] bpubliccustomer_notifications16481INSERT
GRANT INSERT ON TABLE public.customer_notifications TO authenticated;
-- [17] bpubliccustomer_notifications16481MAINTAIN
GRANT MAINTAIN ON TABLE public.customer_notifications TO authenticated;
-- [17] bpubliccustomer_notifications16481REFERENCES
GRANT REFERENCES ON TABLE public.customer_notifications TO authenticated;
-- [17] bpubliccustomer_notifications16481SELECT
GRANT SELECT ON TABLE public.customer_notifications TO authenticated;
-- [17] bpubliccustomer_notifications16481TRIGGER
GRANT TRIGGER ON TABLE public.customer_notifications TO authenticated;
-- [17] bpubliccustomer_notifications16481TRUNCATE
GRANT TRUNCATE ON TABLE public.customer_notifications TO authenticated;
-- [17] bpubliccustomer_notifications16481UPDATE
GRANT UPDATE ON TABLE public.customer_notifications TO authenticated;
-- [17] bpubliccustomer_notifications16482DELETE
GRANT DELETE ON TABLE public.customer_notifications TO service_role;
-- [17] bpubliccustomer_notifications16482INSERT
GRANT INSERT ON TABLE public.customer_notifications TO service_role;
-- [17] bpubliccustomer_notifications16482MAINTAIN
GRANT MAINTAIN ON TABLE public.customer_notifications TO service_role;
-- [17] bpubliccustomer_notifications16482REFERENCES
GRANT REFERENCES ON TABLE public.customer_notifications TO service_role;
-- [17] bpubliccustomer_notifications16482SELECT
GRANT SELECT ON TABLE public.customer_notifications TO service_role;
-- [17] bpubliccustomer_notifications16482TRIGGER
GRANT TRIGGER ON TABLE public.customer_notifications TO service_role;
-- [17] bpubliccustomer_notifications16482TRUNCATE
GRANT TRUNCATE ON TABLE public.customer_notifications TO service_role;
-- [17] bpubliccustomer_notifications16482UPDATE
GRANT UPDATE ON TABLE public.customer_notifications TO service_role;
-- [17] bpublicdamage_items16480INSERT
GRANT INSERT ON TABLE public.damage_items TO anon;
-- [17] bpublicdamage_items16480MAINTAIN
GRANT MAINTAIN ON TABLE public.damage_items TO anon;
-- [17] bpublicdamage_items16480REFERENCES
GRANT REFERENCES ON TABLE public.damage_items TO anon;
-- [17] bpublicdamage_items16480SELECT
GRANT SELECT ON TABLE public.damage_items TO anon;
-- [17] bpublicdamage_items16480TRIGGER
GRANT TRIGGER ON TABLE public.damage_items TO anon;
-- [17] bpublicdamage_items16480UPDATE
GRANT UPDATE ON TABLE public.damage_items TO anon;
-- [17] bpublicdamage_items16481INSERT
GRANT INSERT ON TABLE public.damage_items TO authenticated;
-- [17] bpublicdamage_items16481MAINTAIN
GRANT MAINTAIN ON TABLE public.damage_items TO authenticated;
-- [17] bpublicdamage_items16481REFERENCES
GRANT REFERENCES ON TABLE public.damage_items TO authenticated;
-- [17] bpublicdamage_items16481SELECT
GRANT SELECT ON TABLE public.damage_items TO authenticated;
-- [17] bpublicdamage_items16481TRIGGER
GRANT TRIGGER ON TABLE public.damage_items TO authenticated;
-- [17] bpublicdamage_items16481UPDATE
GRANT UPDATE ON TABLE public.damage_items TO authenticated;
-- [17] bpublicdamage_items16482DELETE
GRANT DELETE ON TABLE public.damage_items TO service_role;
-- [17] bpublicdamage_items16482INSERT
GRANT INSERT ON TABLE public.damage_items TO service_role;
-- [17] bpublicdamage_items16482MAINTAIN
GRANT MAINTAIN ON TABLE public.damage_items TO service_role;
-- [17] bpublicdamage_items16482REFERENCES
GRANT REFERENCES ON TABLE public.damage_items TO service_role;
-- [17] bpublicdamage_items16482SELECT
GRANT SELECT ON TABLE public.damage_items TO service_role;
-- [17] bpublicdamage_items16482TRIGGER
GRANT TRIGGER ON TABLE public.damage_items TO service_role;
-- [17] bpublicdamage_items16482TRUNCATE
GRANT TRUNCATE ON TABLE public.damage_items TO service_role;
-- [17] bpublicdamage_items16482UPDATE
GRANT UPDATE ON TABLE public.damage_items TO service_role;
-- [17] bpublicdriver_digital_credential_events16481SELECT
GRANT SELECT ON TABLE public.driver_digital_credential_events TO authenticated;
-- [17] bpublicdriver_digital_credential_events16482DELETE
GRANT DELETE ON TABLE public.driver_digital_credential_events TO service_role;
-- [17] bpublicdriver_digital_credential_events16482INSERT
GRANT INSERT ON TABLE public.driver_digital_credential_events TO service_role;
-- [17] bpublicdriver_digital_credential_events16482MAINTAIN
GRANT MAINTAIN ON TABLE public.driver_digital_credential_events TO service_role;
-- [17] bpublicdriver_digital_credential_events16482REFERENCES
GRANT REFERENCES ON TABLE public.driver_digital_credential_events TO service_role;
-- [17] bpublicdriver_digital_credential_events16482SELECT
GRANT SELECT ON TABLE public.driver_digital_credential_events TO service_role;
-- [17] bpublicdriver_digital_credential_events16482TRIGGER
GRANT TRIGGER ON TABLE public.driver_digital_credential_events TO service_role;
-- [17] bpublicdriver_digital_credential_events16482TRUNCATE
GRANT TRUNCATE ON TABLE public.driver_digital_credential_events TO service_role;
-- [17] bpublicdriver_digital_credential_events16482UPDATE
GRANT UPDATE ON TABLE public.driver_digital_credential_events TO service_role;
-- [17] bpublicdriver_digital_credential_events_id_seq16480SELECT
GRANT SELECT ON SEQUENCE public.driver_digital_credential_events_id_seq TO anon;
-- [17] bpublicdriver_digital_credential_events_id_seq16480UPDATE
GRANT UPDATE ON SEQUENCE public.driver_digital_credential_events_id_seq TO anon;
-- [17] bpublicdriver_digital_credential_events_id_seq16480USAGE
GRANT USAGE ON SEQUENCE public.driver_digital_credential_events_id_seq TO anon;
-- [17] bpublicdriver_digital_credential_events_id_seq16481SELECT
GRANT SELECT ON SEQUENCE public.driver_digital_credential_events_id_seq TO authenticated;
-- [17] bpublicdriver_digital_credential_events_id_seq16481UPDATE
GRANT UPDATE ON SEQUENCE public.driver_digital_credential_events_id_seq TO authenticated;
-- [17] bpublicdriver_digital_credential_events_id_seq16481USAGE
GRANT USAGE ON SEQUENCE public.driver_digital_credential_events_id_seq TO authenticated;
-- [17] bpublicdriver_digital_credential_events_id_seq16482SELECT
GRANT SELECT ON SEQUENCE public.driver_digital_credential_events_id_seq TO service_role;
-- [17] bpublicdriver_digital_credential_events_id_seq16482UPDATE
GRANT UPDATE ON SEQUENCE public.driver_digital_credential_events_id_seq TO service_role;
-- [17] bpublicdriver_digital_credential_events_id_seq16482USAGE
GRANT USAGE ON SEQUENCE public.driver_digital_credential_events_id_seq TO service_role;
-- [17] bpublicdriver_digital_credentials16481SELECT
GRANT SELECT ON TABLE public.driver_digital_credentials TO authenticated;
-- [17] bpublicdriver_digital_credentials16482DELETE
GRANT DELETE ON TABLE public.driver_digital_credentials TO service_role;
-- [17] bpublicdriver_digital_credentials16482INSERT
GRANT INSERT ON TABLE public.driver_digital_credentials TO service_role;
-- [17] bpublicdriver_digital_credentials16482MAINTAIN
GRANT MAINTAIN ON TABLE public.driver_digital_credentials TO service_role;
-- [17] bpublicdriver_digital_credentials16482REFERENCES
GRANT REFERENCES ON TABLE public.driver_digital_credentials TO service_role;
-- [17] bpublicdriver_digital_credentials16482SELECT
GRANT SELECT ON TABLE public.driver_digital_credentials TO service_role;
-- [17] bpublicdriver_digital_credentials16482TRIGGER
GRANT TRIGGER ON TABLE public.driver_digital_credentials TO service_role;
-- [17] bpublicdriver_digital_credentials16482TRUNCATE
GRANT TRUNCATE ON TABLE public.driver_digital_credentials TO service_role;
-- [17] bpublicdriver_digital_credentials16482UPDATE
GRANT UPDATE ON TABLE public.driver_digital_credentials TO service_role;
-- [17] bpublicdriver_digital_credentials_serial_number_seq16480SELECT
GRANT SELECT ON SEQUENCE public.driver_digital_credentials_serial_number_seq TO anon;
-- [17] bpublicdriver_digital_credentials_serial_number_seq16480UPDATE
GRANT UPDATE ON SEQUENCE public.driver_digital_credentials_serial_number_seq TO anon;
-- [17] bpublicdriver_digital_credentials_serial_number_seq16480USAGE
GRANT USAGE ON SEQUENCE public.driver_digital_credentials_serial_number_seq TO anon;
-- [17] bpublicdriver_digital_credentials_serial_number_seq16481SELECT
GRANT SELECT ON SEQUENCE public.driver_digital_credentials_serial_number_seq TO authenticated;
-- [17] bpublicdriver_digital_credentials_serial_number_seq16481UPDATE
GRANT UPDATE ON SEQUENCE public.driver_digital_credentials_serial_number_seq TO authenticated;
-- [17] bpublicdriver_digital_credentials_serial_number_seq16481USAGE
GRANT USAGE ON SEQUENCE public.driver_digital_credentials_serial_number_seq TO authenticated;
-- [17] bpublicdriver_digital_credentials_serial_number_seq16482SELECT
GRANT SELECT ON SEQUENCE public.driver_digital_credentials_serial_number_seq TO service_role;
-- [17] bpublicdriver_digital_credentials_serial_number_seq16482UPDATE
GRANT UPDATE ON SEQUENCE public.driver_digital_credentials_serial_number_seq TO service_role;
-- [17] bpublicdriver_digital_credentials_serial_number_seq16482USAGE
GRANT USAGE ON SEQUENCE public.driver_digital_credentials_serial_number_seq TO service_role;
-- [17] bpublicdriver_onboarding16480DELETE
GRANT DELETE ON TABLE public.driver_onboarding TO anon;
-- [17] bpublicdriver_onboarding16480INSERT
GRANT INSERT ON TABLE public.driver_onboarding TO anon;
-- [17] bpublicdriver_onboarding16480MAINTAIN
GRANT MAINTAIN ON TABLE public.driver_onboarding TO anon;
-- [17] bpublicdriver_onboarding16480REFERENCES
GRANT REFERENCES ON TABLE public.driver_onboarding TO anon;
-- [17] bpublicdriver_onboarding16480SELECT
GRANT SELECT ON TABLE public.driver_onboarding TO anon;
-- [17] bpublicdriver_onboarding16480TRIGGER
GRANT TRIGGER ON TABLE public.driver_onboarding TO anon;
-- [17] bpublicdriver_onboarding16480TRUNCATE
GRANT TRUNCATE ON TABLE public.driver_onboarding TO anon;
-- [17] bpublicdriver_onboarding16480UPDATE
GRANT UPDATE ON TABLE public.driver_onboarding TO anon;
-- [17] bpublicdriver_onboarding16481DELETE
GRANT DELETE ON TABLE public.driver_onboarding TO authenticated;
-- [17] bpublicdriver_onboarding16481INSERT
GRANT INSERT ON TABLE public.driver_onboarding TO authenticated;
-- [17] bpublicdriver_onboarding16481MAINTAIN
GRANT MAINTAIN ON TABLE public.driver_onboarding TO authenticated;
-- [17] bpublicdriver_onboarding16481REFERENCES
GRANT REFERENCES ON TABLE public.driver_onboarding TO authenticated;
-- [17] bpublicdriver_onboarding16481SELECT
GRANT SELECT ON TABLE public.driver_onboarding TO authenticated;
-- [17] bpublicdriver_onboarding16481TRIGGER
GRANT TRIGGER ON TABLE public.driver_onboarding TO authenticated;
-- [17] bpublicdriver_onboarding16481TRUNCATE
GRANT TRUNCATE ON TABLE public.driver_onboarding TO authenticated;
-- [17] bpublicdriver_onboarding16481UPDATE
GRANT UPDATE ON TABLE public.driver_onboarding TO authenticated;
-- [17] bpublicdriver_onboarding16482DELETE
GRANT DELETE ON TABLE public.driver_onboarding TO service_role;
-- [17] bpublicdriver_onboarding16482INSERT
GRANT INSERT ON TABLE public.driver_onboarding TO service_role;
-- [17] bpublicdriver_onboarding16482MAINTAIN
GRANT MAINTAIN ON TABLE public.driver_onboarding TO service_role;
-- [17] bpublicdriver_onboarding16482REFERENCES
GRANT REFERENCES ON TABLE public.driver_onboarding TO service_role;
-- [17] bpublicdriver_onboarding16482SELECT
GRANT SELECT ON TABLE public.driver_onboarding TO service_role;
-- [17] bpublicdriver_onboarding16482TRIGGER
GRANT TRIGGER ON TABLE public.driver_onboarding TO service_role;
-- [17] bpublicdriver_onboarding16482TRUNCATE
GRANT TRUNCATE ON TABLE public.driver_onboarding TO service_role;
-- [17] bpublicdriver_onboarding16482UPDATE
GRANT UPDATE ON TABLE public.driver_onboarding TO service_role;
-- [17] bpublicdriver_profiles16480MAINTAIN
GRANT MAINTAIN ON TABLE public.driver_profiles TO anon;
-- [17] bpublicdriver_profiles16480REFERENCES
GRANT REFERENCES ON TABLE public.driver_profiles TO anon;
-- [17] bpublicdriver_profiles16480SELECT
GRANT SELECT ON TABLE public.driver_profiles TO anon;
-- [17] bpublicdriver_profiles16480TRIGGER
GRANT TRIGGER ON TABLE public.driver_profiles TO anon;
-- [17] bpublicdriver_profiles16480TRUNCATE
GRANT TRUNCATE ON TABLE public.driver_profiles TO anon;
-- [17] bpublicdriver_profiles16481INSERT
GRANT INSERT ON TABLE public.driver_profiles TO authenticated;
-- [17] bpublicdriver_profiles16481MAINTAIN
GRANT MAINTAIN ON TABLE public.driver_profiles TO authenticated;
-- [17] bpublicdriver_profiles16481REFERENCES
GRANT REFERENCES ON TABLE public.driver_profiles TO authenticated;
-- [17] bpublicdriver_profiles16481SELECT
GRANT SELECT ON TABLE public.driver_profiles TO authenticated;
-- [17] bpublicdriver_profiles16481TRIGGER
GRANT TRIGGER ON TABLE public.driver_profiles TO authenticated;
-- [17] bpublicdriver_profiles16481TRUNCATE
GRANT TRUNCATE ON TABLE public.driver_profiles TO authenticated;
-- [17] bpublicdriver_profiles16481UPDATE
GRANT UPDATE ON TABLE public.driver_profiles TO authenticated;
-- [17] bpublicdriver_profiles16482DELETE
GRANT DELETE ON TABLE public.driver_profiles TO service_role;
-- [17] bpublicdriver_profiles16482INSERT
GRANT INSERT ON TABLE public.driver_profiles TO service_role;
-- [17] bpublicdriver_profiles16482MAINTAIN
GRANT MAINTAIN ON TABLE public.driver_profiles TO service_role;
-- [17] bpublicdriver_profiles16482REFERENCES
GRANT REFERENCES ON TABLE public.driver_profiles TO service_role;
-- [17] bpublicdriver_profiles16482SELECT
GRANT SELECT ON TABLE public.driver_profiles TO service_role;
-- [17] bpublicdriver_profiles16482TRIGGER
GRANT TRIGGER ON TABLE public.driver_profiles TO service_role;
-- [17] bpublicdriver_profiles16482TRUNCATE
GRANT TRUNCATE ON TABLE public.driver_profiles TO service_role;
-- [17] bpublicdriver_profiles16482UPDATE
GRANT UPDATE ON TABLE public.driver_profiles TO service_role;
-- [17] bpublicevidence_items16480INSERT
GRANT INSERT ON TABLE public.evidence_items TO anon;
-- [17] bpublicevidence_items16480MAINTAIN
GRANT MAINTAIN ON TABLE public.evidence_items TO anon;
-- [17] bpublicevidence_items16480REFERENCES
GRANT REFERENCES ON TABLE public.evidence_items TO anon;
-- [17] bpublicevidence_items16480SELECT
GRANT SELECT ON TABLE public.evidence_items TO anon;
-- [17] bpublicevidence_items16480TRIGGER
GRANT TRIGGER ON TABLE public.evidence_items TO anon;
-- [17] bpublicevidence_items16481INSERT
GRANT INSERT ON TABLE public.evidence_items TO authenticated;
-- [17] bpublicevidence_items16481MAINTAIN
GRANT MAINTAIN ON TABLE public.evidence_items TO authenticated;
-- [17] bpublicevidence_items16481REFERENCES
GRANT REFERENCES ON TABLE public.evidence_items TO authenticated;
-- [17] bpublicevidence_items16481SELECT
GRANT SELECT ON TABLE public.evidence_items TO authenticated;
-- [17] bpublicevidence_items16481TRIGGER
GRANT TRIGGER ON TABLE public.evidence_items TO authenticated;
-- [17] bpublicevidence_items16482DELETE
GRANT DELETE ON TABLE public.evidence_items TO service_role;
-- [17] bpublicevidence_items16482INSERT
GRANT INSERT ON TABLE public.evidence_items TO service_role;
-- [17] bpublicevidence_items16482MAINTAIN
GRANT MAINTAIN ON TABLE public.evidence_items TO service_role;
-- [17] bpublicevidence_items16482REFERENCES
GRANT REFERENCES ON TABLE public.evidence_items TO service_role;
-- [17] bpublicevidence_items16482SELECT
GRANT SELECT ON TABLE public.evidence_items TO service_role;
-- [17] bpublicevidence_items16482TRIGGER
GRANT TRIGGER ON TABLE public.evidence_items TO service_role;
-- [17] bpublicevidence_items16482TRUNCATE
GRANT TRUNCATE ON TABLE public.evidence_items TO service_role;
-- [17] bpublicevidence_items16482UPDATE
GRANT UPDATE ON TABLE public.evidence_items TO service_role;
-- [17] bpublicexpense_receipts16480DELETE
GRANT DELETE ON TABLE public.expense_receipts TO anon;
-- [17] bpublicexpense_receipts16480INSERT
GRANT INSERT ON TABLE public.expense_receipts TO anon;
-- [17] bpublicexpense_receipts16480MAINTAIN
GRANT MAINTAIN ON TABLE public.expense_receipts TO anon;
-- [17] bpublicexpense_receipts16480REFERENCES
GRANT REFERENCES ON TABLE public.expense_receipts TO anon;
-- [17] bpublicexpense_receipts16480SELECT
GRANT SELECT ON TABLE public.expense_receipts TO anon;
-- [17] bpublicexpense_receipts16480TRIGGER
GRANT TRIGGER ON TABLE public.expense_receipts TO anon;
-- [17] bpublicexpense_receipts16480TRUNCATE
GRANT TRUNCATE ON TABLE public.expense_receipts TO anon;
-- [17] bpublicexpense_receipts16480UPDATE
GRANT UPDATE ON TABLE public.expense_receipts TO anon;
-- [17] bpublicexpense_receipts16481DELETE
GRANT DELETE ON TABLE public.expense_receipts TO authenticated;
-- [17] bpublicexpense_receipts16481INSERT
GRANT INSERT ON TABLE public.expense_receipts TO authenticated;
-- [17] bpublicexpense_receipts16481MAINTAIN
GRANT MAINTAIN ON TABLE public.expense_receipts TO authenticated;
-- [17] bpublicexpense_receipts16481REFERENCES
GRANT REFERENCES ON TABLE public.expense_receipts TO authenticated;
-- [17] bpublicexpense_receipts16481SELECT
GRANT SELECT ON TABLE public.expense_receipts TO authenticated;
-- [17] bpublicexpense_receipts16481TRIGGER
GRANT TRIGGER ON TABLE public.expense_receipts TO authenticated;
-- [17] bpublicexpense_receipts16481TRUNCATE
GRANT TRUNCATE ON TABLE public.expense_receipts TO authenticated;
-- [17] bpublicexpense_receipts16481UPDATE
GRANT UPDATE ON TABLE public.expense_receipts TO authenticated;
-- [17] bpublicexpense_receipts16482DELETE
GRANT DELETE ON TABLE public.expense_receipts TO service_role;
-- [17] bpublicexpense_receipts16482INSERT
GRANT INSERT ON TABLE public.expense_receipts TO service_role;
-- [17] bpublicexpense_receipts16482MAINTAIN
GRANT MAINTAIN ON TABLE public.expense_receipts TO service_role;
-- [17] bpublicexpense_receipts16482REFERENCES
GRANT REFERENCES ON TABLE public.expense_receipts TO service_role;
-- [17] bpublicexpense_receipts16482SELECT
GRANT SELECT ON TABLE public.expense_receipts TO service_role;
-- [17] bpublicexpense_receipts16482TRIGGER
GRANT TRIGGER ON TABLE public.expense_receipts TO service_role;
-- [17] bpublicexpense_receipts16482TRUNCATE
GRANT TRUNCATE ON TABLE public.expense_receipts TO service_role;
-- [17] bpublicexpense_receipts16482UPDATE
GRANT UPDATE ON TABLE public.expense_receipts TO service_role;
-- [17] bpublicexpenses16480DELETE
GRANT DELETE ON TABLE public.expenses TO anon;
-- [17] bpublicexpenses16480INSERT
GRANT INSERT ON TABLE public.expenses TO anon;
-- [17] bpublicexpenses16480MAINTAIN
GRANT MAINTAIN ON TABLE public.expenses TO anon;
-- [17] bpublicexpenses16480REFERENCES
GRANT REFERENCES ON TABLE public.expenses TO anon;
-- [17] bpublicexpenses16480SELECT
GRANT SELECT ON TABLE public.expenses TO anon;
-- [17] bpublicexpenses16480TRIGGER
GRANT TRIGGER ON TABLE public.expenses TO anon;
-- [17] bpublicexpenses16480TRUNCATE
GRANT TRUNCATE ON TABLE public.expenses TO anon;
-- [17] bpublicexpenses16480UPDATE
GRANT UPDATE ON TABLE public.expenses TO anon;
-- [17] bpublicexpenses16481DELETE
GRANT DELETE ON TABLE public.expenses TO authenticated;
-- [17] bpublicexpenses16481INSERT
GRANT INSERT ON TABLE public.expenses TO authenticated;
-- [17] bpublicexpenses16481MAINTAIN
GRANT MAINTAIN ON TABLE public.expenses TO authenticated;
-- [17] bpublicexpenses16481REFERENCES
GRANT REFERENCES ON TABLE public.expenses TO authenticated;
-- [17] bpublicexpenses16481SELECT
GRANT SELECT ON TABLE public.expenses TO authenticated;
-- [17] bpublicexpenses16481TRIGGER
GRANT TRIGGER ON TABLE public.expenses TO authenticated;
-- [17] bpublicexpenses16481TRUNCATE
GRANT TRUNCATE ON TABLE public.expenses TO authenticated;
-- [17] bpublicexpenses16481UPDATE
GRANT UPDATE ON TABLE public.expenses TO authenticated;
-- [17] bpublicexpenses16482DELETE
GRANT DELETE ON TABLE public.expenses TO service_role;
-- [17] bpublicexpenses16482INSERT
GRANT INSERT ON TABLE public.expenses TO service_role;
-- [17] bpublicexpenses16482MAINTAIN
GRANT MAINTAIN ON TABLE public.expenses TO service_role;
-- [17] bpublicexpenses16482REFERENCES
GRANT REFERENCES ON TABLE public.expenses TO service_role;
-- [17] bpublicexpenses16482SELECT
GRANT SELECT ON TABLE public.expenses TO service_role;
-- [17] bpublicexpenses16482TRIGGER
GRANT TRIGGER ON TABLE public.expenses TO service_role;
-- [17] bpublicexpenses16482TRUNCATE
GRANT TRUNCATE ON TABLE public.expenses TO service_role;
-- [17] bpublicexpenses16482UPDATE
GRANT UPDATE ON TABLE public.expenses TO service_role;
-- [17] bpublicinspections16480INSERT
GRANT INSERT ON TABLE public.inspections TO anon;
-- [17] bpublicinspections16480MAINTAIN
GRANT MAINTAIN ON TABLE public.inspections TO anon;
-- [17] bpublicinspections16480REFERENCES
GRANT REFERENCES ON TABLE public.inspections TO anon;
-- [17] bpublicinspections16480SELECT
GRANT SELECT ON TABLE public.inspections TO anon;
-- [17] bpublicinspections16480TRIGGER
GRANT TRIGGER ON TABLE public.inspections TO anon;
-- [17] bpublicinspections16480UPDATE
GRANT UPDATE ON TABLE public.inspections TO anon;
-- [17] bpublicinspections16481INSERT
GRANT INSERT ON TABLE public.inspections TO authenticated;
-- [17] bpublicinspections16481MAINTAIN
GRANT MAINTAIN ON TABLE public.inspections TO authenticated;
-- [17] bpublicinspections16481REFERENCES
GRANT REFERENCES ON TABLE public.inspections TO authenticated;
-- [17] bpublicinspections16481SELECT
GRANT SELECT ON TABLE public.inspections TO authenticated;
-- [17] bpublicinspections16481TRIGGER
GRANT TRIGGER ON TABLE public.inspections TO authenticated;
-- [17] bpublicinspections16481UPDATE
GRANT UPDATE ON TABLE public.inspections TO authenticated;
-- [17] bpublicinspections16482DELETE
GRANT DELETE ON TABLE public.inspections TO service_role;
-- [17] bpublicinspections16482INSERT
GRANT INSERT ON TABLE public.inspections TO service_role;
-- [17] bpublicinspections16482MAINTAIN
GRANT MAINTAIN ON TABLE public.inspections TO service_role;
-- [17] bpublicinspections16482REFERENCES
GRANT REFERENCES ON TABLE public.inspections TO service_role;
-- [17] bpublicinspections16482SELECT
GRANT SELECT ON TABLE public.inspections TO service_role;
-- [17] bpublicinspections16482TRIGGER
GRANT TRIGGER ON TABLE public.inspections TO service_role;
-- [17] bpublicinspections16482TRUNCATE
GRANT TRUNCATE ON TABLE public.inspections TO service_role;
-- [17] bpublicinspections16482UPDATE
GRANT UPDATE ON TABLE public.inspections TO service_role;
-- [17] bpublicinvoice_expenses16481DELETE
GRANT DELETE ON TABLE public.invoice_expenses TO authenticated;
-- [17] bpublicinvoice_expenses16481INSERT
GRANT INSERT ON TABLE public.invoice_expenses TO authenticated;
-- [17] bpublicinvoice_expenses16481MAINTAIN
GRANT MAINTAIN ON TABLE public.invoice_expenses TO authenticated;
-- [17] bpublicinvoice_expenses16481REFERENCES
GRANT REFERENCES ON TABLE public.invoice_expenses TO authenticated;
-- [17] bpublicinvoice_expenses16481SELECT
GRANT SELECT ON TABLE public.invoice_expenses TO authenticated;
-- [17] bpublicinvoice_expenses16481TRIGGER
GRANT TRIGGER ON TABLE public.invoice_expenses TO authenticated;
-- [17] bpublicinvoice_expenses16481TRUNCATE
GRANT TRUNCATE ON TABLE public.invoice_expenses TO authenticated;
-- [17] bpublicinvoice_expenses16481UPDATE
GRANT UPDATE ON TABLE public.invoice_expenses TO authenticated;
-- [17] bpublicinvoice_expenses16482DELETE
GRANT DELETE ON TABLE public.invoice_expenses TO service_role;
-- [17] bpublicinvoice_expenses16482INSERT
GRANT INSERT ON TABLE public.invoice_expenses TO service_role;
-- [17] bpublicinvoice_expenses16482MAINTAIN
GRANT MAINTAIN ON TABLE public.invoice_expenses TO service_role;
-- [17] bpublicinvoice_expenses16482REFERENCES
GRANT REFERENCES ON TABLE public.invoice_expenses TO service_role;
-- [17] bpublicinvoice_expenses16482SELECT
GRANT SELECT ON TABLE public.invoice_expenses TO service_role;
-- [17] bpublicinvoice_expenses16482TRIGGER
GRANT TRIGGER ON TABLE public.invoice_expenses TO service_role;
-- [17] bpublicinvoice_expenses16482TRUNCATE
GRANT TRUNCATE ON TABLE public.invoice_expenses TO service_role;
-- [17] bpublicinvoice_expenses16482UPDATE
GRANT UPDATE ON TABLE public.invoice_expenses TO service_role;
-- [17] bpublicinvoice_items16480DELETE
GRANT DELETE ON TABLE public.invoice_items TO anon;
-- [17] bpublicinvoice_items16480INSERT
GRANT INSERT ON TABLE public.invoice_items TO anon;
-- [17] bpublicinvoice_items16480MAINTAIN
GRANT MAINTAIN ON TABLE public.invoice_items TO anon;
-- [17] bpublicinvoice_items16480REFERENCES
GRANT REFERENCES ON TABLE public.invoice_items TO anon;
-- [17] bpublicinvoice_items16480SELECT
GRANT SELECT ON TABLE public.invoice_items TO anon;
-- [17] bpublicinvoice_items16480TRIGGER
GRANT TRIGGER ON TABLE public.invoice_items TO anon;
-- [17] bpublicinvoice_items16480TRUNCATE
GRANT TRUNCATE ON TABLE public.invoice_items TO anon;
-- [17] bpublicinvoice_items16480UPDATE
GRANT UPDATE ON TABLE public.invoice_items TO anon;
-- [17] bpublicinvoice_items16481DELETE
GRANT DELETE ON TABLE public.invoice_items TO authenticated;
-- [17] bpublicinvoice_items16481INSERT
GRANT INSERT ON TABLE public.invoice_items TO authenticated;
-- [17] bpublicinvoice_items16481MAINTAIN
GRANT MAINTAIN ON TABLE public.invoice_items TO authenticated;
-- [17] bpublicinvoice_items16481REFERENCES
GRANT REFERENCES ON TABLE public.invoice_items TO authenticated;
-- [17] bpublicinvoice_items16481SELECT
GRANT SELECT ON TABLE public.invoice_items TO authenticated;
-- [17] bpublicinvoice_items16481TRIGGER
GRANT TRIGGER ON TABLE public.invoice_items TO authenticated;
-- [17] bpublicinvoice_items16481TRUNCATE
GRANT TRUNCATE ON TABLE public.invoice_items TO authenticated;
-- [17] bpublicinvoice_items16481UPDATE
GRANT UPDATE ON TABLE public.invoice_items TO authenticated;
-- [17] bpublicinvoice_items16482DELETE
GRANT DELETE ON TABLE public.invoice_items TO service_role;
-- [17] bpublicinvoice_items16482INSERT
GRANT INSERT ON TABLE public.invoice_items TO service_role;
-- [17] bpublicinvoice_items16482MAINTAIN
GRANT MAINTAIN ON TABLE public.invoice_items TO service_role;
-- [17] bpublicinvoice_items16482REFERENCES
GRANT REFERENCES ON TABLE public.invoice_items TO service_role;
-- [17] bpublicinvoice_items16482SELECT
GRANT SELECT ON TABLE public.invoice_items TO service_role;
-- [17] bpublicinvoice_items16482TRIGGER
GRANT TRIGGER ON TABLE public.invoice_items TO service_role;
-- [17] bpublicinvoice_items16482TRUNCATE
GRANT TRUNCATE ON TABLE public.invoice_items TO service_role;
-- [17] bpublicinvoice_items16482UPDATE
GRANT UPDATE ON TABLE public.invoice_items TO service_role;
-- [17] bpublicinvoice_number_counters16480DELETE
GRANT DELETE ON TABLE public.invoice_number_counters TO anon;
-- [17] bpublicinvoice_number_counters16480INSERT
GRANT INSERT ON TABLE public.invoice_number_counters TO anon;
-- [17] bpublicinvoice_number_counters16480MAINTAIN
GRANT MAINTAIN ON TABLE public.invoice_number_counters TO anon;
-- [17] bpublicinvoice_number_counters16480REFERENCES
GRANT REFERENCES ON TABLE public.invoice_number_counters TO anon;
-- [17] bpublicinvoice_number_counters16480SELECT
GRANT SELECT ON TABLE public.invoice_number_counters TO anon;
-- [17] bpublicinvoice_number_counters16480TRIGGER
GRANT TRIGGER ON TABLE public.invoice_number_counters TO anon;
-- [17] bpublicinvoice_number_counters16480TRUNCATE
GRANT TRUNCATE ON TABLE public.invoice_number_counters TO anon;
-- [17] bpublicinvoice_number_counters16480UPDATE
GRANT UPDATE ON TABLE public.invoice_number_counters TO anon;
-- [17] bpublicinvoice_number_counters16481DELETE
GRANT DELETE ON TABLE public.invoice_number_counters TO authenticated;
-- [17] bpublicinvoice_number_counters16481INSERT
GRANT INSERT ON TABLE public.invoice_number_counters TO authenticated;
-- [17] bpublicinvoice_number_counters16481MAINTAIN
GRANT MAINTAIN ON TABLE public.invoice_number_counters TO authenticated;
-- [17] bpublicinvoice_number_counters16481REFERENCES
GRANT REFERENCES ON TABLE public.invoice_number_counters TO authenticated;
-- [17] bpublicinvoice_number_counters16481SELECT
GRANT SELECT ON TABLE public.invoice_number_counters TO authenticated;
-- [17] bpublicinvoice_number_counters16481TRIGGER
GRANT TRIGGER ON TABLE public.invoice_number_counters TO authenticated;
-- [17] bpublicinvoice_number_counters16481TRUNCATE
GRANT TRUNCATE ON TABLE public.invoice_number_counters TO authenticated;
-- [17] bpublicinvoice_number_counters16481UPDATE
GRANT UPDATE ON TABLE public.invoice_number_counters TO authenticated;
-- [17] bpublicinvoice_number_counters16482DELETE
GRANT DELETE ON TABLE public.invoice_number_counters TO service_role;
-- [17] bpublicinvoice_number_counters16482INSERT
GRANT INSERT ON TABLE public.invoice_number_counters TO service_role;
-- [17] bpublicinvoice_number_counters16482MAINTAIN
GRANT MAINTAIN ON TABLE public.invoice_number_counters TO service_role;
-- [17] bpublicinvoice_number_counters16482REFERENCES
GRANT REFERENCES ON TABLE public.invoice_number_counters TO service_role;
-- [17] bpublicinvoice_number_counters16482SELECT
GRANT SELECT ON TABLE public.invoice_number_counters TO service_role;
-- [17] bpublicinvoice_number_counters16482TRIGGER
GRANT TRIGGER ON TABLE public.invoice_number_counters TO service_role;
-- [17] bpublicinvoice_number_counters16482TRUNCATE
GRANT TRUNCATE ON TABLE public.invoice_number_counters TO service_role;
-- [17] bpublicinvoice_number_counters16482UPDATE
GRANT UPDATE ON TABLE public.invoice_number_counters TO service_role;
-- [17] bpublicinvoices16480DELETE
GRANT DELETE ON TABLE public.invoices TO anon;
-- [17] bpublicinvoices16480INSERT
GRANT INSERT ON TABLE public.invoices TO anon;
-- [17] bpublicinvoices16480MAINTAIN
GRANT MAINTAIN ON TABLE public.invoices TO anon;
-- [17] bpublicinvoices16480REFERENCES
GRANT REFERENCES ON TABLE public.invoices TO anon;
-- [17] bpublicinvoices16480SELECT
GRANT SELECT ON TABLE public.invoices TO anon;
-- [17] bpublicinvoices16480TRIGGER
GRANT TRIGGER ON TABLE public.invoices TO anon;
-- [17] bpublicinvoices16480TRUNCATE
GRANT TRUNCATE ON TABLE public.invoices TO anon;
-- [17] bpublicinvoices16480UPDATE
GRANT UPDATE ON TABLE public.invoices TO anon;
-- [17] bpublicinvoices16481DELETE
GRANT DELETE ON TABLE public.invoices TO authenticated;
-- [17] bpublicinvoices16481INSERT
GRANT INSERT ON TABLE public.invoices TO authenticated;
-- [17] bpublicinvoices16481MAINTAIN
GRANT MAINTAIN ON TABLE public.invoices TO authenticated;
-- [17] bpublicinvoices16481REFERENCES
GRANT REFERENCES ON TABLE public.invoices TO authenticated;
-- [17] bpublicinvoices16481SELECT
GRANT SELECT ON TABLE public.invoices TO authenticated;
-- [17] bpublicinvoices16481TRIGGER
GRANT TRIGGER ON TABLE public.invoices TO authenticated;
-- [17] bpublicinvoices16481TRUNCATE
GRANT TRUNCATE ON TABLE public.invoices TO authenticated;
-- [17] bpublicinvoices16481UPDATE
GRANT UPDATE ON TABLE public.invoices TO authenticated;
-- [17] bpublicinvoices16482DELETE
GRANT DELETE ON TABLE public.invoices TO service_role;
-- [17] bpublicinvoices16482INSERT
GRANT INSERT ON TABLE public.invoices TO service_role;
-- [17] bpublicinvoices16482MAINTAIN
GRANT MAINTAIN ON TABLE public.invoices TO service_role;
-- [17] bpublicinvoices16482REFERENCES
GRANT REFERENCES ON TABLE public.invoices TO service_role;
-- [17] bpublicinvoices16482SELECT
GRANT SELECT ON TABLE public.invoices TO service_role;
-- [17] bpublicinvoices16482TRIGGER
GRANT TRIGGER ON TABLE public.invoices TO service_role;
-- [17] bpublicinvoices16482TRUNCATE
GRANT TRUNCATE ON TABLE public.invoices TO service_role;
-- [17] bpublicinvoices16482UPDATE
GRANT UPDATE ON TABLE public.invoices TO service_role;
-- [17] bpublicjob_abort_events16481SELECT
GRANT SELECT ON TABLE public.job_abort_events TO authenticated;
-- [17] bpublicjob_abort_events16482DELETE
GRANT DELETE ON TABLE public.job_abort_events TO service_role;
-- [17] bpublicjob_abort_events16482INSERT
GRANT INSERT ON TABLE public.job_abort_events TO service_role;
-- [17] bpublicjob_abort_events16482MAINTAIN
GRANT MAINTAIN ON TABLE public.job_abort_events TO service_role;
-- [17] bpublicjob_abort_events16482REFERENCES
GRANT REFERENCES ON TABLE public.job_abort_events TO service_role;
-- [17] bpublicjob_abort_events16482SELECT
GRANT SELECT ON TABLE public.job_abort_events TO service_role;
-- [17] bpublicjob_abort_events16482TRIGGER
GRANT TRIGGER ON TABLE public.job_abort_events TO service_role;
-- [17] bpublicjob_abort_events16482TRUNCATE
GRANT TRUNCATE ON TABLE public.job_abort_events TO service_role;
-- [17] bpublicjob_abort_events16482UPDATE
GRANT UPDATE ON TABLE public.job_abort_events TO service_role;
-- [17] bpublicjob_abort_invoice_corrections16481SELECT
GRANT SELECT ON TABLE public.job_abort_invoice_corrections TO authenticated;
-- [17] bpublicjob_abort_invoice_corrections16482DELETE
GRANT DELETE ON TABLE public.job_abort_invoice_corrections TO service_role;
-- [17] bpublicjob_abort_invoice_corrections16482INSERT
GRANT INSERT ON TABLE public.job_abort_invoice_corrections TO service_role;
-- [17] bpublicjob_abort_invoice_corrections16482MAINTAIN
GRANT MAINTAIN ON TABLE public.job_abort_invoice_corrections TO service_role;
-- [17] bpublicjob_abort_invoice_corrections16482REFERENCES
GRANT REFERENCES ON TABLE public.job_abort_invoice_corrections TO service_role;
-- [17] bpublicjob_abort_invoice_corrections16482SELECT
GRANT SELECT ON TABLE public.job_abort_invoice_corrections TO service_role;
-- [17] bpublicjob_abort_invoice_corrections16482TRIGGER
GRANT TRIGGER ON TABLE public.job_abort_invoice_corrections TO service_role;
-- [17] bpublicjob_abort_invoice_corrections16482TRUNCATE
GRANT TRUNCATE ON TABLE public.job_abort_invoice_corrections TO service_role;
-- [17] bpublicjob_abort_invoice_corrections16482UPDATE
GRANT UPDATE ON TABLE public.job_abort_invoice_corrections TO service_role;
-- [17] bpublicjob_abort_requests16481SELECT
GRANT SELECT ON TABLE public.job_abort_requests TO authenticated;
-- [17] bpublicjob_abort_requests16482DELETE
GRANT DELETE ON TABLE public.job_abort_requests TO service_role;
-- [17] bpublicjob_abort_requests16482INSERT
GRANT INSERT ON TABLE public.job_abort_requests TO service_role;
-- [17] bpublicjob_abort_requests16482MAINTAIN
GRANT MAINTAIN ON TABLE public.job_abort_requests TO service_role;
-- [17] bpublicjob_abort_requests16482REFERENCES
GRANT REFERENCES ON TABLE public.job_abort_requests TO service_role;
-- [17] bpublicjob_abort_requests16482SELECT
GRANT SELECT ON TABLE public.job_abort_requests TO service_role;
-- [17] bpublicjob_abort_requests16482TRIGGER
GRANT TRIGGER ON TABLE public.job_abort_requests TO service_role;
-- [17] bpublicjob_abort_requests16482TRUNCATE
GRANT TRUNCATE ON TABLE public.job_abort_requests TO service_role;
-- [17] bpublicjob_abort_requests16482UPDATE
GRANT UPDATE ON TABLE public.job_abort_requests TO service_role;
-- [17] bpublicjob_aborts16481SELECT
GRANT SELECT ON TABLE public.job_aborts TO authenticated;
-- [17] bpublicjob_aborts16482DELETE
GRANT DELETE ON TABLE public.job_aborts TO service_role;
-- [17] bpublicjob_aborts16482INSERT
GRANT INSERT ON TABLE public.job_aborts TO service_role;
-- [17] bpublicjob_aborts16482MAINTAIN
GRANT MAINTAIN ON TABLE public.job_aborts TO service_role;
-- [17] bpublicjob_aborts16482REFERENCES
GRANT REFERENCES ON TABLE public.job_aborts TO service_role;
-- [17] bpublicjob_aborts16482SELECT
GRANT SELECT ON TABLE public.job_aborts TO service_role;
-- [17] bpublicjob_aborts16482TRIGGER
GRANT TRIGGER ON TABLE public.job_aborts TO service_role;
-- [17] bpublicjob_aborts16482TRUNCATE
GRANT TRUNCATE ON TABLE public.job_aborts TO service_role;
-- [17] bpublicjob_aborts16482UPDATE
GRANT UPDATE ON TABLE public.job_aborts TO service_role;
-- [17] bpublicjob_activity_log16481INSERT
GRANT INSERT ON TABLE public.job_activity_log TO authenticated;
-- [17] bpublicjob_activity_log16481MAINTAIN
GRANT MAINTAIN ON TABLE public.job_activity_log TO authenticated;
-- [17] bpublicjob_activity_log16481REFERENCES
GRANT REFERENCES ON TABLE public.job_activity_log TO authenticated;
-- [17] bpublicjob_activity_log16481SELECT
GRANT SELECT ON TABLE public.job_activity_log TO authenticated;
-- [17] bpublicjob_activity_log16481TRIGGER
GRANT TRIGGER ON TABLE public.job_activity_log TO authenticated;
-- [17] bpublicjob_activity_log16482DELETE
GRANT DELETE ON TABLE public.job_activity_log TO service_role;
-- [17] bpublicjob_activity_log16482INSERT
GRANT INSERT ON TABLE public.job_activity_log TO service_role;
-- [17] bpublicjob_activity_log16482MAINTAIN
GRANT MAINTAIN ON TABLE public.job_activity_log TO service_role;
-- [17] bpublicjob_activity_log16482REFERENCES
GRANT REFERENCES ON TABLE public.job_activity_log TO service_role;
-- [17] bpublicjob_activity_log16482SELECT
GRANT SELECT ON TABLE public.job_activity_log TO service_role;
-- [17] bpublicjob_activity_log16482TRIGGER
GRANT TRIGGER ON TABLE public.job_activity_log TO service_role;
-- [17] bpublicjob_activity_log16482TRUNCATE
GRANT TRUNCATE ON TABLE public.job_activity_log TO service_role;
-- [17] bpublicjob_activity_log16482UPDATE
GRANT UPDATE ON TABLE public.job_activity_log TO service_role;
-- [17] bpublicjob_deviation_log16481INSERT
GRANT INSERT ON TABLE public.job_deviation_log TO authenticated;
-- [17] bpublicjob_deviation_log16481MAINTAIN
GRANT MAINTAIN ON TABLE public.job_deviation_log TO authenticated;
-- [17] bpublicjob_deviation_log16481REFERENCES
GRANT REFERENCES ON TABLE public.job_deviation_log TO authenticated;
-- [17] bpublicjob_deviation_log16481SELECT
GRANT SELECT ON TABLE public.job_deviation_log TO authenticated;
-- [17] bpublicjob_deviation_log16481TRIGGER
GRANT TRIGGER ON TABLE public.job_deviation_log TO authenticated;
-- [17] bpublicjob_deviation_log16482DELETE
GRANT DELETE ON TABLE public.job_deviation_log TO service_role;
-- [17] bpublicjob_deviation_log16482INSERT
GRANT INSERT ON TABLE public.job_deviation_log TO service_role;
-- [17] bpublicjob_deviation_log16482MAINTAIN
GRANT MAINTAIN ON TABLE public.job_deviation_log TO service_role;
-- [17] bpublicjob_deviation_log16482REFERENCES
GRANT REFERENCES ON TABLE public.job_deviation_log TO service_role;
-- [17] bpublicjob_deviation_log16482SELECT
GRANT SELECT ON TABLE public.job_deviation_log TO service_role;
-- [17] bpublicjob_deviation_log16482TRIGGER
GRANT TRIGGER ON TABLE public.job_deviation_log TO service_role;
-- [17] bpublicjob_deviation_log16482TRUNCATE
GRANT TRUNCATE ON TABLE public.job_deviation_log TO service_role;
-- [17] bpublicjob_deviation_log16482UPDATE
GRANT UPDATE ON TABLE public.job_deviation_log TO service_role;
-- [17] bpublicjob_number_seq16480SELECT
GRANT SELECT ON SEQUENCE public.job_number_seq TO anon;
-- [17] bpublicjob_number_seq16480UPDATE
GRANT UPDATE ON SEQUENCE public.job_number_seq TO anon;
-- [17] bpublicjob_number_seq16480USAGE
GRANT USAGE ON SEQUENCE public.job_number_seq TO anon;
-- [17] bpublicjob_number_seq16481SELECT
GRANT SELECT ON SEQUENCE public.job_number_seq TO authenticated;
-- [17] bpublicjob_number_seq16481UPDATE
GRANT UPDATE ON SEQUENCE public.job_number_seq TO authenticated;
-- [17] bpublicjob_number_seq16481USAGE
GRANT USAGE ON SEQUENCE public.job_number_seq TO authenticated;
-- [17] bpublicjob_number_seq16482SELECT
GRANT SELECT ON SEQUENCE public.job_number_seq TO service_role;
-- [17] bpublicjob_number_seq16482UPDATE
GRANT UPDATE ON SEQUENCE public.job_number_seq TO service_role;
-- [17] bpublicjob_number_seq16482USAGE
GRANT USAGE ON SEQUENCE public.job_number_seq TO service_role;
-- [17] bpublicjob_pricing16481DELETE
GRANT DELETE ON TABLE public.job_pricing TO authenticated;
-- [17] bpublicjob_pricing16481INSERT
GRANT INSERT ON TABLE public.job_pricing TO authenticated;
-- [17] bpublicjob_pricing16481MAINTAIN
GRANT MAINTAIN ON TABLE public.job_pricing TO authenticated;
-- [17] bpublicjob_pricing16481REFERENCES
GRANT REFERENCES ON TABLE public.job_pricing TO authenticated;
-- [17] bpublicjob_pricing16481SELECT
GRANT SELECT ON TABLE public.job_pricing TO authenticated;
-- [17] bpublicjob_pricing16481TRIGGER
GRANT TRIGGER ON TABLE public.job_pricing TO authenticated;
-- [17] bpublicjob_pricing16481TRUNCATE
GRANT TRUNCATE ON TABLE public.job_pricing TO authenticated;
-- [17] bpublicjob_pricing16481UPDATE
GRANT UPDATE ON TABLE public.job_pricing TO authenticated;
-- [17] bpublicjob_pricing16482DELETE
GRANT DELETE ON TABLE public.job_pricing TO service_role;
-- [17] bpublicjob_pricing16482INSERT
GRANT INSERT ON TABLE public.job_pricing TO service_role;
-- [17] bpublicjob_pricing16482MAINTAIN
GRANT MAINTAIN ON TABLE public.job_pricing TO service_role;
-- [17] bpublicjob_pricing16482REFERENCES
GRANT REFERENCES ON TABLE public.job_pricing TO service_role;
-- [17] bpublicjob_pricing16482SELECT
GRANT SELECT ON TABLE public.job_pricing TO service_role;
-- [17] bpublicjob_pricing16482TRIGGER
GRANT TRIGGER ON TABLE public.job_pricing TO service_role;
-- [17] bpublicjob_pricing16482TRUNCATE
GRANT TRUNCATE ON TABLE public.job_pricing TO service_role;
-- [17] bpublicjob_pricing16482UPDATE
GRANT UPDATE ON TABLE public.job_pricing TO service_role;
-- [17] bpublicjob_status_overrides16481SELECT
GRANT SELECT ON TABLE public.job_status_overrides TO authenticated;
-- [17] bpublicjob_status_overrides16482DELETE
GRANT DELETE ON TABLE public.job_status_overrides TO service_role;
-- [17] bpublicjob_status_overrides16482INSERT
GRANT INSERT ON TABLE public.job_status_overrides TO service_role;
-- [17] bpublicjob_status_overrides16482MAINTAIN
GRANT MAINTAIN ON TABLE public.job_status_overrides TO service_role;
-- [17] bpublicjob_status_overrides16482REFERENCES
GRANT REFERENCES ON TABLE public.job_status_overrides TO service_role;
-- [17] bpublicjob_status_overrides16482SELECT
GRANT SELECT ON TABLE public.job_status_overrides TO service_role;
-- [17] bpublicjob_status_overrides16482TRIGGER
GRANT TRIGGER ON TABLE public.job_status_overrides TO service_role;
-- [17] bpublicjob_status_overrides16482TRUNCATE
GRANT TRUNCATE ON TABLE public.job_status_overrides TO service_role;
-- [17] bpublicjob_status_overrides16482UPDATE
GRANT UPDATE ON TABLE public.job_status_overrides TO service_role;
-- [17] bpublicjobs16480DELETE
GRANT DELETE ON TABLE public.jobs TO anon;
-- [17] bpublicjobs16480INSERT
GRANT INSERT ON TABLE public.jobs TO anon;
-- [17] bpublicjobs16480MAINTAIN
GRANT MAINTAIN ON TABLE public.jobs TO anon;
-- [17] bpublicjobs16480REFERENCES
GRANT REFERENCES ON TABLE public.jobs TO anon;
-- [17] bpublicjobs16480SELECT
GRANT SELECT ON TABLE public.jobs TO anon;
-- [17] bpublicjobs16480TRIGGER
GRANT TRIGGER ON TABLE public.jobs TO anon;
-- [17] bpublicjobs16480TRUNCATE
GRANT TRUNCATE ON TABLE public.jobs TO anon;
-- [17] bpublicjobs16480UPDATE
GRANT UPDATE ON TABLE public.jobs TO anon;
-- [17] bpublicjobs16481DELETE
GRANT DELETE ON TABLE public.jobs TO authenticated;
-- [17] bpublicjobs16481INSERT
GRANT INSERT ON TABLE public.jobs TO authenticated;
-- [17] bpublicjobs16481MAINTAIN
GRANT MAINTAIN ON TABLE public.jobs TO authenticated;
-- [17] bpublicjobs16481REFERENCES
GRANT REFERENCES ON TABLE public.jobs TO authenticated;
-- [17] bpublicjobs16481SELECT
GRANT SELECT ON TABLE public.jobs TO authenticated;
-- [17] bpublicjobs16481TRIGGER
GRANT TRIGGER ON TABLE public.jobs TO authenticated;
-- [17] bpublicjobs16481TRUNCATE
GRANT TRUNCATE ON TABLE public.jobs TO authenticated;
-- [17] bpublicjobs16481UPDATE
GRANT UPDATE ON TABLE public.jobs TO authenticated;
-- [17] bpublicjobs16482DELETE
GRANT DELETE ON TABLE public.jobs TO service_role;
-- [17] bpublicjobs16482INSERT
GRANT INSERT ON TABLE public.jobs TO service_role;
-- [17] bpublicjobs16482MAINTAIN
GRANT MAINTAIN ON TABLE public.jobs TO service_role;
-- [17] bpublicjobs16482REFERENCES
GRANT REFERENCES ON TABLE public.jobs TO service_role;
-- [17] bpublicjobs16482SELECT
GRANT SELECT ON TABLE public.jobs TO service_role;
-- [17] bpublicjobs16482TRIGGER
GRANT TRIGGER ON TABLE public.jobs TO service_role;
-- [17] bpublicjobs16482TRUNCATE
GRANT TRUNCATE ON TABLE public.jobs TO service_role;
-- [17] bpublicjobs16482UPDATE
GRANT UPDATE ON TABLE public.jobs TO service_role;
-- [17] bpubliconboarding_documents16480DELETE
GRANT DELETE ON TABLE public.onboarding_documents TO anon;
-- [17] bpubliconboarding_documents16480INSERT
GRANT INSERT ON TABLE public.onboarding_documents TO anon;
-- [17] bpubliconboarding_documents16480MAINTAIN
GRANT MAINTAIN ON TABLE public.onboarding_documents TO anon;
-- [17] bpubliconboarding_documents16480REFERENCES
GRANT REFERENCES ON TABLE public.onboarding_documents TO anon;
-- [17] bpubliconboarding_documents16480SELECT
GRANT SELECT ON TABLE public.onboarding_documents TO anon;
-- [17] bpubliconboarding_documents16480TRIGGER
GRANT TRIGGER ON TABLE public.onboarding_documents TO anon;
-- [17] bpubliconboarding_documents16480TRUNCATE
GRANT TRUNCATE ON TABLE public.onboarding_documents TO anon;
-- [17] bpubliconboarding_documents16480UPDATE
GRANT UPDATE ON TABLE public.onboarding_documents TO anon;
-- [17] bpubliconboarding_documents16481DELETE
GRANT DELETE ON TABLE public.onboarding_documents TO authenticated;
-- [17] bpubliconboarding_documents16481INSERT
GRANT INSERT ON TABLE public.onboarding_documents TO authenticated;
-- [17] bpubliconboarding_documents16481MAINTAIN
GRANT MAINTAIN ON TABLE public.onboarding_documents TO authenticated;
-- [17] bpubliconboarding_documents16481REFERENCES
GRANT REFERENCES ON TABLE public.onboarding_documents TO authenticated;
-- [17] bpubliconboarding_documents16481SELECT
GRANT SELECT ON TABLE public.onboarding_documents TO authenticated;
-- [17] bpubliconboarding_documents16481TRIGGER
GRANT TRIGGER ON TABLE public.onboarding_documents TO authenticated;
-- [17] bpubliconboarding_documents16481TRUNCATE
GRANT TRUNCATE ON TABLE public.onboarding_documents TO authenticated;
-- [17] bpubliconboarding_documents16481UPDATE
GRANT UPDATE ON TABLE public.onboarding_documents TO authenticated;
-- [17] bpubliconboarding_documents16482DELETE
GRANT DELETE ON TABLE public.onboarding_documents TO service_role;
-- [17] bpubliconboarding_documents16482INSERT
GRANT INSERT ON TABLE public.onboarding_documents TO service_role;
-- [17] bpubliconboarding_documents16482MAINTAIN
GRANT MAINTAIN ON TABLE public.onboarding_documents TO service_role;
-- [17] bpubliconboarding_documents16482REFERENCES
GRANT REFERENCES ON TABLE public.onboarding_documents TO service_role;
-- [17] bpubliconboarding_documents16482SELECT
GRANT SELECT ON TABLE public.onboarding_documents TO service_role;
-- [17] bpubliconboarding_documents16482TRIGGER
GRANT TRIGGER ON TABLE public.onboarding_documents TO service_role;
-- [17] bpubliconboarding_documents16482TRUNCATE
GRANT TRUNCATE ON TABLE public.onboarding_documents TO service_role;
-- [17] bpubliconboarding_documents16482UPDATE
GRANT UPDATE ON TABLE public.onboarding_documents TO service_role;
-- [17] bpublicorganisations16480DELETE
GRANT DELETE ON TABLE public.organisations TO anon;
-- [17] bpublicorganisations16480INSERT
GRANT INSERT ON TABLE public.organisations TO anon;
-- [17] bpublicorganisations16480MAINTAIN
GRANT MAINTAIN ON TABLE public.organisations TO anon;
-- [17] bpublicorganisations16480REFERENCES
GRANT REFERENCES ON TABLE public.organisations TO anon;
-- [17] bpublicorganisations16480SELECT
GRANT SELECT ON TABLE public.organisations TO anon;
-- [17] bpublicorganisations16480TRIGGER
GRANT TRIGGER ON TABLE public.organisations TO anon;
-- [17] bpublicorganisations16480TRUNCATE
GRANT TRUNCATE ON TABLE public.organisations TO anon;
-- [17] bpublicorganisations16480UPDATE
GRANT UPDATE ON TABLE public.organisations TO anon;
-- [17] bpublicorganisations16481DELETE
GRANT DELETE ON TABLE public.organisations TO authenticated;
-- [17] bpublicorganisations16481INSERT
GRANT INSERT ON TABLE public.organisations TO authenticated;
-- [17] bpublicorganisations16481MAINTAIN
GRANT MAINTAIN ON TABLE public.organisations TO authenticated;
-- [17] bpublicorganisations16481REFERENCES
GRANT REFERENCES ON TABLE public.organisations TO authenticated;
-- [17] bpublicorganisations16481SELECT
GRANT SELECT ON TABLE public.organisations TO authenticated;
-- [17] bpublicorganisations16481TRIGGER
GRANT TRIGGER ON TABLE public.organisations TO authenticated;
-- [17] bpublicorganisations16481TRUNCATE
GRANT TRUNCATE ON TABLE public.organisations TO authenticated;
-- [17] bpublicorganisations16481UPDATE
GRANT UPDATE ON TABLE public.organisations TO authenticated;
-- [17] bpublicorganisations16482DELETE
GRANT DELETE ON TABLE public.organisations TO service_role;
-- [17] bpublicorganisations16482INSERT
GRANT INSERT ON TABLE public.organisations TO service_role;
-- [17] bpublicorganisations16482MAINTAIN
GRANT MAINTAIN ON TABLE public.organisations TO service_role;
-- [17] bpublicorganisations16482REFERENCES
GRANT REFERENCES ON TABLE public.organisations TO service_role;
-- [17] bpublicorganisations16482SELECT
GRANT SELECT ON TABLE public.organisations TO service_role;
-- [17] bpublicorganisations16482TRIGGER
GRANT TRIGGER ON TABLE public.organisations TO service_role;
-- [17] bpublicorganisations16482TRUNCATE
GRANT TRUNCATE ON TABLE public.organisations TO service_role;
-- [17] bpublicorganisations16482UPDATE
GRANT UPDATE ON TABLE public.organisations TO service_role;
-- [17] bpublicpermission_audit_log16480DELETE
GRANT DELETE ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480INSERT
GRANT INSERT ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480MAINTAIN
GRANT MAINTAIN ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480REFERENCES
GRANT REFERENCES ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480SELECT
GRANT SELECT ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480TRIGGER
GRANT TRIGGER ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480TRUNCATE
GRANT TRUNCATE ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16480UPDATE
GRANT UPDATE ON TABLE public.permission_audit_log TO anon;
-- [17] bpublicpermission_audit_log16481MAINTAIN
GRANT MAINTAIN ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16481REFERENCES
GRANT REFERENCES ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16481SELECT
GRANT SELECT ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16481TRIGGER
GRANT TRIGGER ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16481TRUNCATE
GRANT TRUNCATE ON TABLE public.permission_audit_log TO authenticated;
-- [17] bpublicpermission_audit_log16482DELETE
GRANT DELETE ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482INSERT
GRANT INSERT ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482MAINTAIN
GRANT MAINTAIN ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482REFERENCES
GRANT REFERENCES ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482SELECT
GRANT SELECT ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482TRIGGER
GRANT TRIGGER ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482TRUNCATE
GRANT TRUNCATE ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermission_audit_log16482UPDATE
GRANT UPDATE ON TABLE public.permission_audit_log TO service_role;
-- [17] bpublicpermissions_catalog16480DELETE
GRANT DELETE ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480INSERT
GRANT INSERT ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480MAINTAIN
GRANT MAINTAIN ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480REFERENCES
GRANT REFERENCES ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480SELECT
GRANT SELECT ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480TRIGGER
GRANT TRIGGER ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480TRUNCATE
GRANT TRUNCATE ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16480UPDATE
GRANT UPDATE ON TABLE public.permissions_catalog TO anon;
-- [17] bpublicpermissions_catalog16481MAINTAIN
GRANT MAINTAIN ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16481REFERENCES
GRANT REFERENCES ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16481SELECT
GRANT SELECT ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16481TRIGGER
GRANT TRIGGER ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16481TRUNCATE
GRANT TRUNCATE ON TABLE public.permissions_catalog TO authenticated;
-- [17] bpublicpermissions_catalog16482DELETE
GRANT DELETE ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482INSERT
GRANT INSERT ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482MAINTAIN
GRANT MAINTAIN ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482REFERENCES
GRANT REFERENCES ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482SELECT
GRANT SELECT ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482TRIGGER
GRANT TRIGGER ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482TRUNCATE
GRANT TRUNCATE ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicpermissions_catalog16482UPDATE
GRANT UPDATE ON TABLE public.permissions_catalog TO service_role;
-- [17] bpublicphotos16480INSERT
GRANT INSERT ON TABLE public.photos TO anon;
-- [17] bpublicphotos16480MAINTAIN
GRANT MAINTAIN ON TABLE public.photos TO anon;
-- [17] bpublicphotos16480REFERENCES
GRANT REFERENCES ON TABLE public.photos TO anon;
-- [17] bpublicphotos16480SELECT
GRANT SELECT ON TABLE public.photos TO anon;
-- [17] bpublicphotos16480TRIGGER
GRANT TRIGGER ON TABLE public.photos TO anon;
-- [17] bpublicphotos16480UPDATE
GRANT UPDATE ON TABLE public.photos TO anon;
-- [17] bpublicphotos16481INSERT
GRANT INSERT ON TABLE public.photos TO authenticated;
-- [17] bpublicphotos16481MAINTAIN
GRANT MAINTAIN ON TABLE public.photos TO authenticated;
-- [17] bpublicphotos16481REFERENCES
GRANT REFERENCES ON TABLE public.photos TO authenticated;
-- [17] bpublicphotos16481SELECT
GRANT SELECT ON TABLE public.photos TO authenticated;
-- [17] bpublicphotos16481TRIGGER
GRANT TRIGGER ON TABLE public.photos TO authenticated;
-- [17] bpublicphotos16481UPDATE
GRANT UPDATE ON TABLE public.photos TO authenticated;
-- [17] bpublicphotos16482DELETE
GRANT DELETE ON TABLE public.photos TO service_role;
-- [17] bpublicphotos16482INSERT
GRANT INSERT ON TABLE public.photos TO service_role;
-- [17] bpublicphotos16482MAINTAIN
GRANT MAINTAIN ON TABLE public.photos TO service_role;
-- [17] bpublicphotos16482REFERENCES
GRANT REFERENCES ON TABLE public.photos TO service_role;
-- [17] bpublicphotos16482SELECT
GRANT SELECT ON TABLE public.photos TO service_role;
-- [17] bpublicphotos16482TRIGGER
GRANT TRIGGER ON TABLE public.photos TO service_role;
-- [17] bpublicphotos16482TRUNCATE
GRANT TRUNCATE ON TABLE public.photos TO service_role;
-- [17] bpublicphotos16482UPDATE
GRANT UPDATE ON TABLE public.photos TO service_role;
-- [17] bpublicpricing_snapshots16480DELETE
GRANT DELETE ON TABLE public.pricing_snapshots TO anon;
-- [17] bpublicpricing_snapshots16480INSERT
GRANT INSERT ON TABLE public.pricing_snapshots TO anon;
-- [17] bpublicpricing_snapshots16480MAINTAIN
GRANT MAINTAIN ON TABLE public.pricing_snapshots TO anon;
-- [17] bpublicpricing_snapshots16480REFERENCES
GRANT REFERENCES ON TABLE public.pricing_snapshots TO anon;
-- [17] bpublicpricing_snapshots16480SELECT
GRANT SELECT ON TABLE public.pricing_snapshots TO anon;
-- [17] bpublicpricing_snapshots16480TRIGGER
GRANT TRIGGER ON TABLE public.pricing_snapshots TO anon;
-- [17] bpublicpricing_snapshots16480TRUNCATE
GRANT TRUNCATE ON TABLE public.pricing_snapshots TO anon;
-- [17] bpublicpricing_snapshots16480UPDATE
GRANT UPDATE ON TABLE public.pricing_snapshots TO anon;
-- [17] bpublicpricing_snapshots16481DELETE
GRANT DELETE ON TABLE public.pricing_snapshots TO authenticated;
-- [17] bpublicpricing_snapshots16481INSERT
GRANT INSERT ON TABLE public.pricing_snapshots TO authenticated;
-- [17] bpublicpricing_snapshots16481MAINTAIN
GRANT MAINTAIN ON TABLE public.pricing_snapshots TO authenticated;
-- [17] bpublicpricing_snapshots16481REFERENCES
GRANT REFERENCES ON TABLE public.pricing_snapshots TO authenticated;
-- [17] bpublicpricing_snapshots16481SELECT
GRANT SELECT ON TABLE public.pricing_snapshots TO authenticated;
-- [17] bpublicpricing_snapshots16481TRIGGER
GRANT TRIGGER ON TABLE public.pricing_snapshots TO authenticated;
-- [17] bpublicpricing_snapshots16481TRUNCATE
GRANT TRUNCATE ON TABLE public.pricing_snapshots TO authenticated;
-- [17] bpublicpricing_snapshots16481UPDATE
GRANT UPDATE ON TABLE public.pricing_snapshots TO authenticated;
-- [17] bpublicpricing_snapshots16482DELETE
GRANT DELETE ON TABLE public.pricing_snapshots TO service_role;
-- [17] bpublicpricing_snapshots16482INSERT
GRANT INSERT ON TABLE public.pricing_snapshots TO service_role;
-- [17] bpublicpricing_snapshots16482MAINTAIN
GRANT MAINTAIN ON TABLE public.pricing_snapshots TO service_role;
-- [17] bpublicpricing_snapshots16482REFERENCES
GRANT REFERENCES ON TABLE public.pricing_snapshots TO service_role;
-- [17] bpublicpricing_snapshots16482SELECT
GRANT SELECT ON TABLE public.pricing_snapshots TO service_role;
-- [17] bpublicpricing_snapshots16482TRIGGER
GRANT TRIGGER ON TABLE public.pricing_snapshots TO service_role;
-- [17] bpublicpricing_snapshots16482TRUNCATE
GRANT TRUNCATE ON TABLE public.pricing_snapshots TO service_role;
-- [17] bpublicpricing_snapshots16482UPDATE
GRANT UPDATE ON TABLE public.pricing_snapshots TO service_role;
-- [17] bpublicpush_config16482DELETE
GRANT DELETE ON TABLE public.push_config TO service_role;
-- [17] bpublicpush_config16482INSERT
GRANT INSERT ON TABLE public.push_config TO service_role;
-- [17] bpublicpush_config16482MAINTAIN
GRANT MAINTAIN ON TABLE public.push_config TO service_role;
-- [17] bpublicpush_config16482REFERENCES
GRANT REFERENCES ON TABLE public.push_config TO service_role;
-- [17] bpublicpush_config16482SELECT
GRANT SELECT ON TABLE public.push_config TO service_role;
-- [17] bpublicpush_config16482TRIGGER
GRANT TRIGGER ON TABLE public.push_config TO service_role;
-- [17] bpublicpush_config16482TRUNCATE
GRANT TRUNCATE ON TABLE public.push_config TO service_role;
-- [17] bpublicpush_config16482UPDATE
GRANT UPDATE ON TABLE public.push_config TO service_role;
-- [17] bpublicpush_subscriptions16480DELETE
GRANT DELETE ON TABLE public.push_subscriptions TO anon;
-- [17] bpublicpush_subscriptions16480INSERT
GRANT INSERT ON TABLE public.push_subscriptions TO anon;
-- [17] bpublicpush_subscriptions16480MAINTAIN
GRANT MAINTAIN ON TABLE public.push_subscriptions TO anon;
-- [17] bpublicpush_subscriptions16480REFERENCES
GRANT REFERENCES ON TABLE public.push_subscriptions TO anon;
-- [17] bpublicpush_subscriptions16480SELECT
GRANT SELECT ON TABLE public.push_subscriptions TO anon;
-- [17] bpublicpush_subscriptions16480TRIGGER
GRANT TRIGGER ON TABLE public.push_subscriptions TO anon;
-- [17] bpublicpush_subscriptions16480TRUNCATE
GRANT TRUNCATE ON TABLE public.push_subscriptions TO anon;
-- [17] bpublicpush_subscriptions16480UPDATE
GRANT UPDATE ON TABLE public.push_subscriptions TO anon;
-- [17] bpublicpush_subscriptions16481DELETE
GRANT DELETE ON TABLE public.push_subscriptions TO authenticated;
-- [17] bpublicpush_subscriptions16481INSERT
GRANT INSERT ON TABLE public.push_subscriptions TO authenticated;
-- [17] bpublicpush_subscriptions16481MAINTAIN
GRANT MAINTAIN ON TABLE public.push_subscriptions TO authenticated;
-- [17] bpublicpush_subscriptions16481REFERENCES
GRANT REFERENCES ON TABLE public.push_subscriptions TO authenticated;
-- [17] bpublicpush_subscriptions16481SELECT
GRANT SELECT ON TABLE public.push_subscriptions TO authenticated;
-- [17] bpublicpush_subscriptions16481TRIGGER
GRANT TRIGGER ON TABLE public.push_subscriptions TO authenticated;
-- [17] bpublicpush_subscriptions16481TRUNCATE
GRANT TRUNCATE ON TABLE public.push_subscriptions TO authenticated;
-- [17] bpublicpush_subscriptions16481UPDATE
GRANT UPDATE ON TABLE public.push_subscriptions TO authenticated;
-- [17] bpublicpush_subscriptions16482DELETE
GRANT DELETE ON TABLE public.push_subscriptions TO service_role;
-- [17] bpublicpush_subscriptions16482INSERT
GRANT INSERT ON TABLE public.push_subscriptions TO service_role;
-- [17] bpublicpush_subscriptions16482MAINTAIN
GRANT MAINTAIN ON TABLE public.push_subscriptions TO service_role;
-- [17] bpublicpush_subscriptions16482REFERENCES
GRANT REFERENCES ON TABLE public.push_subscriptions TO service_role;
-- [17] bpublicpush_subscriptions16482SELECT
GRANT SELECT ON TABLE public.push_subscriptions TO service_role;
-- [17] bpublicpush_subscriptions16482TRIGGER
GRANT TRIGGER ON TABLE public.push_subscriptions TO service_role;
-- [17] bpublicpush_subscriptions16482TRUNCATE
GRANT TRUNCATE ON TABLE public.push_subscriptions TO service_role;
-- [17] bpublicpush_subscriptions16482UPDATE
GRANT UPDATE ON TABLE public.push_subscriptions TO service_role;
-- [17] bpublicqr_confirmations16480INSERT
GRANT INSERT ON TABLE public.qr_confirmations TO anon;
-- [17] bpublicqr_confirmations16480MAINTAIN
GRANT MAINTAIN ON TABLE public.qr_confirmations TO anon;
-- [17] bpublicqr_confirmations16480REFERENCES
GRANT REFERENCES ON TABLE public.qr_confirmations TO anon;
-- [17] bpublicqr_confirmations16480SELECT
GRANT SELECT ON TABLE public.qr_confirmations TO anon;
-- [17] bpublicqr_confirmations16480TRIGGER
GRANT TRIGGER ON TABLE public.qr_confirmations TO anon;
-- [17] bpublicqr_confirmations16481INSERT
GRANT INSERT ON TABLE public.qr_confirmations TO authenticated;
-- [17] bpublicqr_confirmations16481MAINTAIN
GRANT MAINTAIN ON TABLE public.qr_confirmations TO authenticated;
-- [17] bpublicqr_confirmations16481REFERENCES
GRANT REFERENCES ON TABLE public.qr_confirmations TO authenticated;
-- [17] bpublicqr_confirmations16481SELECT
GRANT SELECT ON TABLE public.qr_confirmations TO authenticated;
-- [17] bpublicqr_confirmations16481TRIGGER
GRANT TRIGGER ON TABLE public.qr_confirmations TO authenticated;
-- [17] bpublicqr_confirmations16482DELETE
GRANT DELETE ON TABLE public.qr_confirmations TO service_role;
-- [17] bpublicqr_confirmations16482INSERT
GRANT INSERT ON TABLE public.qr_confirmations TO service_role;
-- [17] bpublicqr_confirmations16482MAINTAIN
GRANT MAINTAIN ON TABLE public.qr_confirmations TO service_role;
-- [17] bpublicqr_confirmations16482REFERENCES
GRANT REFERENCES ON TABLE public.qr_confirmations TO service_role;
-- [17] bpublicqr_confirmations16482SELECT
GRANT SELECT ON TABLE public.qr_confirmations TO service_role;
-- [17] bpublicqr_confirmations16482TRIGGER
GRANT TRIGGER ON TABLE public.qr_confirmations TO service_role;
-- [17] bpublicqr_confirmations16482TRUNCATE
GRANT TRUNCATE ON TABLE public.qr_confirmations TO service_role;
-- [17] bpublicqr_confirmations16482UPDATE
GRANT UPDATE ON TABLE public.qr_confirmations TO service_role;
-- [17] bpublicrole_permission_templates16480DELETE
GRANT DELETE ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480INSERT
GRANT INSERT ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480MAINTAIN
GRANT MAINTAIN ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480REFERENCES
GRANT REFERENCES ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480SELECT
GRANT SELECT ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480TRIGGER
GRANT TRIGGER ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480TRUNCATE
GRANT TRUNCATE ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16480UPDATE
GRANT UPDATE ON TABLE public.role_permission_templates TO anon;
-- [17] bpublicrole_permission_templates16481MAINTAIN
GRANT MAINTAIN ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16481REFERENCES
GRANT REFERENCES ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16481SELECT
GRANT SELECT ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16481TRIGGER
GRANT TRIGGER ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16481TRUNCATE
GRANT TRUNCATE ON TABLE public.role_permission_templates TO authenticated;
-- [17] bpublicrole_permission_templates16482DELETE
GRANT DELETE ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482INSERT
GRANT INSERT ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482MAINTAIN
GRANT MAINTAIN ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482REFERENCES
GRANT REFERENCES ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482SELECT
GRANT SELECT ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482TRIGGER
GRANT TRIGGER ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482TRUNCATE
GRANT TRUNCATE ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicrole_permission_templates16482UPDATE
GRANT UPDATE ON TABLE public.role_permission_templates TO service_role;
-- [17] bpublicuser_effective_permissions16480DELETE
GRANT DELETE ON TABLE public.user_effective_permissions TO anon;
-- [17] bpublicuser_effective_permissions16480INSERT
GRANT INSERT ON TABLE public.user_effective_permissions TO anon;
-- [17] bpublicuser_effective_permissions16480MAINTAIN
GRANT MAINTAIN ON TABLE public.user_effective_permissions TO anon;
-- [17] bpublicuser_effective_permissions16480REFERENCES
GRANT REFERENCES ON TABLE public.user_effective_permissions TO anon;
-- [17] bpublicuser_effective_permissions16480SELECT
GRANT SELECT ON TABLE public.user_effective_permissions TO anon;
-- [17] bpublicuser_effective_permissions16480TRIGGER
GRANT TRIGGER ON TABLE public.user_effective_permissions TO anon;
-- [17] bpublicuser_effective_permissions16480TRUNCATE
GRANT TRUNCATE ON TABLE public.user_effective_permissions TO anon;
-- [17] bpublicuser_effective_permissions16480UPDATE
GRANT UPDATE ON TABLE public.user_effective_permissions TO anon;
-- [17] bpublicuser_effective_permissions16481DELETE
GRANT DELETE ON TABLE public.user_effective_permissions TO authenticated;
-- [17] bpublicuser_effective_permissions16481INSERT
GRANT INSERT ON TABLE public.user_effective_permissions TO authenticated;
-- [17] bpublicuser_effective_permissions16481MAINTAIN
GRANT MAINTAIN ON TABLE public.user_effective_permissions TO authenticated;
-- [17] bpublicuser_effective_permissions16481REFERENCES
GRANT REFERENCES ON TABLE public.user_effective_permissions TO authenticated;
-- [17] bpublicuser_effective_permissions16481SELECT
GRANT SELECT ON TABLE public.user_effective_permissions TO authenticated;
-- [17] bpublicuser_effective_permissions16481TRIGGER
GRANT TRIGGER ON TABLE public.user_effective_permissions TO authenticated;
-- [17] bpublicuser_effective_permissions16481TRUNCATE
GRANT TRUNCATE ON TABLE public.user_effective_permissions TO authenticated;
-- [17] bpublicuser_effective_permissions16481UPDATE
GRANT UPDATE ON TABLE public.user_effective_permissions TO authenticated;
-- [17] bpublicuser_effective_permissions16482DELETE
GRANT DELETE ON TABLE public.user_effective_permissions TO service_role;
-- [17] bpublicuser_effective_permissions16482INSERT
GRANT INSERT ON TABLE public.user_effective_permissions TO service_role;
-- [17] bpublicuser_effective_permissions16482MAINTAIN
GRANT MAINTAIN ON TABLE public.user_effective_permissions TO service_role;
-- [17] bpublicuser_effective_permissions16482REFERENCES
GRANT REFERENCES ON TABLE public.user_effective_permissions TO service_role;
-- [17] bpublicuser_effective_permissions16482SELECT
GRANT SELECT ON TABLE public.user_effective_permissions TO service_role;
-- [17] bpublicuser_effective_permissions16482TRIGGER
GRANT TRIGGER ON TABLE public.user_effective_permissions TO service_role;
-- [17] bpublicuser_effective_permissions16482TRUNCATE
GRANT TRUNCATE ON TABLE public.user_effective_permissions TO service_role;
-- [17] bpublicuser_effective_permissions16482UPDATE
GRANT UPDATE ON TABLE public.user_effective_permissions TO service_role;
-- [17] bpublicuser_permission_overrides16480DELETE
GRANT DELETE ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480INSERT
GRANT INSERT ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480REFERENCES
GRANT REFERENCES ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480SELECT
GRANT SELECT ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480TRIGGER
GRANT TRIGGER ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16480UPDATE
GRANT UPDATE ON TABLE public.user_permission_overrides TO anon;
-- [17] bpublicuser_permission_overrides16481MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16481REFERENCES
GRANT REFERENCES ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16481SELECT
GRANT SELECT ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16481TRIGGER
GRANT TRIGGER ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16481TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permission_overrides TO authenticated;
-- [17] bpublicuser_permission_overrides16482DELETE
GRANT DELETE ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482INSERT
GRANT INSERT ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482REFERENCES
GRANT REFERENCES ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482SELECT
GRANT SELECT ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482TRIGGER
GRANT TRIGGER ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides16482UPDATE
GRANT UPDATE ON TABLE public.user_permission_overrides TO service_role;
-- [17] bpublicuser_permission_overrides_detailed16480DELETE
GRANT DELETE ON TABLE public.user_permission_overrides_detailed TO anon;
-- [17] bpublicuser_permission_overrides_detailed16480INSERT
GRANT INSERT ON TABLE public.user_permission_overrides_detailed TO anon;
-- [17] bpublicuser_permission_overrides_detailed16480MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permission_overrides_detailed TO anon;
-- [17] bpublicuser_permission_overrides_detailed16480REFERENCES
GRANT REFERENCES ON TABLE public.user_permission_overrides_detailed TO anon;
-- [17] bpublicuser_permission_overrides_detailed16480SELECT
GRANT SELECT ON TABLE public.user_permission_overrides_detailed TO anon;
-- [17] bpublicuser_permission_overrides_detailed16480TRIGGER
GRANT TRIGGER ON TABLE public.user_permission_overrides_detailed TO anon;
-- [17] bpublicuser_permission_overrides_detailed16480TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permission_overrides_detailed TO anon;
-- [17] bpublicuser_permission_overrides_detailed16480UPDATE
GRANT UPDATE ON TABLE public.user_permission_overrides_detailed TO anon;
-- [17] bpublicuser_permission_overrides_detailed16481DELETE
GRANT DELETE ON TABLE public.user_permission_overrides_detailed TO authenticated;
-- [17] bpublicuser_permission_overrides_detailed16481INSERT
GRANT INSERT ON TABLE public.user_permission_overrides_detailed TO authenticated;
-- [17] bpublicuser_permission_overrides_detailed16481MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permission_overrides_detailed TO authenticated;
-- [17] bpublicuser_permission_overrides_detailed16481REFERENCES
GRANT REFERENCES ON TABLE public.user_permission_overrides_detailed TO authenticated;
-- [17] bpublicuser_permission_overrides_detailed16481SELECT
GRANT SELECT ON TABLE public.user_permission_overrides_detailed TO authenticated;
-- [17] bpublicuser_permission_overrides_detailed16481TRIGGER
GRANT TRIGGER ON TABLE public.user_permission_overrides_detailed TO authenticated;
-- [17] bpublicuser_permission_overrides_detailed16481TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permission_overrides_detailed TO authenticated;
-- [17] bpublicuser_permission_overrides_detailed16481UPDATE
GRANT UPDATE ON TABLE public.user_permission_overrides_detailed TO authenticated;
-- [17] bpublicuser_permission_overrides_detailed16482DELETE
GRANT DELETE ON TABLE public.user_permission_overrides_detailed TO service_role;
-- [17] bpublicuser_permission_overrides_detailed16482INSERT
GRANT INSERT ON TABLE public.user_permission_overrides_detailed TO service_role;
-- [17] bpublicuser_permission_overrides_detailed16482MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permission_overrides_detailed TO service_role;
-- [17] bpublicuser_permission_overrides_detailed16482REFERENCES
GRANT REFERENCES ON TABLE public.user_permission_overrides_detailed TO service_role;
-- [17] bpublicuser_permission_overrides_detailed16482SELECT
GRANT SELECT ON TABLE public.user_permission_overrides_detailed TO service_role;
-- [17] bpublicuser_permission_overrides_detailed16482TRIGGER
GRANT TRIGGER ON TABLE public.user_permission_overrides_detailed TO service_role;
-- [17] bpublicuser_permission_overrides_detailed16482TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permission_overrides_detailed TO service_role;
-- [17] bpublicuser_permission_overrides_detailed16482UPDATE
GRANT UPDATE ON TABLE public.user_permission_overrides_detailed TO service_role;
-- [17] bpublicuser_permissions_matrix16480DELETE
GRANT DELETE ON TABLE public.user_permissions_matrix TO anon;
-- [17] bpublicuser_permissions_matrix16480INSERT
GRANT INSERT ON TABLE public.user_permissions_matrix TO anon;
-- [17] bpublicuser_permissions_matrix16480MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permissions_matrix TO anon;
-- [17] bpublicuser_permissions_matrix16480REFERENCES
GRANT REFERENCES ON TABLE public.user_permissions_matrix TO anon;
-- [17] bpublicuser_permissions_matrix16480SELECT
GRANT SELECT ON TABLE public.user_permissions_matrix TO anon;
-- [17] bpublicuser_permissions_matrix16480TRIGGER
GRANT TRIGGER ON TABLE public.user_permissions_matrix TO anon;
-- [17] bpublicuser_permissions_matrix16480TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permissions_matrix TO anon;
-- [17] bpublicuser_permissions_matrix16480UPDATE
GRANT UPDATE ON TABLE public.user_permissions_matrix TO anon;
-- [17] bpublicuser_permissions_matrix16481DELETE
GRANT DELETE ON TABLE public.user_permissions_matrix TO authenticated;
-- [17] bpublicuser_permissions_matrix16481INSERT
GRANT INSERT ON TABLE public.user_permissions_matrix TO authenticated;
-- [17] bpublicuser_permissions_matrix16481MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permissions_matrix TO authenticated;
-- [17] bpublicuser_permissions_matrix16481REFERENCES
GRANT REFERENCES ON TABLE public.user_permissions_matrix TO authenticated;
-- [17] bpublicuser_permissions_matrix16481SELECT
GRANT SELECT ON TABLE public.user_permissions_matrix TO authenticated;
-- [17] bpublicuser_permissions_matrix16481TRIGGER
GRANT TRIGGER ON TABLE public.user_permissions_matrix TO authenticated;
-- [17] bpublicuser_permissions_matrix16481TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permissions_matrix TO authenticated;
-- [17] bpublicuser_permissions_matrix16481UPDATE
GRANT UPDATE ON TABLE public.user_permissions_matrix TO authenticated;
-- [17] bpublicuser_permissions_matrix16482DELETE
GRANT DELETE ON TABLE public.user_permissions_matrix TO service_role;
-- [17] bpublicuser_permissions_matrix16482INSERT
GRANT INSERT ON TABLE public.user_permissions_matrix TO service_role;
-- [17] bpublicuser_permissions_matrix16482MAINTAIN
GRANT MAINTAIN ON TABLE public.user_permissions_matrix TO service_role;
-- [17] bpublicuser_permissions_matrix16482REFERENCES
GRANT REFERENCES ON TABLE public.user_permissions_matrix TO service_role;
-- [17] bpublicuser_permissions_matrix16482SELECT
GRANT SELECT ON TABLE public.user_permissions_matrix TO service_role;
-- [17] bpublicuser_permissions_matrix16482TRIGGER
GRANT TRIGGER ON TABLE public.user_permissions_matrix TO service_role;
-- [17] bpublicuser_permissions_matrix16482TRUNCATE
GRANT TRUNCATE ON TABLE public.user_permissions_matrix TO service_role;
-- [17] bpublicuser_permissions_matrix16482UPDATE
GRANT UPDATE ON TABLE public.user_permissions_matrix TO service_role;
-- [17] bpublicuser_profiles16480DELETE
GRANT DELETE ON TABLE public.user_profiles TO anon;
-- [17] bpublicuser_profiles16480INSERT
GRANT INSERT ON TABLE public.user_profiles TO anon;
-- [17] bpublicuser_profiles16480MAINTAIN
GRANT MAINTAIN ON TABLE public.user_profiles TO anon;
-- [17] bpublicuser_profiles16480REFERENCES
GRANT REFERENCES ON TABLE public.user_profiles TO anon;
-- [17] bpublicuser_profiles16480SELECT
GRANT SELECT ON TABLE public.user_profiles TO anon;
-- [17] bpublicuser_profiles16480TRIGGER
GRANT TRIGGER ON TABLE public.user_profiles TO anon;
-- [17] bpublicuser_profiles16480TRUNCATE
GRANT TRUNCATE ON TABLE public.user_profiles TO anon;
-- [17] bpublicuser_profiles16480UPDATE
GRANT UPDATE ON TABLE public.user_profiles TO anon;
-- [17] bpublicuser_profiles16481INSERT
GRANT INSERT ON TABLE public.user_profiles TO authenticated;
-- [17] bpublicuser_profiles16481MAINTAIN
GRANT MAINTAIN ON TABLE public.user_profiles TO authenticated;
-- [17] bpublicuser_profiles16481REFERENCES
GRANT REFERENCES ON TABLE public.user_profiles TO authenticated;
-- [17] bpublicuser_profiles16481SELECT
GRANT SELECT ON TABLE public.user_profiles TO authenticated;
-- [17] bpublicuser_profiles16481TRIGGER
GRANT TRIGGER ON TABLE public.user_profiles TO authenticated;
-- [17] bpublicuser_profiles16481TRUNCATE
GRANT TRUNCATE ON TABLE public.user_profiles TO authenticated;
-- [17] bpublicuser_profiles16481UPDATE
GRANT UPDATE ON TABLE public.user_profiles TO authenticated;
-- [17] bpublicuser_profiles16482DELETE
GRANT DELETE ON TABLE public.user_profiles TO service_role;
-- [17] bpublicuser_profiles16482INSERT
GRANT INSERT ON TABLE public.user_profiles TO service_role;
-- [17] bpublicuser_profiles16482MAINTAIN
GRANT MAINTAIN ON TABLE public.user_profiles TO service_role;
-- [17] bpublicuser_profiles16482REFERENCES
GRANT REFERENCES ON TABLE public.user_profiles TO service_role;
-- [17] bpublicuser_profiles16482SELECT
GRANT SELECT ON TABLE public.user_profiles TO service_role;
-- [17] bpublicuser_profiles16482TRIGGER
GRANT TRIGGER ON TABLE public.user_profiles TO service_role;
-- [17] bpublicuser_profiles16482TRUNCATE
GRANT TRUNCATE ON TABLE public.user_profiles TO service_role;
-- [17] bpublicuser_profiles16482UPDATE
GRANT UPDATE ON TABLE public.user_profiles TO service_role;
-- [17] bpublicvehicle_catalogue_images16481DELETE
GRANT DELETE ON TABLE public.vehicle_catalogue_images TO authenticated;
-- [17] bpublicvehicle_catalogue_images16481INSERT
GRANT INSERT ON TABLE public.vehicle_catalogue_images TO authenticated;
-- [17] bpublicvehicle_catalogue_images16481MAINTAIN
GRANT MAINTAIN ON TABLE public.vehicle_catalogue_images TO authenticated;
-- [17] bpublicvehicle_catalogue_images16481REFERENCES
GRANT REFERENCES ON TABLE public.vehicle_catalogue_images TO authenticated;
-- [17] bpublicvehicle_catalogue_images16481SELECT
GRANT SELECT ON TABLE public.vehicle_catalogue_images TO authenticated;
-- [17] bpublicvehicle_catalogue_images16481TRIGGER
GRANT TRIGGER ON TABLE public.vehicle_catalogue_images TO authenticated;
-- [17] bpublicvehicle_catalogue_images16481TRUNCATE
GRANT TRUNCATE ON TABLE public.vehicle_catalogue_images TO authenticated;
-- [17] bpublicvehicle_catalogue_images16481UPDATE
GRANT UPDATE ON TABLE public.vehicle_catalogue_images TO authenticated;
-- [17] bpublicvehicle_catalogue_images16482DELETE
GRANT DELETE ON TABLE public.vehicle_catalogue_images TO service_role;
-- [17] bpublicvehicle_catalogue_images16482INSERT
GRANT INSERT ON TABLE public.vehicle_catalogue_images TO service_role;
-- [17] bpublicvehicle_catalogue_images16482MAINTAIN
GRANT MAINTAIN ON TABLE public.vehicle_catalogue_images TO service_role;
-- [17] bpublicvehicle_catalogue_images16482REFERENCES
GRANT REFERENCES ON TABLE public.vehicle_catalogue_images TO service_role;
-- [17] bpublicvehicle_catalogue_images16482SELECT
GRANT SELECT ON TABLE public.vehicle_catalogue_images TO service_role;
-- [17] bpublicvehicle_catalogue_images16482TRIGGER
GRANT TRIGGER ON TABLE public.vehicle_catalogue_images TO service_role;
-- [17] bpublicvehicle_catalogue_images16482TRUNCATE
GRANT TRUNCATE ON TABLE public.vehicle_catalogue_images TO service_role;
-- [17] bpublicvehicle_catalogue_images16482UPDATE
GRANT UPDATE ON TABLE public.vehicle_catalogue_images TO service_role;
-- [17] bpublicvehicle_make_aliases16481DELETE
GRANT DELETE ON TABLE public.vehicle_make_aliases TO authenticated;
-- [17] bpublicvehicle_make_aliases16481INSERT
GRANT INSERT ON TABLE public.vehicle_make_aliases TO authenticated;
-- [17] bpublicvehicle_make_aliases16481MAINTAIN
GRANT MAINTAIN ON TABLE public.vehicle_make_aliases TO authenticated;
-- [17] bpublicvehicle_make_aliases16481REFERENCES
GRANT REFERENCES ON TABLE public.vehicle_make_aliases TO authenticated;
-- [17] bpublicvehicle_make_aliases16481SELECT
GRANT SELECT ON TABLE public.vehicle_make_aliases TO authenticated;
-- [17] bpublicvehicle_make_aliases16481TRIGGER
GRANT TRIGGER ON TABLE public.vehicle_make_aliases TO authenticated;
-- [17] bpublicvehicle_make_aliases16481TRUNCATE
GRANT TRUNCATE ON TABLE public.vehicle_make_aliases TO authenticated;
-- [17] bpublicvehicle_make_aliases16481UPDATE
GRANT UPDATE ON TABLE public.vehicle_make_aliases TO authenticated;
-- [17] bpublicvehicle_make_aliases16482DELETE
GRANT DELETE ON TABLE public.vehicle_make_aliases TO service_role;
-- [17] bpublicvehicle_make_aliases16482INSERT
GRANT INSERT ON TABLE public.vehicle_make_aliases TO service_role;
-- [17] bpublicvehicle_make_aliases16482MAINTAIN
GRANT MAINTAIN ON TABLE public.vehicle_make_aliases TO service_role;
-- [17] bpublicvehicle_make_aliases16482REFERENCES
GRANT REFERENCES ON TABLE public.vehicle_make_aliases TO service_role;
-- [17] bpublicvehicle_make_aliases16482SELECT
GRANT SELECT ON TABLE public.vehicle_make_aliases TO service_role;
-- [17] bpublicvehicle_make_aliases16482TRIGGER
GRANT TRIGGER ON TABLE public.vehicle_make_aliases TO service_role;
-- [17] bpublicvehicle_make_aliases16482TRUNCATE
GRANT TRUNCATE ON TABLE public.vehicle_make_aliases TO service_role;
-- [17] bpublicvehicle_make_aliases16482UPDATE
GRANT UPDATE ON TABLE public.vehicle_make_aliases TO service_role;
-- [17] daxentra_private.on_digital_id_account_change()
REVOKE ALL ON FUNCTION axentra_private.on_digital_id_account_change() FROM PUBLIC, anon, authenticated, service_role;
-- [17] daxentra_private.on_digital_id_driver_change()
REVOKE ALL ON FUNCTION axentra_private.on_digital_id_driver_change() FROM PUBLIC, anon, authenticated, service_role;
-- [17] daxentra_private.sync_driver_digital_credential(p_user_id uuid)
REVOKE ALL ON FUNCTION axentra_private.sync_driver_digital_credential(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.abort_eligible_statuses()
REVOKE ALL ON FUNCTION public.abort_eligible_statuses() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.activate_user_account(p_target_user_id uuid)
REVOKE ALL ON FUNCTION public.activate_user_account(p_target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.allocate_credit_note_number(p_org_id uuid)
REVOKE ALL ON FUNCTION public.allocate_credit_note_number(p_org_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.allocate_invoice_number(p_org_id uuid)
REVOKE ALL ON FUNCTION public.allocate_invoice_number(p_org_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.amend_approved_job_abort_claim(p_abort_id uuid, p_new_a
REVOKE ALL ON FUNCTION public.amend_approved_job_abort_claim(p_abort_id uuid, p_new_amount numeric, p_reason text, p_expected_amount numeric, p_client_confirmed boolean) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.archive_driver_profile(p_target_user_id uuid, p_reason 
REVOKE ALL ON FUNCTION public.archive_driver_profile(p_target_user_id uuid, p_reason text, p_suspend_account boolean) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.audit_app_settings_change()
REVOKE ALL ON FUNCTION public.audit_app_settings_change() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.auto_link_job_to_client()
REVOKE ALL ON FUNCTION public.auto_link_job_to_client() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.can_actor_manage_permission(p_actor_user_id uuid, p_tar
REVOKE ALL ON FUNCTION public.can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.can_actor_manage_target_user(p_actor_user_id uuid, p_ta
REVOKE ALL ON FUNCTION public.can_actor_manage_target_user(p_actor_user_id uuid, p_target_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.cancel_invoice(p_invoice_id uuid, p_reason text)
REVOKE ALL ON FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.canonical_make(p text)
REVOKE ALL ON FUNCTION public.canonical_make(p text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.catalogue_refresh_jobs()
REVOKE ALL ON FUNCTION public.catalogue_refresh_jobs() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.complete_job(p_job_id uuid, p_notes text)
REVOKE ALL ON FUNCTION public.complete_job(p_job_id uuid, p_notes text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.confirm_job_abort(p_job_id uuid, p_contact_name text, p
REVOKE ALL ON FUNCTION public.confirm_job_abort(p_job_id uuid, p_contact_name text, p_no_name_exception boolean, p_expected_status text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.correct_invoiced_job_abort_fee(p_abort_id uuid, p_origi
REVOKE ALL ON FUNCTION public.correct_invoiced_job_abort_fee(p_abort_id uuid, p_original_invoice_id uuid, p_new_amount numeric, p_expected_amount numeric, p_reason text, p_client_confirmed boolean, p_multi_job_acknowledged boolean, p_paid_acknowledged boolean) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.create_abort_replacement_job(p_job_id uuid)
REVOKE ALL ON FUNCTION public.create_abort_replacement_job(p_job_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.current_actor_email()
REVOKE ALL ON FUNCTION public.current_actor_email() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.current_driver_profile_id()
REVOKE ALL ON FUNCTION public.current_driver_profile_id() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.current_user_has_permission(p_permission_key text)
REVOKE ALL ON FUNCTION public.current_user_has_permission(p_permission_key text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.delete_user_permission_override(p_target_user_id uuid, 
REVOKE ALL ON FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.delete_user_permission_override(p_target_user_id uuid, 
REVOKE ALL ON FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.dismiss_job_abort_request(p_request_id uuid, p_note tex
REVOKE ALL ON FUNCTION public.dismiss_job_abort_request(p_request_id uuid, p_note text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.driver_can_access_expense(p_expense_id text)
REVOKE ALL ON FUNCTION public.driver_can_access_expense(p_expense_id text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.driver_can_read_inspection_evidence(p_inspection_id uui
REVOKE ALL ON FUNCTION public.driver_can_read_inspection_evidence(p_inspection_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.driver_can_read_job_evidence(p_job_id uuid)
REVOKE ALL ON FUNCTION public.driver_can_read_job_evidence(p_job_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.driver_can_use_job_path(p_name text)
REVOKE ALL ON FUNCTION public.driver_can_use_job_path(p_name text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.driver_owns_job(p_job_id uuid)
REVOKE ALL ON FUNCTION public.driver_owns_job(p_job_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.enforce_completed_at_semantics()
REVOKE ALL ON FUNCTION public.enforce_completed_at_semantics() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.enqueue_customer_notification()
REVOKE ALL ON FUNCTION public.enqueue_customer_notification() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.expense_is_invoiced(p_expense_id uuid)
REVOKE ALL ON FUNCTION public.expense_is_invoiced(p_expense_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.get_driver_digital_id(p_user_id uuid)
REVOKE ALL ON FUNCTION public.get_driver_digital_id(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.get_vehicle_catalogue_image(p_make text, p_model text, 
REVOKE ALL ON FUNCTION public.get_vehicle_catalogue_image(p_make text, p_model text, p_year integer, p_colour text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.guard_abort_invoicing()
REVOKE ALL ON FUNCTION public.guard_abort_invoicing() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.guard_driver_digital_id_state()
REVOKE ALL ON FUNCTION public.guard_driver_digital_id_state() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.guard_job_abort_status()
REVOKE ALL ON FUNCTION public.guard_job_abort_status() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.guard_job_driver_writes()
REVOKE ALL ON FUNCTION public.guard_job_driver_writes() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.guard_one_live_invoice_per_job()
REVOKE ALL ON FUNCTION public.guard_one_live_invoice_per_job() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.guard_photo_identity_columns()
REVOKE ALL ON FUNCTION public.guard_photo_identity_columns() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.guard_user_profile_privileged_columns()
REVOKE ALL ON FUNCTION public.guard_user_profile_privileged_columns() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.handle_new_user()
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.inherit_is_test_from_job()
REVOKE ALL ON FUNCTION public.inherit_is_test_from_job() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.invoice_lines_guard_lifecycle()
REVOKE ALL ON FUNCTION public.invoice_lines_guard_lifecycle() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.invoices_guard_lifecycle()
REVOKE ALL ON FUNCTION public.invoices_guard_lifecycle() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.is_admin_or_super_admin()
REVOKE ALL ON FUNCTION public.is_admin_or_super_admin() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.is_protected_user(p_user_id uuid)
REVOKE ALL ON FUNCTION public.is_protected_user(p_user_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.is_super_admin()
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.job_current_run_id(p_job_id uuid)
REVOKE ALL ON FUNCTION public.job_current_run_id(p_job_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.jobs_set_catalogue_image()
REVOKE ALL ON FUNCTION public.jobs_set_catalogue_image() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.link_corrected_abort_invoice()
REVOKE ALL ON FUNCTION public.link_corrected_abort_invoice() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)
REVOKE ALL ON FUNCTION public.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.link_photo_to_inspection_on_insert()
REVOKE ALL ON FUNCTION public.link_photo_to_inspection_on_insert() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.link_photo_to_inspection_on_update()
REVOKE ALL ON FUNCTION public.link_photo_to_inspection_on_update() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.link_unlinked_photos_to_inspection(p_job_id uuid, p_org
REVOKE ALL ON FUNCTION public.link_unlinked_photos_to_inspection(p_job_id uuid, p_org_id uuid, p_inspection_type text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.next_job_number()
REVOKE ALL ON FUNCTION public.next_job_number() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.normalize_client_name(input text)
REVOKE ALL ON FUNCTION public.normalize_client_name(input text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.notify_customer_job_aborted(p_abort_id uuid)
REVOKE ALL ON FUNCTION public.notify_customer_job_aborted(p_abort_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.portal_can_read_invoice_pdf(p_object_name text)
REVOKE ALL ON FUNCTION public.portal_can_read_invoice_pdf(p_object_name text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.portal_client_id()
REVOKE ALL ON FUNCTION public.portal_client_id() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.portal_context()
REVOKE ALL ON FUNCTION public.portal_context() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.portal_get_invoice(p_invoice_id uuid)
REVOKE ALL ON FUNCTION public.portal_get_invoice(p_invoice_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.portal_get_job(p_job_id uuid)
REVOKE ALL ON FUNCTION public.portal_get_job(p_job_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.portal_list_invoices()
REVOKE ALL ON FUNCTION public.portal_list_invoices() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.portal_list_jobs()
REVOKE ALL ON FUNCTION public.portal_list_jobs() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.qr_confirm(p_token text, p_customer_name text, p_notes 
REVOKE ALL ON FUNCTION public.qr_confirm(p_token text, p_customer_name text, p_notes text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.qr_lookup(p_token text)
REVOKE ALL ON FUNCTION public.qr_lookup(p_token text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.reopen_job(p_job_id uuid, p_notes text)
REVOKE ALL ON FUNCTION public.reopen_job(p_job_id uuid, p_notes text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.request_job_abort(p_job_id uuid)
REVOKE ALL ON FUNCTION public.request_job_abort(p_job_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.resolve_catalogue_image(p_make text, p_model text, p_ye
REVOKE ALL ON FUNCTION public.resolve_catalogue_image(p_make text, p_model text, p_year text, p_colour text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.restore_driver_profile(p_target_user_id uuid, p_restore
REVOKE ALL ON FUNCTION public.restore_driver_profile(p_target_user_id uuid, p_restore_note text, p_reactivate_account boolean) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.review_job_abort_claim(p_abort_id uuid, p_decision text
REVOKE ALL ON FUNCTION public.review_job_abort_claim(p_abort_id uuid, p_decision text, p_amount numeric, p_note text, p_client_confirmed boolean) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.role_rank(p_role text)
REVOKE ALL ON FUNCTION public.role_rank(p_role text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.rollback_inspection_submission(p_job_id uuid, p_submiss
REVOKE ALL ON FUNCTION public.rollback_inspection_submission(p_job_id uuid, p_submission_session_id uuid, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.same_org_as_target(target_org_id uuid)
REVOKE ALL ON FUNCTION public.same_org_as_target(target_org_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.set_driver_digital_id_photo(p_user_id uuid, p_photo_pat
REVOKE ALL ON FUNCTION public.set_driver_digital_id_photo(p_user_id uuid, p_photo_path text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.set_evidence_org_from_job()
REVOKE ALL ON FUNCTION public.set_evidence_org_from_job() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.set_photo_org_from_job()
REVOKE ALL ON FUNCTION public.set_photo_org_from_job() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.set_updated_at()
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.stamp_client_log_identity()
REVOKE ALL ON FUNCTION public.stamp_client_log_identity() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.submit_inspection(p_job_id uuid, p_type text, p_inspect
REVOKE ALL ON FUNCTION public.submit_inspection(p_job_id uuid, p_type text, p_inspection jsonb, p_damage_items jsonb, p_submission_session_id uuid) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.super_admin_override_job_status(p_job_id uuid, p_new_st
REVOKE ALL ON FUNCTION public.super_admin_override_job_status(p_job_id uuid, p_new_status text, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.suspend_user_account(p_target_user_id uuid, p_reason te
REVOKE ALL ON FUNCTION public.suspend_user_account(p_target_user_id uuid, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.sync_damage_photo_url()
REVOKE ALL ON FUNCTION public.sync_damage_photo_url() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.touch_evidence_updated_at()
REVOKE ALL ON FUNCTION public.touch_evidence_updated_at() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.trg_inspections_link_photos()
REVOKE ALL ON FUNCTION public.trg_inspections_link_photos() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.update_updated_at_column()
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.upsert_user_permission_override(p_target_user_id uuid, 
REVOKE ALL ON FUNCTION public.upsert_user_permission_override(p_target_user_id uuid, p_permission_key text, p_grant_type text, p_reason text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.user_account_status()
REVOKE ALL ON FUNCTION public.user_account_status() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.user_has_permission(p_user_id uuid, p_permission_key te
REVOKE ALL ON FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.user_org_id()
REVOKE ALL ON FUNCTION public.user_org_id() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.user_profiles_sync_full_name()
REVOKE ALL ON FUNCTION public.user_profiles_sync_full_name() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.user_role()
REVOKE ALL ON FUNCTION public.user_role() FROM PUBLIC, anon, authenticated, service_role;
-- [17] dpublic.vehicle_name_norm(p text)
REVOKE ALL ON FUNCTION public.vehicle_name_norm(p text) FROM PUBLIC, anon, authenticated, service_role;
-- [17] epublic.abort_eligible_statuses()0
GRANT EXECUTE ON FUNCTION public.abort_eligible_statuses() TO PUBLIC;
-- [17] epublic.abort_eligible_statuses()16480
GRANT EXECUTE ON FUNCTION public.abort_eligible_statuses() TO anon;
-- [17] epublic.abort_eligible_statuses()16481
GRANT EXECUTE ON FUNCTION public.abort_eligible_statuses() TO authenticated;
-- [17] epublic.abort_eligible_statuses()16482
GRANT EXECUTE ON FUNCTION public.abort_eligible_statuses() TO service_role;
-- [17] epublic.activate_user_account(p_target_user_id uuid)16482
GRANT EXECUTE ON FUNCTION public.activate_user_account(p_target_user_id uuid) TO service_role;
-- [17] epublic.allocate_credit_note_number(p_org_id uuid)16481
GRANT EXECUTE ON FUNCTION public.allocate_credit_note_number(p_org_id uuid) TO authenticated;
-- [17] epublic.allocate_credit_note_number(p_org_id uuid)16482
GRANT EXECUTE ON FUNCTION public.allocate_credit_note_number(p_org_id uuid) TO service_role;
-- [17] epublic.allocate_invoice_number(p_org_id uuid)16481
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(p_org_id uuid) TO authenticated;
-- [17] epublic.allocate_invoice_number(p_org_id uuid)16482
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(p_org_id uuid) TO service_role;
-- [17] epublic.amend_approved_job_abort_claim(p_abort_id uuid, p_new_a
GRANT EXECUTE ON FUNCTION public.amend_approved_job_abort_claim(p_abort_id uuid, p_new_amount numeric, p_reason text, p_expected_amount numeric, p_client_confirmed boolean) TO authenticated;
-- [17] epublic.amend_approved_job_abort_claim(p_abort_id uuid, p_new_a
GRANT EXECUTE ON FUNCTION public.amend_approved_job_abort_claim(p_abort_id uuid, p_new_amount numeric, p_reason text, p_expected_amount numeric, p_client_confirmed boolean) TO service_role;
-- [17] epublic.archive_driver_profile(p_target_user_id uuid, p_reason 
GRANT EXECUTE ON FUNCTION public.archive_driver_profile(p_target_user_id uuid, p_reason text, p_suspend_account boolean) TO service_role;
-- [17] epublic.audit_app_settings_change()16482
GRANT EXECUTE ON FUNCTION public.audit_app_settings_change() TO service_role;
-- [17] epublic.auto_link_job_to_client()0
GRANT EXECUTE ON FUNCTION public.auto_link_job_to_client() TO PUBLIC;
-- [17] epublic.auto_link_job_to_client()16480
GRANT EXECUTE ON FUNCTION public.auto_link_job_to_client() TO anon;
-- [17] epublic.auto_link_job_to_client()16481
GRANT EXECUTE ON FUNCTION public.auto_link_job_to_client() TO authenticated;
-- [17] epublic.auto_link_job_to_client()16482
GRANT EXECUTE ON FUNCTION public.auto_link_job_to_client() TO service_role;
-- [17] epublic.can_actor_manage_permission(p_actor_user_id uuid, p_tar
GRANT EXECUTE ON FUNCTION public.can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text) TO service_role;
-- [17] epublic.can_actor_manage_target_user(p_actor_user_id uuid, p_ta
GRANT EXECUTE ON FUNCTION public.can_actor_manage_target_user(p_actor_user_id uuid, p_target_user_id uuid) TO service_role;
-- [17] epublic.cancel_invoice(p_invoice_id uuid, p_reason text)16481
GRANT EXECUTE ON FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text) TO authenticated;
-- [17] epublic.cancel_invoice(p_invoice_id uuid, p_reason text)16482
GRANT EXECUTE ON FUNCTION public.cancel_invoice(p_invoice_id uuid, p_reason text) TO service_role;
-- [17] epublic.canonical_make(p text)16481
GRANT EXECUTE ON FUNCTION public.canonical_make(p text) TO authenticated;
-- [17] epublic.canonical_make(p text)16482
GRANT EXECUTE ON FUNCTION public.canonical_make(p text) TO service_role;
-- [17] epublic.catalogue_refresh_jobs()16482
GRANT EXECUTE ON FUNCTION public.catalogue_refresh_jobs() TO service_role;
-- [17] epublic.complete_job(p_job_id uuid, p_notes text)0
GRANT EXECUTE ON FUNCTION public.complete_job(p_job_id uuid, p_notes text) TO PUBLIC;
-- [17] epublic.complete_job(p_job_id uuid, p_notes text)16480
GRANT EXECUTE ON FUNCTION public.complete_job(p_job_id uuid, p_notes text) TO anon;
-- [17] epublic.complete_job(p_job_id uuid, p_notes text)16481
GRANT EXECUTE ON FUNCTION public.complete_job(p_job_id uuid, p_notes text) TO authenticated;
-- [17] epublic.complete_job(p_job_id uuid, p_notes text)16482
GRANT EXECUTE ON FUNCTION public.complete_job(p_job_id uuid, p_notes text) TO service_role;
-- [17] epublic.confirm_job_abort(p_job_id uuid, p_contact_name text, p
GRANT EXECUTE ON FUNCTION public.confirm_job_abort(p_job_id uuid, p_contact_name text, p_no_name_exception boolean, p_expected_status text) TO authenticated;
-- [17] epublic.confirm_job_abort(p_job_id uuid, p_contact_name text, p
GRANT EXECUTE ON FUNCTION public.confirm_job_abort(p_job_id uuid, p_contact_name text, p_no_name_exception boolean, p_expected_status text) TO service_role;
-- [17] epublic.correct_invoiced_job_abort_fee(p_abort_id uuid, p_origi
GRANT EXECUTE ON FUNCTION public.correct_invoiced_job_abort_fee(p_abort_id uuid, p_original_invoice_id uuid, p_new_amount numeric, p_expected_amount numeric, p_reason text, p_client_confirmed boolean, p_multi_job_acknowledged boolean, p_paid_acknowledged boolean) TO authenticated;
-- [17] epublic.correct_invoiced_job_abort_fee(p_abort_id uuid, p_origi
GRANT EXECUTE ON FUNCTION public.correct_invoiced_job_abort_fee(p_abort_id uuid, p_original_invoice_id uuid, p_new_amount numeric, p_expected_amount numeric, p_reason text, p_client_confirmed boolean, p_multi_job_acknowledged boolean, p_paid_acknowledged boolean) TO service_role;
-- [17] epublic.create_abort_replacement_job(p_job_id uuid)16481
GRANT EXECUTE ON FUNCTION public.create_abort_replacement_job(p_job_id uuid) TO authenticated;
-- [17] epublic.create_abort_replacement_job(p_job_id uuid)16482
GRANT EXECUTE ON FUNCTION public.create_abort_replacement_job(p_job_id uuid) TO service_role;
-- [17] epublic.current_actor_email()0
GRANT EXECUTE ON FUNCTION public.current_actor_email() TO PUBLIC;
-- [17] epublic.current_actor_email()16480
GRANT EXECUTE ON FUNCTION public.current_actor_email() TO anon;
-- [17] epublic.current_actor_email()16481
GRANT EXECUTE ON FUNCTION public.current_actor_email() TO authenticated;
-- [17] epublic.current_actor_email()16482
GRANT EXECUTE ON FUNCTION public.current_actor_email() TO service_role;
-- [17] epublic.current_driver_profile_id()16481
GRANT EXECUTE ON FUNCTION public.current_driver_profile_id() TO authenticated;
-- [17] epublic.current_driver_profile_id()16482
GRANT EXECUTE ON FUNCTION public.current_driver_profile_id() TO service_role;
-- [17] epublic.current_user_has_permission(p_permission_key text)0
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(p_permission_key text) TO PUBLIC;
-- [17] epublic.current_user_has_permission(p_permission_key text)16480
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(p_permission_key text) TO anon;
-- [17] epublic.current_user_has_permission(p_permission_key text)16481
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(p_permission_key text) TO authenticated;
-- [17] epublic.current_user_has_permission(p_permission_key text)16482
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(p_permission_key text) TO service_role;
-- [17] epublic.delete_user_permission_override(p_target_user_id uuid, 
GRANT EXECUTE ON FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text) TO service_role;
-- [17] epublic.delete_user_permission_override(p_target_user_id uuid, 
GRANT EXECUTE ON FUNCTION public.delete_user_permission_override(p_target_user_id uuid, p_permission_key text, p_reason text) TO service_role;
-- [17] epublic.dismiss_job_abort_request(p_request_id uuid, p_note tex
GRANT EXECUTE ON FUNCTION public.dismiss_job_abort_request(p_request_id uuid, p_note text) TO authenticated;
-- [17] epublic.dismiss_job_abort_request(p_request_id uuid, p_note tex
GRANT EXECUTE ON FUNCTION public.dismiss_job_abort_request(p_request_id uuid, p_note text) TO service_role;
-- [17] epublic.driver_can_access_expense(p_expense_id text)16481
GRANT EXECUTE ON FUNCTION public.driver_can_access_expense(p_expense_id text) TO authenticated;
-- [17] epublic.driver_can_access_expense(p_expense_id text)16482
GRANT EXECUTE ON FUNCTION public.driver_can_access_expense(p_expense_id text) TO service_role;
-- [17] epublic.driver_can_read_inspection_evidence(p_inspection_id uui
GRANT EXECUTE ON FUNCTION public.driver_can_read_inspection_evidence(p_inspection_id uuid) TO authenticated;
-- [17] epublic.driver_can_read_inspection_evidence(p_inspection_id uui
GRANT EXECUTE ON FUNCTION public.driver_can_read_inspection_evidence(p_inspection_id uuid) TO service_role;
-- [17] epublic.driver_can_read_job_evidence(p_job_id uuid)16481
GRANT EXECUTE ON FUNCTION public.driver_can_read_job_evidence(p_job_id uuid) TO authenticated;
-- [17] epublic.driver_can_read_job_evidence(p_job_id uuid)16482
GRANT EXECUTE ON FUNCTION public.driver_can_read_job_evidence(p_job_id uuid) TO service_role;
-- [17] epublic.driver_can_use_job_path(p_name text)16481
GRANT EXECUTE ON FUNCTION public.driver_can_use_job_path(p_name text) TO authenticated;
-- [17] epublic.driver_can_use_job_path(p_name text)16482
GRANT EXECUTE ON FUNCTION public.driver_can_use_job_path(p_name text) TO service_role;
-- [17] epublic.driver_owns_job(p_job_id uuid)16481
GRANT EXECUTE ON FUNCTION public.driver_owns_job(p_job_id uuid) TO authenticated;
-- [17] epublic.driver_owns_job(p_job_id uuid)16482
GRANT EXECUTE ON FUNCTION public.driver_owns_job(p_job_id uuid) TO service_role;
-- [17] epublic.enforce_completed_at_semantics()0
GRANT EXECUTE ON FUNCTION public.enforce_completed_at_semantics() TO PUBLIC;
-- [17] epublic.enforce_completed_at_semantics()16480
GRANT EXECUTE ON FUNCTION public.enforce_completed_at_semantics() TO anon;
-- [17] epublic.enforce_completed_at_semantics()16481
GRANT EXECUTE ON FUNCTION public.enforce_completed_at_semantics() TO authenticated;
-- [17] epublic.enforce_completed_at_semantics()16482
GRANT EXECUTE ON FUNCTION public.enforce_completed_at_semantics() TO service_role;
-- [17] epublic.enqueue_customer_notification()16482
GRANT EXECUTE ON FUNCTION public.enqueue_customer_notification() TO service_role;
-- [17] epublic.expense_is_invoiced(p_expense_id uuid)16481
GRANT EXECUTE ON FUNCTION public.expense_is_invoiced(p_expense_id uuid) TO authenticated;
-- [17] epublic.expense_is_invoiced(p_expense_id uuid)16482
GRANT EXECUTE ON FUNCTION public.expense_is_invoiced(p_expense_id uuid) TO service_role;
-- [17] epublic.get_driver_digital_id(p_user_id uuid)16481
GRANT EXECUTE ON FUNCTION public.get_driver_digital_id(p_user_id uuid) TO authenticated;
-- [17] epublic.get_driver_digital_id(p_user_id uuid)16482
GRANT EXECUTE ON FUNCTION public.get_driver_digital_id(p_user_id uuid) TO service_role;
-- [17] epublic.get_vehicle_catalogue_image(p_make text, p_model text, 
GRANT EXECUTE ON FUNCTION public.get_vehicle_catalogue_image(p_make text, p_model text, p_year integer, p_colour text) TO authenticated;
-- [17] epublic.get_vehicle_catalogue_image(p_make text, p_model text, 
GRANT EXECUTE ON FUNCTION public.get_vehicle_catalogue_image(p_make text, p_model text, p_year integer, p_colour text) TO service_role;
-- [17] epublic.guard_abort_invoicing()16482
GRANT EXECUTE ON FUNCTION public.guard_abort_invoicing() TO service_role;
-- [17] epublic.guard_driver_digital_id_state()16482
GRANT EXECUTE ON FUNCTION public.guard_driver_digital_id_state() TO service_role;
-- [17] epublic.guard_job_abort_status()16482
GRANT EXECUTE ON FUNCTION public.guard_job_abort_status() TO service_role;
-- [17] epublic.guard_job_driver_writes()16482
GRANT EXECUTE ON FUNCTION public.guard_job_driver_writes() TO service_role;
-- [17] epublic.guard_one_live_invoice_per_job()16482
GRANT EXECUTE ON FUNCTION public.guard_one_live_invoice_per_job() TO service_role;
-- [17] epublic.guard_photo_identity_columns()16482
GRANT EXECUTE ON FUNCTION public.guard_photo_identity_columns() TO service_role;
-- [17] epublic.guard_user_profile_privileged_columns()16482
GRANT EXECUTE ON FUNCTION public.guard_user_profile_privileged_columns() TO service_role;
-- [17] epublic.handle_new_user()16482
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
-- [17] epublic.inherit_is_test_from_job()16482
GRANT EXECUTE ON FUNCTION public.inherit_is_test_from_job() TO service_role;
-- [17] epublic.invoice_lines_guard_lifecycle()0
GRANT EXECUTE ON FUNCTION public.invoice_lines_guard_lifecycle() TO PUBLIC;
-- [17] epublic.invoice_lines_guard_lifecycle()16480
GRANT EXECUTE ON FUNCTION public.invoice_lines_guard_lifecycle() TO anon;
-- [17] epublic.invoice_lines_guard_lifecycle()16481
GRANT EXECUTE ON FUNCTION public.invoice_lines_guard_lifecycle() TO authenticated;
-- [17] epublic.invoice_lines_guard_lifecycle()16482
GRANT EXECUTE ON FUNCTION public.invoice_lines_guard_lifecycle() TO service_role;
-- [17] epublic.invoices_guard_lifecycle()0
GRANT EXECUTE ON FUNCTION public.invoices_guard_lifecycle() TO PUBLIC;
-- [17] epublic.invoices_guard_lifecycle()16480
GRANT EXECUTE ON FUNCTION public.invoices_guard_lifecycle() TO anon;
-- [17] epublic.invoices_guard_lifecycle()16481
GRANT EXECUTE ON FUNCTION public.invoices_guard_lifecycle() TO authenticated;
-- [17] epublic.invoices_guard_lifecycle()16482
GRANT EXECUTE ON FUNCTION public.invoices_guard_lifecycle() TO service_role;
-- [17] epublic.is_admin_or_super_admin()16481
GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin() TO authenticated;
-- [17] epublic.is_admin_or_super_admin()16482
GRANT EXECUTE ON FUNCTION public.is_admin_or_super_admin() TO service_role;
-- [17] epublic.is_protected_user(p_user_id uuid)0
GRANT EXECUTE ON FUNCTION public.is_protected_user(p_user_id uuid) TO PUBLIC;
-- [17] epublic.is_protected_user(p_user_id uuid)16480
GRANT EXECUTE ON FUNCTION public.is_protected_user(p_user_id uuid) TO anon;
-- [17] epublic.is_protected_user(p_user_id uuid)16481
GRANT EXECUTE ON FUNCTION public.is_protected_user(p_user_id uuid) TO authenticated;
-- [17] epublic.is_protected_user(p_user_id uuid)16482
GRANT EXECUTE ON FUNCTION public.is_protected_user(p_user_id uuid) TO service_role;
-- [17] epublic.is_super_admin()16481
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
-- [17] epublic.is_super_admin()16482
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;
-- [17] epublic.job_current_run_id(p_job_id uuid)0
GRANT EXECUTE ON FUNCTION public.job_current_run_id(p_job_id uuid) TO PUBLIC;
-- [17] epublic.job_current_run_id(p_job_id uuid)16480
GRANT EXECUTE ON FUNCTION public.job_current_run_id(p_job_id uuid) TO anon;
-- [17] epublic.job_current_run_id(p_job_id uuid)16481
GRANT EXECUTE ON FUNCTION public.job_current_run_id(p_job_id uuid) TO authenticated;
-- [17] epublic.job_current_run_id(p_job_id uuid)16482
GRANT EXECUTE ON FUNCTION public.job_current_run_id(p_job_id uuid) TO service_role;
-- [17] epublic.jobs_set_catalogue_image()16482
GRANT EXECUTE ON FUNCTION public.jobs_set_catalogue_image() TO service_role;
-- [17] epublic.link_corrected_abort_invoice()16482
GRANT EXECUTE ON FUNCTION public.link_corrected_abort_invoice() TO service_role;
-- [17] epublic.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)
GRANT EXECUTE ON FUNCTION public.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid) TO PUBLIC;
-- [17] epublic.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)
GRANT EXECUTE ON FUNCTION public.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid) TO anon;
-- [17] epublic.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)
GRANT EXECUTE ON FUNCTION public.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid) TO authenticated;
-- [17] epublic.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)
GRANT EXECUTE ON FUNCTION public.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid) TO service_role;
-- [17] epublic.link_photo_to_inspection_on_insert()16482
GRANT EXECUTE ON FUNCTION public.link_photo_to_inspection_on_insert() TO service_role;
-- [17] epublic.link_photo_to_inspection_on_update()16482
GRANT EXECUTE ON FUNCTION public.link_photo_to_inspection_on_update() TO service_role;
-- [17] epublic.link_unlinked_photos_to_inspection(p_job_id uuid, p_org
GRANT EXECUTE ON FUNCTION public.link_unlinked_photos_to_inspection(p_job_id uuid, p_org_id uuid, p_inspection_type text) TO service_role;
-- [17] epublic.next_job_number()16481
GRANT EXECUTE ON FUNCTION public.next_job_number() TO authenticated;
-- [17] epublic.next_job_number()16482
GRANT EXECUTE ON FUNCTION public.next_job_number() TO service_role;
-- [17] epublic.normalize_client_name(input text)0
GRANT EXECUTE ON FUNCTION public.normalize_client_name(input text) TO PUBLIC;
-- [17] epublic.normalize_client_name(input text)16480
GRANT EXECUTE ON FUNCTION public.normalize_client_name(input text) TO anon;
-- [17] epublic.normalize_client_name(input text)16481
GRANT EXECUTE ON FUNCTION public.normalize_client_name(input text) TO authenticated;
-- [17] epublic.normalize_client_name(input text)16482
GRANT EXECUTE ON FUNCTION public.normalize_client_name(input text) TO service_role;
-- [17] epublic.notify_customer_job_aborted(p_abort_id uuid)16481
GRANT EXECUTE ON FUNCTION public.notify_customer_job_aborted(p_abort_id uuid) TO authenticated;
-- [17] epublic.notify_customer_job_aborted(p_abort_id uuid)16482
GRANT EXECUTE ON FUNCTION public.notify_customer_job_aborted(p_abort_id uuid) TO service_role;
-- [17] epublic.portal_can_read_invoice_pdf(p_object_name text)16481
GRANT EXECUTE ON FUNCTION public.portal_can_read_invoice_pdf(p_object_name text) TO authenticated;
-- [17] epublic.portal_can_read_invoice_pdf(p_object_name text)16482
GRANT EXECUTE ON FUNCTION public.portal_can_read_invoice_pdf(p_object_name text) TO service_role;
-- [17] epublic.portal_client_id()16482
GRANT EXECUTE ON FUNCTION public.portal_client_id() TO service_role;
-- [17] epublic.portal_context()16481
GRANT EXECUTE ON FUNCTION public.portal_context() TO authenticated;
-- [17] epublic.portal_context()16482
GRANT EXECUTE ON FUNCTION public.portal_context() TO service_role;
-- [17] epublic.portal_get_invoice(p_invoice_id uuid)16481
GRANT EXECUTE ON FUNCTION public.portal_get_invoice(p_invoice_id uuid) TO authenticated;
-- [17] epublic.portal_get_invoice(p_invoice_id uuid)16482
GRANT EXECUTE ON FUNCTION public.portal_get_invoice(p_invoice_id uuid) TO service_role;
-- [17] epublic.portal_get_job(p_job_id uuid)16481
GRANT EXECUTE ON FUNCTION public.portal_get_job(p_job_id uuid) TO authenticated;
-- [17] epublic.portal_get_job(p_job_id uuid)16482
GRANT EXECUTE ON FUNCTION public.portal_get_job(p_job_id uuid) TO service_role;
-- [17] epublic.portal_list_invoices()16481
GRANT EXECUTE ON FUNCTION public.portal_list_invoices() TO authenticated;
-- [17] epublic.portal_list_invoices()16482
GRANT EXECUTE ON FUNCTION public.portal_list_invoices() TO service_role;
-- [17] epublic.portal_list_jobs()16481
GRANT EXECUTE ON FUNCTION public.portal_list_jobs() TO authenticated;
-- [17] epublic.portal_list_jobs()16482
GRANT EXECUTE ON FUNCTION public.portal_list_jobs() TO service_role;
-- [17] epublic.qr_confirm(p_token text, p_customer_name text, p_notes 
GRANT EXECUTE ON FUNCTION public.qr_confirm(p_token text, p_customer_name text, p_notes text) TO anon;
-- [17] epublic.qr_confirm(p_token text, p_customer_name text, p_notes 
GRANT EXECUTE ON FUNCTION public.qr_confirm(p_token text, p_customer_name text, p_notes text) TO authenticated;
-- [17] epublic.qr_confirm(p_token text, p_customer_name text, p_notes 
GRANT EXECUTE ON FUNCTION public.qr_confirm(p_token text, p_customer_name text, p_notes text) TO service_role;
-- [17] epublic.qr_lookup(p_token text)16480
GRANT EXECUTE ON FUNCTION public.qr_lookup(p_token text) TO anon;
-- [17] epublic.qr_lookup(p_token text)16481
GRANT EXECUTE ON FUNCTION public.qr_lookup(p_token text) TO authenticated;
-- [17] epublic.qr_lookup(p_token text)16482
GRANT EXECUTE ON FUNCTION public.qr_lookup(p_token text) TO service_role;
-- [17] epublic.reopen_job(p_job_id uuid, p_notes text)16481
GRANT EXECUTE ON FUNCTION public.reopen_job(p_job_id uuid, p_notes text) TO authenticated;
-- [17] epublic.reopen_job(p_job_id uuid, p_notes text)16482
GRANT EXECUTE ON FUNCTION public.reopen_job(p_job_id uuid, p_notes text) TO service_role;
-- [17] epublic.request_job_abort(p_job_id uuid)16481
GRANT EXECUTE ON FUNCTION public.request_job_abort(p_job_id uuid) TO authenticated;
-- [17] epublic.request_job_abort(p_job_id uuid)16482
GRANT EXECUTE ON FUNCTION public.request_job_abort(p_job_id uuid) TO service_role;
-- [17] epublic.resolve_catalogue_image(p_make text, p_model text, p_ye
GRANT EXECUTE ON FUNCTION public.resolve_catalogue_image(p_make text, p_model text, p_year text, p_colour text) TO authenticated;
-- [17] epublic.resolve_catalogue_image(p_make text, p_model text, p_ye
GRANT EXECUTE ON FUNCTION public.resolve_catalogue_image(p_make text, p_model text, p_year text, p_colour text) TO service_role;
-- [17] epublic.restore_driver_profile(p_target_user_id uuid, p_restore
GRANT EXECUTE ON FUNCTION public.restore_driver_profile(p_target_user_id uuid, p_restore_note text, p_reactivate_account boolean) TO service_role;
-- [17] epublic.review_job_abort_claim(p_abort_id uuid, p_decision text
GRANT EXECUTE ON FUNCTION public.review_job_abort_claim(p_abort_id uuid, p_decision text, p_amount numeric, p_note text, p_client_confirmed boolean) TO authenticated;
-- [17] epublic.review_job_abort_claim(p_abort_id uuid, p_decision text
GRANT EXECUTE ON FUNCTION public.review_job_abort_claim(p_abort_id uuid, p_decision text, p_amount numeric, p_note text, p_client_confirmed boolean) TO service_role;
-- [17] epublic.role_rank(p_role text)0
GRANT EXECUTE ON FUNCTION public.role_rank(p_role text) TO PUBLIC;
-- [17] epublic.role_rank(p_role text)16480
GRANT EXECUTE ON FUNCTION public.role_rank(p_role text) TO anon;
-- [17] epublic.role_rank(p_role text)16481
GRANT EXECUTE ON FUNCTION public.role_rank(p_role text) TO authenticated;
-- [17] epublic.role_rank(p_role text)16482
GRANT EXECUTE ON FUNCTION public.role_rank(p_role text) TO service_role;
-- [17] epublic.rollback_inspection_submission(p_job_id uuid, p_submiss
GRANT EXECUTE ON FUNCTION public.rollback_inspection_submission(p_job_id uuid, p_submission_session_id uuid, p_reason text) TO PUBLIC;
-- [17] epublic.rollback_inspection_submission(p_job_id uuid, p_submiss
GRANT EXECUTE ON FUNCTION public.rollback_inspection_submission(p_job_id uuid, p_submission_session_id uuid, p_reason text) TO anon;
-- [17] epublic.rollback_inspection_submission(p_job_id uuid, p_submiss
GRANT EXECUTE ON FUNCTION public.rollback_inspection_submission(p_job_id uuid, p_submission_session_id uuid, p_reason text) TO authenticated;
-- [17] epublic.rollback_inspection_submission(p_job_id uuid, p_submiss
GRANT EXECUTE ON FUNCTION public.rollback_inspection_submission(p_job_id uuid, p_submission_session_id uuid, p_reason text) TO service_role;
-- [17] epublic.same_org_as_target(target_org_id uuid)16482
GRANT EXECUTE ON FUNCTION public.same_org_as_target(target_org_id uuid) TO service_role;
-- [17] epublic.set_driver_digital_id_photo(p_user_id uuid, p_photo_pat
GRANT EXECUTE ON FUNCTION public.set_driver_digital_id_photo(p_user_id uuid, p_photo_path text) TO authenticated;
-- [17] epublic.set_driver_digital_id_photo(p_user_id uuid, p_photo_pat
GRANT EXECUTE ON FUNCTION public.set_driver_digital_id_photo(p_user_id uuid, p_photo_path text) TO service_role;
-- [17] epublic.set_evidence_org_from_job()16482
GRANT EXECUTE ON FUNCTION public.set_evidence_org_from_job() TO service_role;
-- [17] epublic.set_photo_org_from_job()16482
GRANT EXECUTE ON FUNCTION public.set_photo_org_from_job() TO service_role;
-- [17] epublic.set_updated_at()0
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC;
-- [17] epublic.set_updated_at()16480
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon;
-- [17] epublic.set_updated_at()16481
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
-- [17] epublic.set_updated_at()16482
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
-- [17] epublic.stamp_client_log_identity()0
GRANT EXECUTE ON FUNCTION public.stamp_client_log_identity() TO PUBLIC;
-- [17] epublic.stamp_client_log_identity()16480
GRANT EXECUTE ON FUNCTION public.stamp_client_log_identity() TO anon;
-- [17] epublic.stamp_client_log_identity()16481
GRANT EXECUTE ON FUNCTION public.stamp_client_log_identity() TO authenticated;
-- [17] epublic.stamp_client_log_identity()16482
GRANT EXECUTE ON FUNCTION public.stamp_client_log_identity() TO service_role;
-- [17] epublic.submit_inspection(p_job_id uuid, p_type text, p_inspect
GRANT EXECUTE ON FUNCTION public.submit_inspection(p_job_id uuid, p_type text, p_inspection jsonb, p_damage_items jsonb, p_submission_session_id uuid) TO PUBLIC;
-- [17] epublic.submit_inspection(p_job_id uuid, p_type text, p_inspect
GRANT EXECUTE ON FUNCTION public.submit_inspection(p_job_id uuid, p_type text, p_inspection jsonb, p_damage_items jsonb, p_submission_session_id uuid) TO anon;
-- [17] epublic.submit_inspection(p_job_id uuid, p_type text, p_inspect
GRANT EXECUTE ON FUNCTION public.submit_inspection(p_job_id uuid, p_type text, p_inspection jsonb, p_damage_items jsonb, p_submission_session_id uuid) TO authenticated;
-- [17] epublic.submit_inspection(p_job_id uuid, p_type text, p_inspect
GRANT EXECUTE ON FUNCTION public.submit_inspection(p_job_id uuid, p_type text, p_inspection jsonb, p_damage_items jsonb, p_submission_session_id uuid) TO service_role;
-- [17] epublic.super_admin_override_job_status(p_job_id uuid, p_new_st
GRANT EXECUTE ON FUNCTION public.super_admin_override_job_status(p_job_id uuid, p_new_status text, p_reason text) TO authenticated;
-- [17] epublic.super_admin_override_job_status(p_job_id uuid, p_new_st
GRANT EXECUTE ON FUNCTION public.super_admin_override_job_status(p_job_id uuid, p_new_status text, p_reason text) TO service_role;
-- [17] epublic.suspend_user_account(p_target_user_id uuid, p_reason te
GRANT EXECUTE ON FUNCTION public.suspend_user_account(p_target_user_id uuid, p_reason text) TO service_role;
-- [17] epublic.sync_damage_photo_url()16482
GRANT EXECUTE ON FUNCTION public.sync_damage_photo_url() TO service_role;
-- [17] epublic.touch_evidence_updated_at()0
GRANT EXECUTE ON FUNCTION public.touch_evidence_updated_at() TO PUBLIC;
-- [17] epublic.touch_evidence_updated_at()16480
GRANT EXECUTE ON FUNCTION public.touch_evidence_updated_at() TO anon;
-- [17] epublic.touch_evidence_updated_at()16481
GRANT EXECUTE ON FUNCTION public.touch_evidence_updated_at() TO authenticated;
-- [17] epublic.touch_evidence_updated_at()16482
GRANT EXECUTE ON FUNCTION public.touch_evidence_updated_at() TO service_role;
-- [17] epublic.trg_inspections_link_photos()16482
GRANT EXECUTE ON FUNCTION public.trg_inspections_link_photos() TO service_role;
-- [17] epublic.update_updated_at_column()0
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO PUBLIC;
-- [17] epublic.update_updated_at_column()16480
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO anon;
-- [17] epublic.update_updated_at_column()16481
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
-- [17] epublic.update_updated_at_column()16482
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;
-- [17] epublic.upsert_user_permission_override(p_target_user_id uuid, 
GRANT EXECUTE ON FUNCTION public.upsert_user_permission_override(p_target_user_id uuid, p_permission_key text, p_grant_type text, p_reason text) TO service_role;
-- [17] epublic.user_account_status()16482
GRANT EXECUTE ON FUNCTION public.user_account_status() TO service_role;
-- [17] epublic.user_has_permission(p_user_id uuid, p_permission_key te
GRANT EXECUTE ON FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text) TO PUBLIC;
-- [17] epublic.user_has_permission(p_user_id uuid, p_permission_key te
GRANT EXECUTE ON FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text) TO anon;
-- [17] epublic.user_has_permission(p_user_id uuid, p_permission_key te
GRANT EXECUTE ON FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text) TO authenticated;
-- [17] epublic.user_has_permission(p_user_id uuid, p_permission_key te
GRANT EXECUTE ON FUNCTION public.user_has_permission(p_user_id uuid, p_permission_key text) TO service_role;
-- [17] epublic.user_org_id()16481
GRANT EXECUTE ON FUNCTION public.user_org_id() TO authenticated;
-- [17] epublic.user_org_id()16482
GRANT EXECUTE ON FUNCTION public.user_org_id() TO service_role;
-- [17] epublic.user_profiles_sync_full_name()0
GRANT EXECUTE ON FUNCTION public.user_profiles_sync_full_name() TO PUBLIC;
-- [17] epublic.user_profiles_sync_full_name()16480
GRANT EXECUTE ON FUNCTION public.user_profiles_sync_full_name() TO anon;
-- [17] epublic.user_profiles_sync_full_name()16481
GRANT EXECUTE ON FUNCTION public.user_profiles_sync_full_name() TO authenticated;
-- [17] epublic.user_profiles_sync_full_name()16482
GRANT EXECUTE ON FUNCTION public.user_profiles_sync_full_name() TO service_role;
-- [17] epublic.user_role()16481
GRANT EXECUTE ON FUNCTION public.user_role() TO authenticated;
-- [17] epublic.user_role()16482
GRANT EXECUTE ON FUNCTION public.user_role() TO service_role;
-- [17] epublic.vehicle_name_norm(p text)16481
GRANT EXECUTE ON FUNCTION public.vehicle_name_norm(p text) TO authenticated;
-- [17] epublic.vehicle_name_norm(p text)16482
GRANT EXECUTE ON FUNCTION public.vehicle_name_norm(p text) TO service_role;
-- [17] fpublic0USAGE
GRANT USAGE ON SCHEMA public TO PUBLIC;
-- [17] fpublic16384USAGE
GRANT USAGE ON SCHEMA public TO postgres;
-- [17] fpublic16480USAGE
GRANT USAGE ON SCHEMA public TO anon;
-- [17] fpublic16481USAGE
GRANT USAGE ON SCHEMA public TO authenticated;
-- [17] fpublic16482USAGE
GRANT USAGE ON SCHEMA public TO service_role;
-- [19] publicattention_acknowledgements
DO $r$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.attention_acknowledgements; EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $r$;
-- [20] public.permissions_catalog
INSERT INTO public.permissions_catalog SELECT * FROM json_populate_recordset(NULL::public.permissions_catalog, '[{"key":"jobs.view","label":"View jobs","category":"jobs","description":"Can view jobs relevant to scope","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"jobs.create","label":"Create jobs","category":"jobs","description":"Can create new jobs","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"jobs.edit","label":"Edit jobs","category":"jobs","description":"Can edit existing jobs","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"jobs.delete","label":"Delete jobs","category":"jobs","description":"Can delete jobs","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"jobs.assign","label":"Assign jobs","category":"jobs","description":"Can assign jobs to drivers","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"jobs.view_all_org","label":"View all org jobs","category":"jobs","description":"Can view all jobs in organisation","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"users.view","label":"View users","category":"users","description":"Can view users in allowed scope","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"users.create","label":"Create users","category":"users","description":"Can create users in allowed scope","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"users.edit","label":"Edit users","category":"users","description":"Can edit users in allowed scope","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"users.activate","label":"Activate users","category":"users","description":"Can activate pending users","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"users.suspend","label":"Suspend users","category":"users","description":"Can suspend active users","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"users.archive_driver","label":"Archive drivers","category":"drivers","description":"Can archive driver operational profiles","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"users.restore_driver","label":"Restore drivers","category":"drivers","description":"Can restore archived drivers","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"users.manage_permissions","label":"Manage permissions","category":"users","description":"Can assign user permission overrides","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"users.manage_admins","label":"Manage admins","category":"users","description":"Can create or modify admin users","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"drivers.view","label":"View drivers","category":"drivers","description":"Can view driver profiles","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"drivers.manage","label":"Manage drivers","category":"drivers","description":"Can manage driver profiles","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"expenses.view","label":"View expenses","category":"expenses","description":"Can view expenses","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"expenses.manage","label":"Manage expenses","category":"expenses","description":"Can manage expenses","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"reports.view","label":"View reports","category":"reports","description":"Can view reports","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"reports.export","label":"Export data","category":"reports","description":"Can export reports and operational data","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"pod.view","label":"View PODs","category":"pod","description":"Can view POD documents","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"pod.manage","label":"Manage PODs","category":"pod","description":"Can manage POD generation and corrections","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"organisation.view","label":"View organisation","category":"organisation","description":"Can view organisation settings/data","is_sensitive":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"organisation.manage","label":"Manage organisation","category":"organisation","description":"Can manage organisation-level settings","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"system.settings","label":"Manage system settings","category":"system","description":"Can manage high-level settings in allowed scope","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"key":"platform.super_admin","label":"Super admin access","category":"platform","description":"Platform-wide super admin authority","is_sensitive":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}]') ON CONFLICT DO NOTHING;
-- [20] public.role_permission_templates
INSERT INTO public.role_permission_templates SELECT * FROM json_populate_recordset(NULL::public.role_permission_templates, '[{"role":"driver","permission_key":"jobs.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"driver","permission_key":"drivers.view","is_allowed":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"driver","permission_key":"expenses.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"driver","permission_key":"expenses.manage","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"jobs.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"jobs.create","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"jobs.edit","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"jobs.assign","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"jobs.view_all_org","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"users.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"users.create","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"users.edit","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"users.activate","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"users.suspend","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"users.archive_driver","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"users.restore_driver","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"drivers.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"drivers.manage","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"expenses.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"expenses.manage","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"reports.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"reports.export","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"pod.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"pod.manage","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"organisation.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"jobs.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"jobs.create","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"jobs.edit","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"jobs.delete","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"jobs.assign","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"jobs.view_all_org","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"users.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"users.create","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"users.edit","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"users.activate","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"users.suspend","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"users.archive_driver","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"users.restore_driver","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"users.manage_permissions","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"users.manage_admins","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"drivers.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"drivers.manage","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"expenses.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"expenses.manage","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"reports.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"reports.export","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"pod.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"pod.manage","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"organisation.view","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"organisation.manage","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"system.settings","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"super_admin","permission_key":"platform.super_admin","is_allowed":true,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"platform.super_admin","is_allowed":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"driver","permission_key":"platform.super_admin","is_allowed":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"users.manage_permissions","is_allowed":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"admin","permission_key":"users.manage_admins","is_allowed":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}, 
 {"role":"driver","permission_key":"pod.view","is_allowed":false,"created_at":"2026-03-17T12:47:47.905873+00:00"}]') ON CONFLICT DO NOTHING;
-- [20] storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) SELECT id, name, public, file_size_limit, allowed_mime_types FROM json_populate_recordset(NULL::storage.buckets, '[{"id" : "digital-id-photos", "name" : "digital-id-photos", "public" : false, "file_size_limit" : 5242880, "allowed_mime_types" : ["image/jpeg","image/png","image/webp"]}, {"id" : "expense-receipts", "name" : "expense-receipts", "public" : false, "file_size_limit" : null, "allowed_mime_types" : null}, {"id" : "invoice-pdfs", "name" : "invoice-pdfs", "public" : false, "file_size_limit" : null, "allowed_mime_types" : null}, {"id" : "onboarding-docs", "name" : "onboarding-docs", "public" : false, "file_size_limit" : null, "allowed_mime_types" : null}, {"id" : "pod-pdfs", "name" : "pod-pdfs", "public" : false, "file_size_limit" : null, "allowed_mime_types" : null}, {"id" : "pod-photos", "name" : "pod-photos", "public" : false, "file_size_limit" : null, "allowed_mime_types" : null}, {"id" : "profile-photos", "name" : "profile-photos", "public" : false, "file_size_limit" : null, "allowed_mime_types" : null}, {"id" : "vehicle-images", "name" : "vehicle-images", "public" : true, "file_size_limit" : 10485760, "allowed_mime_types" : ["image/png","image/webp"]}, {"id" : "vehicle-photos", "name" : "vehicle-photos", "public" : false, "file_size_limit" : null, "allowed_mime_types" : null}, {"id" : "vehicle-signatures", "name" : "vehicle-signatures", "public" : false, "file_size_limit" : null, "allowed_mime_types" : null}]') ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
-- [21] 0
CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text);
-- [21] v20260225231715
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260225231715', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260226003254
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260226003254', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260226205350
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260226205350', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260226215801
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260226215801', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260226233624
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260226233624', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260227085759
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260227085759', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260227101407
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260227101407', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260227110212
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260227110212', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260227121218
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260227121218', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260227121616
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260227121616', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260227193841
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260227193841', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260227225523
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260227225523', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260227233036
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260227233036', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260301095617
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260301095617', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260303100301
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260303100301', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260303121807
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260303121807', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260304003719
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260304003719', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260304013527
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260304013527', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260310084139
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260310084139', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260315032616
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260315032616', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260315032750
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260315032750', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260316034518
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260316034518', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260316204833
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260316204833', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260316212114
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260316212114', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260316212742
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260316212742', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260316214323
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260316214323', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260317100818
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260317100818', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260317122123
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260317122123', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260317123952
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260317123952', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260317124009
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260317124009', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260317124018
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260317124018', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260317141207
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260317141207', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260317142938
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260317142938', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260318225725
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260318225725', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260323222553
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260323222553', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260417225834
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260417225834', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260422110236
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260422110236', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260422120617
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260422120617', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260422132932
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260422132932', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260427203256
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260427203256', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260427204902
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260427204902', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260427205616
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260427205616', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260428000642
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260428000642', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260428010043
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260428010043', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260428015150
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260428015150', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260428021323
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260428021323', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260428080830
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260428080830', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260428081955
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260428081955', '') ON CONFLICT (version) DO NOTHING;
-- [21] v20260628100000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260628100000', 'phase1_backfill_user_profiles_and_signup_trigger') ON CONFLICT (version) DO NOTHING;
-- [21] v20260628100100
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260628100100', 'phase1_deny_by_default_rls_helpers') ON CONFLICT (version) DO NOTHING;
-- [21] v20260628100200
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260628100200', 'phase1_storage_and_residual_rls_hardening') ON CONFLICT (version) DO NOTHING;
-- [21] v20260628100300
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260628100300', 'phase1_close_signature_storage_idor') ON CONFLICT (version) DO NOTHING;
-- [21] v20260629100000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260629100000', 'fix_damage_items_replay_ordering') ON CONFLICT (version) DO NOTHING;
-- [21] v20260629100100
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260629100100', 'photos_server_side_links_and_org') ON CONFLICT (version) DO NOTHING;
-- [21] v20260630100000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260630100000', 'phase1_close_vehicle_photos_public_bucket') ON CONFLICT (version) DO NOTHING;
-- [21] v20260630100100
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260630100100', 'phase1_jobs_write_scope_admin_only') ON CONFLICT (version) DO NOTHING;
-- [21] v20260630100200
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260630100200', 'phase1_qr_handover_security_definer_rpcs') ON CONFLICT (version) DO NOTHING;
-- [21] v20260630100300
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260630100300', 'phase1_pod_pdfs_private_org_scoped') ON CONFLICT (version) DO NOTHING;
-- [21] v20260701100000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260701100000', 'evidence_items_additive') ON CONFLICT (version) DO NOTHING;
-- [21] v20260712190000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260712190000', 'add_job_contact_emails') ON CONFLICT (version) DO NOTHING;
-- [21] v20260712232500
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260712232500', 'pod_photos_private_org_scoped') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713120000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713120000', 'submit_inspection_server_side_job_lock') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713130000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713130000', 'drop_legacy_submit_inspection_4arg_overload') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713140000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713140000', 'invoice_number_atomic_allocation_and_constraints') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713150000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713150000', 'submit_inspection_assigned_driver_only') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713170000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713170000', 'delivery_requires_pickup_complete') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713180000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713180000', 'complete_job_admin_only') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713190000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713190000', 'driver_onboarding_admin_only_writes') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713200000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713200000', 'clients_invoice_items_admin_only_writes') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713210000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713210000', 'client_logs_close_anon_read_exposure') ON CONFLICT (version) DO NOTHING;
-- [21] v20260713220000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260713220000', 'invoices_admin_only_writes') ON CONFLICT (version) DO NOTHING;
-- [21] v20260714120000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260714120000', 'client_logs_bound_anon_insert') ON CONFLICT (version) DO NOTHING;
-- [21] v20260714120100
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260714120100', 'pin_function_search_path') ON CONFLICT (version) DO NOTHING;
-- [21] v20260716152504
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260716152504', 'user_profiles_grant_authenticated_writes') ON CONFLICT (version) DO NOTHING;
-- [21] v20260716192611
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260716192611', 'lockdown_security_definer_function_grants') ON CONFLICT (version) DO NOTHING;
-- [21] v20260717160533
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260717160533', 'client_logs_stamp_org_and_user') ON CONFLICT (version) DO NOTHING;
-- [21] v20260717160545
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260717160545', 'attention_acks_id_format_cleanup') ON CONFLICT (version) DO NOTHING;
-- [21] v20260717160553
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260717160553', 'jobs_route_order') ON CONFLICT (version) DO NOTHING;
-- [21] v20260718002258
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260718002258', 'invoice_pdfs_private_org_scoped') ON CONFLICT (version) DO NOTHING;
-- [21] v20260726233427
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260726233427', 'push_notifications') ON CONFLICT (version) DO NOTHING;
-- [21] v20260927001914
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260927001914', 'block_privilege_escalation_and_driver_job_tampering') ON CONFLICT (version) DO NOTHING;
-- [21] v20260927002442
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260927002442', 'submit_inspection_post_lock_idempotency') ON CONFLICT (version) DO NOTHING;
-- [21] v20260927012807
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260927012807', 'close_review_gate_status_race') ON CONFLICT (version) DO NOTHING;
-- [21] v20260927113400
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260927113400', 'dedupe_photos_before_backend_ref_unique') ON CONFLICT (version) DO NOTHING;
-- [21] v20260927113425
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260927113425', 'photos_idempotent_insert_on_retry') ON CONFLICT (version) DO NOTHING;
-- [21] v20260927113543
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20260927113543', 'photos_backend_ref_unique_plain') ON CONFLICT (version) DO NOTHING;
-- [21] v20261006130437
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261006130437', 'driver_pay_rate_for_profitability') ON CONFLICT (version) DO NOTHING;
-- [21] v20261103002758
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261103002758', 'client_portal') ON CONFLICT (version) DO NOTHING;
-- [21] v20261103003017
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261103003017', 'auto_link_job_to_client_same_org') ON CONFLICT (version) DO NOTHING;
-- [21] v20261111070035
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111070035', 'close_access_gaps') ON CONFLICT (version) DO NOTHING;
-- [21] v20261111071943
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261111071943', 'job_client_linking') ON CONFLICT (version) DO NOTHING;
-- [21] v20261113184311
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261113184311', 'customer_status_emails') ON CONFLICT (version) DO NOTHING;
-- [21] v20261114120000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261114120000', 'invoice_expenses_and_vat_setting') ON CONFLICT (version) DO NOTHING;
-- [21] v20261114130000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261114130000', 'invoice_lifecycle') ON CONFLICT (version) DO NOTHING;
-- [21] v20261114140000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261114140000', 'portal_invoice_status_and_pdf') ON CONFLICT (version) DO NOTHING;
-- [21] v20261115100000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261115100000', 'org_bank_details_and_late_payment') ON CONFLICT (version) DO NOTHING;
-- [21] v20261116120000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261116120000', 'driver_read_scope_own_jobs') ON CONFLICT (version) DO NOTHING;
-- [21] v20261116140000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261116140000', 'driver_scope_finance_and_evidence_storage') ON CONFLICT (version) DO NOTHING;
-- [21] v20261116212409
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261116212409', 'active_only_admin_helpers') ON CONFLICT (version) DO NOTHING;
-- [21] v20261116214609
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261116214609', 'driver_lock_cancelled_archived_jobs') ON CONFLICT (version) DO NOTHING;
-- [21] v20261116222659
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261116222659', 'org_fallback_and_settings_audit') ON CONFLICT (version) DO NOTHING;
-- [21] v20261116222904
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261116222904', 'require_active_actor_and_valid_permission_for_override_management') ON CONFLICT (version) DO NOTHING;
-- [21] v20261120100000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261120100000', 'super_admin_job_status_override') ON CONFLICT (version) DO NOTHING;
-- [21] v20261120120000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261120120000', 'client_fuel_policy') ON CONFLICT (version) DO NOTHING;
-- [21] v20261120140000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261120140000', 'pod_storage_follow_permissions') ON CONFLICT (version) DO NOTHING;
-- [21] v20261120150000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261120150000', 'driver_pod_view_default_off') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121100000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121100000', 'job_pricing_table') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121110000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121110000', 'job_pricing_seal') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121120000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121120000', 'job_pricing_drop_columns') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121130000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121130000', 'audit_logs_append_only_and_rpc_grants') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121140000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121140000', 'one_live_invoice_per_job') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121150000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121150000', 'test_data_flag') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121160000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121160000', 'evidence_write_lockdown') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121170000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121170000', 'vehicle_catalogue_images') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121170100
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121170100', 'job_catalogue_image_matching') ON CONFLICT (version) DO NOTHING;
-- [21] v20261121180000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261121180000', 'silence_test_data') ON CONFLICT (version) DO NOTHING;
-- [21] v20261122120000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261122120000', 'damage_inspection_v2') ON CONFLICT (version) DO NOTHING;
-- [21] v20261123100000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261123100000', 'job_abort_workflow') ON CONFLICT (version) DO NOTHING;
-- [21] v20261123202841
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261123202841', 'abort_fee_approval_lock') ON CONFLICT (version) DO NOTHING;
-- [21] v20261123215000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261123215000', 'abort_client_confirmed_fee_corrections') ON CONFLICT (version) DO NOTHING;
-- [21] v20261123220000
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261123220000', 'digital_id_v2') ON CONFLICT (version) DO NOTHING;
-- [21] v20261124223124
INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261124223124', 'digital_id_dual_role_drivers') ON CONFLICT (version) DO NOTHING;