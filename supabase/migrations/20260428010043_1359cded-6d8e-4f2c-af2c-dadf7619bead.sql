-- =========================================================================
-- PHASE 1 — DATABASE FOUNDATION (extend existing tables, add new ones)
-- PHASE 2 — RLS POLICIES (super_admin / org_admin same-org / driver-self)
-- Strategy: extend in place, no renames, no destructive changes.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) user_profiles (acts as the requested "profiles") — add display fields
-- -------------------------------------------------------------------------
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS mobile        text,
  ADD COLUMN IF NOT EXISTS avatar_url    text,
  ADD COLUMN IF NOT EXISTS full_name     text;

-- Helper: keep full_name auto-derived from first/last when not explicitly set
CREATE OR REPLACE FUNCTION public.user_profiles_sync_full_name()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.full_name IS NULL OR btrim(NEW.full_name) = '' THEN
    NEW.full_name := btrim(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,''));
    IF NEW.full_name = '' THEN NEW.full_name := NULL; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_profiles_full_name ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_full_name
BEFORE INSERT OR UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION public.user_profiles_sync_full_name();

-- -------------------------------------------------------------------------
-- 2) driver_profiles — extend with operations / finance fields
-- -------------------------------------------------------------------------
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS home_postcode        text,
  ADD COLUMN IF NOT EXISTS date_joined          date,
  ADD COLUMN IF NOT EXISTS max_daily_distance   integer,
  ADD COLUMN IF NOT EXISTS preferred_regions    text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS unavailable_regions  text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS manual_capable       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS automatic_capable    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ev_capable           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prestige_approved    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability_notes   text,
  ADD COLUMN IF NOT EXISTS payout_terms         text,
  ADD COLUMN IF NOT EXISTS endorsements         text,
  ADD COLUMN IF NOT EXISTS right_to_work        text,
  ADD COLUMN IF NOT EXISTS bank_captured        boolean NOT NULL DEFAULT false;

-- -------------------------------------------------------------------------
-- 3) clients — extend to act as full client profile
-- -------------------------------------------------------------------------
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS trading_name      text,
  ADD COLUMN IF NOT EXISTS company_number    text,
  ADD COLUMN IF NOT EXISTS vat_number        text,
  ADD COLUMN IF NOT EXISTS billing_email     text,
  ADD COLUMN IF NOT EXISTS main_phone        text,
  ADD COLUMN IF NOT EXISTS website           text,
  ADD COLUMN IF NOT EXISTS client_type       text,
  ADD COLUMN IF NOT EXISTS account_status    text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS contact_name      text,
  ADD COLUMN IF NOT EXISTS contact_email     text,
  ADD COLUMN IF NOT EXISTS contact_mobile    text,
  ADD COLUMN IF NOT EXISTS billing_address   text,
  ADD COLUMN IF NOT EXISTS payment_terms     text,
  ADD COLUMN IF NOT EXISTS rate_type         text,
  ADD COLUMN IF NOT EXISTS rate_value        numeric,
  ADD COLUMN IF NOT EXISTS minimum_charge    numeric,
  ADD COLUMN IF NOT EXISTS credit_limit      numeric,
  ADD COLUMN IF NOT EXISTS opening_hours     text,
  ADD COLUMN IF NOT EXISTS handover_requirements text,
  ADD COLUMN IF NOT EXISTS signature_required boolean NOT NULL DEFAULT false;

-- -------------------------------------------------------------------------
-- 4) organisations — extend with legal/branding/plan
-- -------------------------------------------------------------------------
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS legal_name           text,
  ADD COLUMN IF NOT EXISTS company_number       text,
  ADD COLUMN IF NOT EXISTS vat_number           text,
  ADD COLUMN IF NOT EXISTS registered_address   text,
  ADD COLUMN IF NOT EXISTS trading_address      text,
  ADD COLUMN IF NOT EXISTS main_contact_name    text,
  ADD COLUMN IF NOT EXISTS main_contact_email   text,
  ADD COLUMN IF NOT EXISTS main_contact_phone   text,
  ADD COLUMN IF NOT EXISTS branding_name        text,
  ADD COLUMN IF NOT EXISTS logo_url             text,
  ADD COLUMN IF NOT EXISTS primary_colour       text,
  ADD COLUMN IF NOT EXISTS status               text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS billing_plan         text,
  ADD COLUMN IF NOT EXISTS max_users            integer,
  ADD COLUMN IF NOT EXISTS notes                text,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_organisations_set_updated_at ON public.organisations;
CREATE TRIGGER trg_organisations_set_updated_at
BEFORE UPDATE ON public.organisations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -------------------------------------------------------------------------
-- 5) onboarding_documents — unified document registry
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  related_type    text NOT NULL CHECK (related_type IN ('driver','client','organisation')),
  related_id      uuid NOT NULL,
  file_name       text NOT NULL,
  file_url        text NOT NULL,
  document_type   text NOT NULL,
  expires_at      date,
  uploaded_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_org      ON public.onboarding_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_documents_related  ON public.onboarding_documents(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_documents_expires  ON public.onboarding_documents(expires_at) WHERE expires_at IS NOT NULL;

DROP TRIGGER IF EXISTS trg_onboarding_documents_updated_at ON public.onboarding_documents;
CREATE TRIGGER trg_onboarding_documents_updated_at
BEFORE UPDATE ON public.onboarding_documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.onboarding_documents ENABLE ROW LEVEL SECURITY;

-- super_admin: all rows
CREATE POLICY onboarding_documents_select_scoped
  ON public.onboarding_documents FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
    OR (
      related_type = 'driver'
      AND related_id IN (SELECT id FROM public.driver_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY onboarding_documents_insert_scoped
  ON public.onboarding_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
    OR (
      related_type = 'driver'
      AND related_id IN (SELECT id FROM public.driver_profiles WHERE user_id = auth.uid())
      AND org_id = public.user_org_id()
    )
  );

CREATE POLICY onboarding_documents_update_scoped
  ON public.onboarding_documents FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
    OR (
      related_type = 'driver'
      AND related_id IN (SELECT id FROM public.driver_profiles WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
    OR (
      related_type = 'driver'
      AND related_id IN (SELECT id FROM public.driver_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY onboarding_documents_delete_admin
  ON public.onboarding_documents FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
  );

-- -------------------------------------------------------------------------
-- 6) compliance_checks — driver/client/org compliance ledger
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compliance_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL,
  related_type  text NOT NULL CHECK (related_type IN ('driver','client','organisation')),
  related_id    uuid NOT NULL,
  check_type    text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','passed','failed','expired','waived')),
  due_date      date,
  notes         text,
  reviewed_by   uuid,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_checks_org      ON public.compliance_checks(org_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_related  ON public.compliance_checks(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_compliance_checks_due      ON public.compliance_checks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_compliance_checks_status   ON public.compliance_checks(status);

DROP TRIGGER IF EXISTS trg_compliance_checks_updated_at ON public.compliance_checks;
CREATE TRIGGER trg_compliance_checks_updated_at
BEFORE UPDATE ON public.compliance_checks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;

-- Drivers can read their own compliance status (read-only); admins manage everything.
CREATE POLICY compliance_checks_select_scoped
  ON public.compliance_checks FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
    OR (
      related_type = 'driver'
      AND related_id IN (SELECT id FROM public.driver_profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY compliance_checks_write_admin
  ON public.compliance_checks FOR ALL
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
  );

-- -------------------------------------------------------------------------
-- 7) Backfill organisations.updated_at for existing rows (safe)
-- -------------------------------------------------------------------------
UPDATE public.organisations SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;
