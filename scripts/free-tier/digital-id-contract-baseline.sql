-- Disposable Digital ID V2 contract fixture, NOT an Axentra production
-- schema snapshot. Only the exact upstream relations/functions referenced by
-- 20261123220000_digital_id_v2.sql are represented here.
-- The test proves isolated module behaviour, NOT full production parity.
\set ON_ERROR_STOP 1
CREATE TABLE public.organisations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  main_contact_phone text
);
CREATE TABLE public.user_profiles (
  auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  org_id uuid REFERENCES public.organisations(id),
  role text NOT NULL,
  account_status text NOT NULL DEFAULT 'pending',
  full_name text,
  first_name text,
  last_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.driver_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  org_id uuid NOT NULL REFERENCES public.organisations(id),
  full_name text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  archive_reason text,
  restored_at timestamptz,
  restored_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  employment_type text
);

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS 'SELECT EXISTS (SELECT 1 FROM public.user_profiles u WHERE u.auth_user_id=auth.uid() AND u.role=''super_admin'' AND u.account_status=''active'')';
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS 'SELECT EXISTS (SELECT 1 FROM public.user_profiles u WHERE u.auth_user_id=auth.uid() AND u.role IN (''admin'',''super_admin'') AND u.account_status=''active'')';
CREATE OR REPLACE FUNCTION public.user_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS 'SELECT u.org_id FROM public.user_profiles u WHERE u.auth_user_id=auth.uid() LIMIT 1';

REVOKE ALL ON public.user_profiles,public.driver_profiles,public.organisations FROM anon;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profile_self_read" ON public.user_profiles FOR SELECT TO authenticated
USING (auth_user_id=(SELECT auth.uid()));
CREATE POLICY "driver_self_read" ON public.driver_profiles FOR SELECT TO authenticated
USING (user_id=(SELECT auth.uid()));
GRANT SELECT ON public.user_profiles,public.driver_profiles,public.organisations TO authenticated;
-- The real application has additional organisational and lifecycle policies:
-- this fixture deliberately does NOT claim to emulate them.
