-- =====================================================================
-- Public marketing enquiry table: movement_enquiries
-- =====================================================================
-- Backs the public website's "Request a vehicle movement" form. Rows are
-- written ONLY by the submit-movement-request edge function using the service
-- role (which bypasses RLS). They are deliberately kept OUT of the live `jobs`
-- table: a website enquiry is an unconfirmed lead, not a booked job.
--
-- SECURITY MODEL:
--   * RLS is enabled with NO anon/authenticated INSERT/UPDATE/DELETE policies,
--     so the public anon API key cannot read, write or tamper with enquiries.
--   * Only the service role (edge functions) inserts. Reads are limited to
--     admins/super-admins via public.is_admin_or_super_admin() so the ops team
--     can triage leads, mirroring the app's existing role model.
--   * public_reference is unique and non-sequential (AXE-YYYYMMDD-XXXX), so IDs
--     are not enumerable. idempotency_key dedupes accidental double-submits.
-- =====================================================================

-- ── movement_enquiries ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.movement_enquiries (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_reference          text NOT NULL UNIQUE,
  idempotency_key           text UNIQUE,
  status                    text NOT NULL DEFAULT 'new',

  -- customer
  full_name                 text NOT NULL,
  company_name              text,
  email                     text NOT NULL,
  telephone                 text NOT NULL,
  customer_type             text,

  -- vehicle
  vehicle_registration      text,
  vehicle_make              text,
  vehicle_model             text,
  running_status            text,
  roadworthy_status         text,
  mot_status                text,
  movement_arrangement      text,
  known_damage              text,

  -- collection / delivery
  collection_postcode       text,
  collection_contact_name   text,
  collection_instructions   text,
  delivery_postcode         text,
  delivery_contact_name     text,
  delivery_instructions     text,

  -- movement
  preferred_date            text,
  date_flexible             boolean NOT NULL DEFAULT false,
  movement_frequency        text,
  additional_instructions   text,

  consent_timestamp         timestamptz NOT NULL DEFAULT now(),
  source                    text NOT NULL DEFAULT 'website',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  reviewed_at               timestamptz,
  converted_job_id          uuid
);

ALTER TABLE public.movement_enquiries ENABLE ROW LEVEL SECURITY;

-- Admins/super-admins may read enquiries; nobody else can via the API.
DROP POLICY IF EXISTS "movement_enquiries admin read" ON public.movement_enquiries;
CREATE POLICY "movement_enquiries admin read"
  ON public.movement_enquiries FOR SELECT
  USING (public.is_admin_or_super_admin());

-- Admins/super-admins may update triage fields (status/reviewed_at/etc.).
DROP POLICY IF EXISTS "movement_enquiries admin update" ON public.movement_enquiries;
CREATE POLICY "movement_enquiries admin update"
  ON public.movement_enquiries FOR UPDATE
  USING (public.is_admin_or_super_admin())
  WITH CHECK (public.is_admin_or_super_admin());

CREATE INDEX IF NOT EXISTS movement_enquiries_created_at_idx
  ON public.movement_enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS movement_enquiries_status_idx
  ON public.movement_enquiries (status);
