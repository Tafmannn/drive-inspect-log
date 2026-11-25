-- Digital ID V2: rollback-only, synthetic-role scenario for the disposable
-- LOCAL Supabase DB. Never run on production or a real customer database.
\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.require_true(ok boolean, reason text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'DIGITAL_ID_TEST_FAILED: %', reason; END IF;
END $$;

CREATE FUNCTION pg_temp.require_denied(statement text, expected text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE succeeded boolean := false;
BEGIN
  BEGIN
    EXECUTE statement;
    succeeded := true;
  EXCEPTION WHEN others THEN
    IF SQLERRM NOT LIKE '%' || expected || '%' THEN
      RAISE EXCEPTION 'DIGITAL_ID_WRONG_ERROR: % expected %', SQLERRM, expected;
    END IF;
  END;
  IF succeeded THEN RAISE EXCEPTION 'DIGITAL_ID_UNAUTHORIZED_SUCCEEDED: %', statement; END IF;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.require_true(boolean,text),
  pg_temp.require_denied(text,text) TO authenticated;

INSERT INTO public.organisations (id,name) VALUES
 ('d1d00000-0000-0000-0000-000000000001','Digital ID Test Organisation A'),
 ('d1d00000-0000-0000-0000-000000000002','Digital ID Test Organisation B');

INSERT INTO auth.users (id,email) VALUES
 ('d2d00000-0000-0000-0000-000000000001','synthetic-driver@digital-id.invalid'),
 ('d2d00000-0000-0000-0000-000000000002','synthetic-admin@digital-id.invalid'),
 ('d2d00000-0000-0000-0000-000000000003','synthetic-foreign@digital-id.invalid'),
 ('d2d00000-0000-0000-0000-000000000004','synthetic-pending@digital-id.invalid');

INSERT INTO public.user_profiles (auth_user_id,org_id,role,account_status,full_name) VALUES
 ('d2d00000-0000-0000-0000-000000000001','d1d00000-0000-0000-0000-000000000001','driver','active','Test Driver'),
 ('d2d00000-0000-0000-0000-000000000002','d1d00000-0000-0000-0000-000000000001','admin','active','Test Admin'),
 ('d2d00000-0000-0000-0000-000000000003','d1d00000-0000-0000-0000-000000000002','admin','active','Foreign Admin'),
 ('d2d00000-0000-0000-0000-000000000004','d1d00000-0000-0000-0000-000000000001','driver','pending','Pending Driver');

-- Issuance occurs automatically only on activation.
SELECT pg_temp.require_true(
  (SELECT count(*) FROM public.driver_digital_credentials WHERE user_id='d2d00000-0000-0000-0000-000000000001')=1,
  'active driver receives one permanent credential');
SELECT pg_temp.require_true(
  NOT EXISTS(SELECT 1 FROM public.driver_digital_credentials WHERE user_id='d2d00000-0000-0000-0000-000000000004'),
  'pending driver must not receive a credential');
SELECT pg_temp.require_true(
  (SELECT status='active' AND serial_number>0 FROM public.driver_digital_credentials
    WHERE user_id='d2d00000-0000-0000-0000-000000000001'),
  'valid active credential with permanent serial');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000001',true);
SELECT pg_temp.require_true(
  (public.get_driver_digital_id('d2d00000-0000-0000-0000-000000000001')->>'status')='active',
  'driver can obtain current company-issued credential');
SELECT pg_temp.require_true(
  NOT (public.get_driver_digital_id('d2d00000-0000-0000-0000-000000000001') ? 'licence_number'),
  'the company ID must not expose a driving licence');
SELECT pg_temp.require_denied(
  'SELECT public.set_driver_digital_id_photo(''d2d00000-0000-0000-0000-000000000001'',NULL)',
  'ADMIN_REQUIRED');
SELECT pg_temp.require_denied(
  'SELECT public.get_driver_digital_id(''d2d00000-0000-0000-0000-000000000004'')',
  'NOT_AUTHORISED');

SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000003',true);
SELECT pg_temp.require_denied(
  'SELECT public.get_driver_digital_id(''d2d00000-0000-0000-0000-000000000001'')',
  'NOT_AUTHORISED');

SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000002',true);
SELECT pg_temp.require_true(
  (public.get_driver_digital_id('d2d00000-0000-0000-0000-000000000001')->>'status')='active',
  'same-org administrator can inspect credential');

RESET ROLE;
UPDATE public.user_profiles SET account_status='suspended'
 WHERE auth_user_id='d2d00000-0000-0000-0000-000000000001';
SELECT pg_temp.require_true(
  (SELECT status='revoked' FROM public.driver_digital_credentials
    WHERE user_id='d2d00000-0000-0000-0000-000000000001'),
  'suspension must immediately revoke server credential');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000001',true);
SELECT pg_temp.require_denied(
  'SELECT public.get_driver_digital_id(''d2d00000-0000-0000-0000-000000000001'')',
  'ACCOUNT_INACTIVE');
RESET ROLE;

UPDATE public.user_profiles SET account_status='active'
 WHERE auth_user_id='d2d00000-0000-0000-0000-000000000001';
SELECT pg_temp.require_true(
  (SELECT status='active' AND credential_version>=2 FROM public.driver_digital_credentials
    WHERE user_id='d2d00000-0000-0000-0000-000000000001'),
  'reactivation must restore status while advancing version');
SELECT pg_temp.require_true(
  (SELECT count(DISTINCT serial_number)=1 FROM public.driver_digital_credentials
    WHERE user_id='d2d00000-0000-0000-0000-000000000001'),
  'reactivation preserves serial');
UPDATE public.user_profiles SET account_status='active'
 WHERE auth_user_id='d2d00000-0000-0000-0000-000000000004';
SELECT pg_temp.require_true(
  (SELECT count(*) FROM public.driver_digital_credentials
    WHERE user_id='d2d00000-0000-0000-0000-000000000004')=1,
  'pending account receives ID exactly on activation');
SELECT pg_temp.require_true(
  (SELECT count(*)>=3 FROM public.driver_digital_credential_events e
    JOIN public.driver_digital_credentials c ON c.id=e.credential_id
    WHERE c.user_id='d2d00000-0000-0000-0000-000000000001'),
  'issuance, suspension and reactivation events retained');

-- Private Storage metadata RLS contract: this tests database policy boundaries,
-- NOT real file upload bytes or actual signed URLs over the Storage HTTP API.
SELECT pg_temp.require_true(
 (SELECT NOT public FROM storage.buckets WHERE id='digital-id-photos'),
 'Digital ID photographs must use a private bucket');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000002',true);
INSERT INTO storage.objects(bucket_id,name) VALUES
 ('digital-id-photos','d1d00000-0000-0000-0000-000000000001/d2d00000-0000-0000-0000-000000000001/synthetic.jpg');
SELECT public.set_driver_digital_id_photo(
 'd2d00000-0000-0000-0000-000000000001',
 'd1d00000-0000-0000-0000-000000000001/d2d00000-0000-0000-0000-000000000001/synthetic.jpg');
SELECT pg_temp.require_true(
 (public.get_driver_digital_id('d2d00000-0000-0000-0000-000000000001')->>'photo_path') =
 'd1d00000-0000-0000-0000-000000000001/d2d00000-0000-0000-0000-000000000001/synthetic.jpg',
 'same-org admin can assign an existing private photo');
SELECT pg_temp.require_true(
 (SELECT count(*) FROM public.driver_digital_credential_events e
   JOIN public.driver_digital_credentials c ON c.id=e.credential_id
   WHERE c.user_id='d2d00000-0000-0000-0000-000000000001' AND e.event_type='photo_updated')>=1,
 'admin photograph changes are audited');

SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000003',true);
SELECT pg_temp.require_true(
 (SELECT count(*)=0 FROM storage.objects WHERE bucket_id='digital-id-photos'),
 'foreign-org admin cannot read another organisation photo');
SELECT pg_temp.require_denied(
 'INSERT INTO storage.objects(bucket_id,name) VALUES (''digital-id-photos'',''d1d00000-0000-0000-0000-000000000001/d2d00000-0000-0000-0000-000000000001/foreign.jpg'')',
 'row-level security');

SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000001',true);
SELECT pg_temp.require_true(
 (SELECT count(*)=1 FROM storage.objects WHERE bucket_id='digital-id-photos'),
 'active driver can access only their own ID photo');
SELECT pg_temp.require_denied(
 'INSERT INTO storage.objects(bucket_id,name) VALUES (''digital-id-photos'',''d1d00000-0000-0000-0000-000000000001/d2d00000-0000-0000-0000-000000000001/driver-upload.jpg'')',
 'row-level security');
RESET ROLE;

UPDATE public.user_profiles SET account_status='suspended'
 WHERE auth_user_id='d2d00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000001',true);
SELECT pg_temp.require_true(
 (SELECT count(*)=0 FROM storage.objects WHERE bucket_id='digital-id-photos'),
 'suspended driver loses RLS access to private ID photograph');
RESET ROLE;

-- Administrative role alone is not a driver credential.
SELECT pg_temp.require_true(NOT EXISTS (
  SELECT 1 FROM public.driver_digital_credentials WHERE user_id='d2d00000-0000-0000-0000-000000000002'
), 'admin without driving profile does not receive an ID');
INSERT INTO public.driver_profiles(user_id,org_id,full_name,is_active) VALUES
 ('d2d00000-0000-0000-0000-000000000002','d1d00000-0000-0000-0000-000000000001','Test Admin Driver',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000002',true);
SELECT pg_temp.require_true(
 (public.get_driver_digital_id(NULL)->>'status')='active',
 'active dual-role admin can obtain own driver ID');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.driver_profiles SET is_active=false
 WHERE user_id='d2d00000-0000-0000-0000-000000000002';
SELECT pg_temp.require_true(
 (SELECT status='revoked' FROM public.driver_digital_credentials WHERE user_id='d2d00000-0000-0000-0000-000000000002'),
 'disabled driving profile revokes dual-role credential');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','d2d00000-0000-0000-0000-000000000002',true);
SELECT pg_temp.require_denied('SELECT public.get_driver_digital_id(NULL)','CREDENTIAL_UNAVAILABLE');
RESET ROLE;

\echo 'PASS: DIGITAL ID V2 SQL LIFECYCLE AND ACCESS TESTS'
ROLLBACK;
