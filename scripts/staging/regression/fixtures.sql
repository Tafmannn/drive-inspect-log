-- STAGING ONLY synthetic regression fixtures: two independent organisations.
-- Idempotent (fixed UUIDs, ON CONFLICT DO NOTHING). Guarded by the staging
-- database marker. E-mail addresses use the reserved .test TLD (RFC 2606) so
-- nothing can ever be delivered to a real person. The password is never in
-- Git: @@BCRYPT@@ is replaced at apply time with a bcrypt hash of a random
-- 40-character secret kept in a private local file.
-- Users are created through auth.users so the real on_auth_user_created
-- trigger provisions user_profiles; activation/role/client linking is then done
-- in service context, exactly as the promote-admin / portal-access functions do.
DO $guard$ BEGIN
  IF coalesce(shobj_description((SELECT oid FROM pg_database WHERE datname = current_database()), 'pg_database'), '') <> 'axentra-staging:mfedxybzajdgavzmajkl' THEN
    RAISE EXCEPTION 'TARGET GUARD: database is not marked as Axentra staging';
  END IF;
END $guard$;

INSERT INTO public.organisations (id, name, status) VALUES
  ('5f000000-0000-4000-8000-00000000000a', 'ZZ Staging Fixture Org A', 'active'),
  ('5f000000-0000-4000-8000-00000000000b', 'ZZ Staging Fixture Org B', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, org_id, name, email) VALUES
  ('5f000000-0000-4000-8000-0000000c000a', '5f000000-0000-4000-8000-00000000000a', 'ZZ Fixture Client A1', 'client-a1@axentra-staging.test'),
  ('5f000000-0000-4000-8000-0000000c000b', '5f000000-0000-4000-8000-00000000000b', 'ZZ Fixture Client B1', 'client-b1@axentra-staging.test')
ON CONFLICT (id) DO NOTHING;

WITH u(id, email, role, org) AS (VALUES
  ('5f000000-0000-4000-8000-0000000000a1'::uuid, 'zz-a-admin@axentra-staging.test',     'admin',       '5f000000-0000-4000-8000-00000000000a'),
  ('5f000000-0000-4000-8000-0000000000a2'::uuid, 'zz-a-driver@axentra-staging.test',    'driver',      '5f000000-0000-4000-8000-00000000000a'),
  ('5f000000-0000-4000-8000-0000000000a3'::uuid, 'zz-a-suspended@axentra-staging.test', 'driver',      '5f000000-0000-4000-8000-00000000000a'),
  ('5f000000-0000-4000-8000-0000000000a4'::uuid, 'zz-a-dualrole@axentra-staging.test',  'admin',       '5f000000-0000-4000-8000-00000000000a'),
  ('5f000000-0000-4000-8000-0000000000a5'::uuid, 'zz-a-client@axentra-staging.test',    'driver',      ''),
  ('5f000000-0000-4000-8000-0000000000b1'::uuid, 'zz-b-admin@axentra-staging.test',     'admin',       '5f000000-0000-4000-8000-00000000000b'),
  ('5f000000-0000-4000-8000-0000000000b2'::uuid, 'zz-b-driver@axentra-staging.test',    'driver',      '5f000000-0000-4000-8000-00000000000b'),
  ('5f000000-0000-4000-8000-0000000000b5'::uuid, 'zz-b-client@axentra-staging.test',    'driver',      ''),
  ('5f000000-0000-4000-8000-000000000051'::uuid, 'zz-superadmin@axentra-staging.test',  'super_admin', '5f000000-0000-4000-8000-00000000000a')
)
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous)
SELECT '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '@@BCRYPT@@', now(),
  '', '', '', '', '', '', '', '',
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.role, 'org_id', u.org),
  jsonb_build_object('display_name', 'ZZ ' || split_part(u.email, '@', 1)), now(), now(), false, false
FROM u
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT gen_random_uuid(), u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now()
FROM auth.users u WHERE u.email LIKE 'zz-%@axentra-staging.test'
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Activation (service context). Suspended driver stays suspended.
UPDATE public.user_profiles SET account_status = 'active', activated_at = coalesce(activated_at, now())
 WHERE email LIKE 'zz-%@axentra-staging.test' AND email <> 'zz-a-suspended@axentra-staging.test' AND account_status <> 'active';
UPDATE public.user_profiles SET account_status = 'suspended', suspended_at = coalesce(suspended_at, now()), suspension_reason = 'fixture'
 WHERE email = 'zz-a-suspended@axentra-staging.test' AND account_status <> 'suspended';
-- Portal clients: role client, linked to one client, no org (CHECK user_profiles_client_role_consistency).
UPDATE public.user_profiles SET role = 'client', org_id = NULL, client_id = '5f000000-0000-4000-8000-0000000c000a'
 WHERE email = 'zz-a-client@axentra-staging.test' AND role <> 'client';
UPDATE public.user_profiles SET role = 'client', org_id = NULL, client_id = '5f000000-0000-4000-8000-0000000c000b'
 WHERE email = 'zz-b-client@axentra-staging.test' AND role <> 'client';

-- Driver operational profiles (dual-role admin a4 also drives).
INSERT INTO public.driver_profiles (id, user_id, org_id, full_name, employment_type) VALUES
  ('5f000000-0000-4000-8000-00000000d0a2', '5f000000-0000-4000-8000-0000000000a2', '5f000000-0000-4000-8000-00000000000a', 'ZZ Driver A', 'employed'),
  ('5f000000-0000-4000-8000-00000000d0a3', '5f000000-0000-4000-8000-0000000000a3', '5f000000-0000-4000-8000-00000000000a', 'ZZ Suspended Driver A', 'employed'),
  ('5f000000-0000-4000-8000-00000000d0a4', '5f000000-0000-4000-8000-0000000000a4', '5f000000-0000-4000-8000-00000000000a', 'ZZ Dual Role A', 'employed'),
  ('5f000000-0000-4000-8000-00000000d0b2', '5f000000-0000-4000-8000-0000000000b2', '5f000000-0000-4000-8000-00000000000b', 'ZZ Driver B', 'employed')
ON CONFLICT (id) DO NOTHING;

-- Jobs: A1 assigned to driver A (client A1), A2 unassigned, B1 assigned to driver B (client B1).
INSERT INTO public.jobs (id, org_id, client_id, driver_id, status, vehicle_reg, vehicle_make, vehicle_model, vehicle_colour,
  pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_city, pickup_postcode,
  delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_city, delivery_postcode, is_test)
SELECT j.id::uuid, j.org::uuid, j.client::uuid, j.driver::uuid, 'ready_for_pickup', j.reg, 'Ford', 'Focus', 'Blue',
  'ZZ Pickup', '07000000000', '1 Fixture Road', 'Testtown', 'ZZ1 1ZZ',
  'ZZ Delivery', '07000000001', '2 Fixture Road', 'Testtown', 'ZZ1 2ZZ', false
FROM (VALUES
  ('5f000000-0000-4000-8000-0000000a0001', '5f000000-0000-4000-8000-00000000000a', '5f000000-0000-4000-8000-0000000c000a', '5f000000-0000-4000-8000-00000000d0a2', 'ZZ01AAA'),
  ('5f000000-0000-4000-8000-0000000a0002', '5f000000-0000-4000-8000-00000000000a', '5f000000-0000-4000-8000-0000000c000a', NULL, 'ZZ02AAA'),
  ('5f000000-0000-4000-8000-0000000b0001', '5f000000-0000-4000-8000-00000000000b', '5f000000-0000-4000-8000-0000000c000b', '5f000000-0000-4000-8000-00000000d0b2', 'ZZ01BBB')
) j(id, org, client, driver, reg)
ON CONFLICT (id) DO NOTHING;

SELECT (SELECT count(*) FROM auth.users WHERE email LIKE 'zz-%@axentra-staging.test') AS fixture_users,
       (SELECT string_agg(role || ':' || account_status, ',' ORDER BY email) FROM public.user_profiles WHERE email LIKE 'zz-%@axentra-staging.test') AS profiles,
       (SELECT count(*) FROM public.jobs WHERE id::text LIKE '5f000000-%') AS fixture_jobs,
       (SELECT count(*) FROM public.driver_digital_credentials) AS digital_credentials;
