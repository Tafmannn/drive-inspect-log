
-- ============================================================
-- USER PROFILES: app-level identity + lifecycle
-- ============================================================
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  first_name text,
  last_name text,
  display_name text,
  email text NOT NULL,
  phone text,
  org_id uuid REFERENCES public.organisations(id),
  role text NOT NULL DEFAULT 'driver',
  account_status text NOT NULL DEFAULT 'pending_activation',
  is_protected boolean NOT NULL DEFAULT false,
  internal_notes text,
  profile_photo_path text,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  activated_at timestamptz,
  activated_by uuid,
  suspended_at timestamptz,
  suspended_by uuid,
  suspension_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_account_status CHECK (account_status IN ('pending_activation', 'active', 'suspended')),
  CONSTRAINT valid_role CHECK (role IN ('driver', 'admin', 'super_admin'))
);

-- Indexes
CREATE INDEX idx_user_profiles_org_id ON public.user_profiles(org_id);
CREATE INDEX idx_user_profiles_account_status ON public.user_profiles(account_status);
CREATE INDEX idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX idx_user_profiles_email ON public.user_profiles(email);

-- Updated_at trigger
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Super admins: full access
CREATE POLICY "Super admins manage all user_profiles"
  ON public.user_profiles FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Org admins: manage their org users
CREATE POLICY "Admins manage own org user_profiles"
  ON public.user_profiles FOR ALL
  TO authenticated
  USING (
    org_id = user_org_id()
    AND user_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    org_id = user_org_id()
    AND user_role() IN ('admin', 'super_admin')
  );

-- Users: read own profile
CREATE POLICY "Users can read own user_profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- ============================================================
-- DRIVER PROFILES: archive fields
-- ============================================================
ALTER TABLE public.driver_profiles
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS restored_at timestamptz,
  ADD COLUMN IF NOT EXISTS restored_by uuid,
  ADD COLUMN IF NOT EXISTS restore_note text;

CREATE INDEX idx_driver_profiles_archived ON public.driver_profiles(archived_at) WHERE archived_at IS NOT NULL;

-- ============================================================
-- Helper: check account status from user_profiles
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_account_status()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT account_status FROM public.user_profiles WHERE auth_user_id = auth.uid()),
    'active'
  );
$$;
