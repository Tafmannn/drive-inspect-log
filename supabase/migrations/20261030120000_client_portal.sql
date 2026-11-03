-- =====================================================================
-- Client self-service portal (Phase 4).
--
-- SECURITY MODEL
--   * A portal user is a user_profiles row with role = 'client', a
--     client_id, and org_id = NULL. Every existing RLS policy and helper in
--     this schema scopes by `org_id = user_org_id()`, and user_org_id() is
--     NULL for such a user — so a portal user is denied on every existing
--     table by default. No existing policy is loosened.
--   * Portal users get NO direct table access. Everything they can see comes
--     through the portal_* SECURITY DEFINER functions below, which return an
--     explicit whitelist of columns. Row-level policies can't hide columns
--     (pricing_metadata, admin_rate, client_notes, driver contact details...),
--     so functions — not new SELECT policies — are the boundary.
--   * A CHECK constraint makes "client role <=> client_id set <=> no org" a
--     database invariant, so no code path (including the existing
--     user-lifecycle create/set_role actions) can mint a half-formed portal
--     user or attach a portal identity to a staff account.
--   * client_id is added to the privileged-column guard: only a super-admin
--     or the service role can set or change it.
-- =====================================================================

-- ── 1. Allow the 'client' role ────────────────────────────────────────
-- Two equivalent role CHECKs exist on this table; both are widened
-- identically rather than consolidated, to keep this change minimal.
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('driver', 'admin', 'super_admin', 'client'));
ALTER TABLE public.user_profiles
  ADD CONSTRAINT valid_role CHECK (role IN ('driver', 'admin', 'super_admin', 'client'));

-- ── 2. Link a portal user to exactly one client ────────────────────────
-- RESTRICT: a client with portal users can't be hard-deleted out from under
-- them; portal access is removed first (portal-access edge function).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS user_profiles_client_id_idx
  ON public.user_profiles (client_id) WHERE client_id IS NOT NULL;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_client_role_consistency CHECK (
    ((role = 'client') = (client_id IS NOT NULL))
    AND (role <> 'client' OR org_id IS NULL)
  );

-- ── 3. Privileged-column guard: lock client_id and the client role ─────
-- Same function as before, with three additions marked [portal].
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
    -- [portal] Portal identities are created only by the service role.
    IF NEW.role = 'client' OR NEW.client_id IS NOT NULL THEN
      RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
        USING ERRCODE = '42501', HINT = 'Client portal users can only be created through the portal invite flow';
    END IF;
    RETURN NEW;
  END IF;

  -- Identity/tenancy columns are never editable from the client.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.client_id IS DISTINCT FROM OLD.client_id  -- [portal]
     OR NEW.is_protected IS DISTINCT FROM OLD.is_protected THEN
    RAISE EXCEPTION 'PRIVILEGED_PROFILE_FIELDS'
      USING ERRCODE = '42501', HINT = 'id, auth_user_id, org_id, client_id and is_protected cannot be changed here';
  END IF;

  -- [portal] Nobody but a super-admin/service role moves a user into or out
  -- of the client role.
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

  -- Everyone else (drivers, portal users editing their own row): personal fields only.
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
$function$;

-- ── 4. Close a self-insert gap the portal would otherwise widen ────────
-- The self path of this policy (user_id = auth.uid()) never checked org_id,
-- so any signed-in user could create a driver_profiles row in ANY org and
-- appear in that operator's driver list. With external portal users now
-- able to sign in, that's no longer an insider-only gap. The self path now
-- requires the row's org to be the caller's own org — the only org the
-- app's own self-service form (Profile -> DriverProfileForm) ever writes.
ALTER POLICY driver_profiles_insert_self_admin_super
  ON public.driver_profiles
  WITH CHECK (
    ((user_id = auth.uid()) AND (org_id = public.user_org_id()))
    OR public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND (org_id = public.user_org_id()))
  );

-- ── 5. Invoices: record when an invoice was actually sent ──────────────
-- Invoice status never leaves 'draft' anywhere in this codebase, so status
-- can't tell an issued invoice from a work-in-progress one. The portal shows
-- only invoices that were emailed to the client; send-invoice-email stamps
-- this on first successful delivery.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sent_at timestamptz;

-- ── 6. Portal read functions ───────────────────────────────────────────

-- The caller's client id, iff they are an active portal user of an active
-- client. NULL for everyone else (drivers, admins, suspended portal users).
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
$function$;

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
    'client', jsonb_build_object(
      'id', c.id,
      'name', COALESCE(NULLIF(c.trading_name, ''), NULLIF(c.company, ''), c.name)
    ),
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
$function$;

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
        AND j.status NOT IN ('draft', 'archived')
      ORDER BY sort_at DESC
      LIMIT 500
    ) t
  ), '[]'::jsonb);
END;
$function$;

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

  -- Not-yours and doesn't-exist are deliberately indistinguishable.
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
    AND j.status NOT IN ('draft', 'archived');

  IF v_job IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'job', v_job,
    -- Status transitions only; the free-text notes column is operator-internal.
    'timeline', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', l.to_status, 'at', l.created_at) ORDER BY l.created_at)
      FROM public.job_activity_log l
      WHERE l.job_id = p_job_id AND l.to_status IS NOT NULL
    ), '[]'::jsonb),
    -- Active inspections only (archived = superseded by a reopen/redo).
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
$function$;

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
      'sent_at', inv.sent_at
    ) ORDER BY inv.issue_date DESC, inv.created_at DESC)
    FROM public.invoices inv
    WHERE inv.client_id = v_cid
      AND inv.org_id = v_org
      AND inv.sent_at IS NOT NULL
  ), '[]'::jsonb);
END;
$function$;

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
      'company_number', o.company_number
    )
  )
  INTO v
  FROM public.invoices inv
  JOIN public.organisations o ON o.id = inv.org_id
  WHERE inv.id = p_invoice_id
    AND inv.client_id = v_cid
    AND inv.org_id = v_org
    AND inv.sent_at IS NOT NULL;

  IF v IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  RETURN v;
END;
$function$;

-- ── 7. Execute grants ──────────────────────────────────────────────────
-- Supabase grants EXECUTE on new functions to anon/authenticated by default.
-- portal_client_id is an internal building block: callable only by the
-- functions above (which run as their owner), never directly.
REVOKE ALL ON FUNCTION public.portal_client_id() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.portal_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_list_jobs() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_get_job(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_list_invoices() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_get_invoice(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.portal_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_invoices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_invoice(uuid) TO authenticated;

-- ── 8. Auto-link jobs to clients within the job's own org only ─────────
-- This trigger matched clients by company name across EVERY organisation,
-- so a job could be linked to another operator's same-named client. With a
-- client portal keyed on jobs.client_id, that would have been a cross-tenant
-- leak (the portal functions independently also require job.org_id =
-- client.org_id, so it is blocked twice). No mis-links existed when fixed.
CREATE OR REPLACE FUNCTION public.auto_link_job_to_client()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  matched_client_id uuid;
begin
  if new.client_id is not null then
    return new;
  end if;

  if coalesce(trim(new.client_name), '') = '' then
    return new;
  end if;

  -- Only ever link to a client in the job's own organisation.
  select c.id
  into matched_client_id
  from clients c
  where c.org_id = new.org_id
    and normalize_client_name(c.company) = normalize_client_name(new.client_name)
  order by c.created_at asc
  limit 1;

  if matched_client_id is not null then
    new.client_id := matched_client_id;
  end if;

  return new;
end;
$function$;
