-- =====================================================================
-- seed-staging.sql — minimal, idempotent test data for the LIVE
-- release-validation suites (12/13/14). STAGING ONLY.
-- =====================================================================
-- Creates two organisations, assigns an EXISTING driver auth user to org A,
-- a job in each org, and a cross-org expense + receipt object so the isolation
-- suite has something real to exclude. Re-runnable (idempotent by name/marker).
--
-- PREREQUISITE for suite 14 (real driver JWT):
--   Create the driver as a real auth user FIRST (Supabase dashboard →
--   Authentication → Add user, or the Auth admin API). The Phase-1 signup
--   trigger inserts a public.user_profiles row for them. Then run this with
--   that user's email so we can put them in org A:
--
--     psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 \
--          -v driver_email="driver.a@staging.test" \
--          -f scripts/staging/seed-staging.sql
--
--   (Suites 12/13 forge JWT claims in SQL and do NOT need a real auth user;
--    only suite 14's STAGING_DRIVER_A_JWT does.)
-- =====================================================================

\set ON_ERROR_STOP on

-- Refuse the production project as a defence-in-depth guard (matches the
-- framework + staging rollout script). current_database() can't see the ref,
-- so we guard on a sentinel you can set; by default this is a no-op.
DO $$
BEGIN
  IF current_setting('app.prod_guard', true) = 'lynkvfduzqdyvlzgriyh' THEN
    RAISE EXCEPTION 'REFUSING: this looks like the production project';
  END IF;
END $$;

-- Default the driver_email var so psql doesn't error when it is unset.
\if :{?driver_email}
\else
  \set driver_email ''
\endif

BEGIN;

-- 1) Two organisations (idempotent by unique name) -------------------------
INSERT INTO public.organisations (name) VALUES ('Staging Org A')
  ON CONFLICT (name) DO NOTHING;
INSERT INTO public.organisations (name) VALUES ('Staging Org B')
  ON CONFLICT (name) DO NOTHING;

-- 2) Assign the (already-created) driver auth user to Org A ----------------
--    Only runs if you passed -v driver_email and the profile exists.
UPDATE public.user_profiles
   SET role = 'driver',
       org_id = (SELECT id FROM public.organisations WHERE name = 'Staging Org A'),
       account_status = 'active'
 WHERE :'driver_email' <> ''
   AND lower(email) = lower(:'driver_email');

-- 3) One job per org (idempotent — external_job_number is NOT unique, so
--    guard with NOT EXISTS rather than ON CONFLICT) -----------------------
INSERT INTO public.jobs (
  org_id, current_run_id, external_job_number,
  vehicle_reg, vehicle_make, vehicle_model, vehicle_colour,
  pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_city, pickup_postcode,
  delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_city, delivery_postcode
)
SELECT o.id, gen_random_uuid(), 'STG-A-0001',
       'SA11 AAA', 'Test', 'Alpha', 'Blue',
       'Pickup A', '0700000001', '1 Pickup St', 'Manchester', 'M1 1AA',
       'Delivery A', '0700000002', '2 Delivery Rd', 'Leeds', 'LS1 1BB'
FROM public.organisations o WHERE o.name = 'Staging Org A'
  AND NOT EXISTS (SELECT 1 FROM public.jobs WHERE external_job_number = 'STG-A-0001');

INSERT INTO public.jobs (
  org_id, current_run_id, external_job_number,
  vehicle_reg, vehicle_make, vehicle_model, vehicle_colour,
  pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_city, pickup_postcode,
  delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_city, delivery_postcode
)
SELECT o.id, gen_random_uuid(), 'STG-B-0001',
       'SB22 BBB', 'Test', 'Bravo', 'Red',
       'Pickup B', '0700000003', '9 Pickup Ave', 'Bristol', 'BS1 1CC',
       'Delivery B', '0700000004', '8 Delivery Way', 'Cardiff', 'CF1 1DD'
FROM public.organisations o WHERE o.name = 'Staging Org B'
  AND NOT EXISTS (SELECT 1 FROM public.jobs WHERE external_job_number = 'STG-B-0001');

-- 4) Cross-org expense in Org B's job (so suite 13's receipt check is real) -
INSERT INTO public.expenses (job_id, amount, category, label, upload_status)
SELECT j.id, 12.34, 'fuel', 'staging seed receipt', 'synced'
FROM public.jobs j WHERE j.external_job_number = 'STG-B-0001'
  AND NOT EXISTS (
    SELECT 1 FROM public.expenses e
    WHERE e.job_id = j.id AND e.label = 'staging seed receipt'
  );

-- 5) A receipt storage object owned by Org B (path = '<expenseId>/<file>') --
--    Best-effort: only if the bucket exists. Receipt RLS keys org off
--    expenses.org_id via the expense id prefix.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('expense-receipts', 'expense-receipts', false)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.objects (bucket_id, name, owner)
SELECT 'expense-receipts', e.id::text || '/seed-receipt.jpg', NULL
FROM public.expenses e
JOIN public.jobs j ON j.id = e.job_id
WHERE j.external_job_number = 'STG-B-0001' AND e.label = 'staging seed receipt'
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'expense-receipts'
      AND o.name = e.id::text || '/seed-receipt.jpg'
  );

COMMIT;

-- 6) Print the values you need for the STAGING_* variables -----------------
\echo ''
\echo '=== Set these as GitHub Actions secrets / .env.staging (never paste in chat) ==='

SELECT 'STAGING_ORG_A' AS var, id::text AS value
FROM public.organisations WHERE name = 'Staging Org A';

SELECT 'STAGING_DRIVER_SUB' AS var,
       COALESCE(MAX(auth_user_id::text), '(create the driver auth user, then re-run with -v driver_email=...)') AS value
FROM public.user_profiles
WHERE :'driver_email' <> '' AND lower(email) = lower(:'driver_email');

-- STAGING_CROSS_ORG_PATH: a path under Org B's job. Suite 14 sends this to
-- gcs-proxy / resolve-signature-url and expects 403 for the Org-A driver.
SELECT 'STAGING_CROSS_ORG_PATH' AS var,
       'jobs/' || j.id::text || '/pickup/odometer/x.jpg' AS value
FROM public.jobs j WHERE j.external_job_number = 'STG-B-0001';

\echo '=== Org B job id above is the foreign-org object; STAGING_ORG_A pairs with the driver in Org A ==='
