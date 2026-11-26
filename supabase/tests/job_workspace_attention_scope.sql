-- Run only on disposable/staging-equivalent database. Transaction rolled back.
BEGIN;
INSERT INTO public.organisations(id,name) VALUES
 ('a9a00000-0000-0000-0000-000000000001','Synthetic Org A'),
 ('a9a00000-0000-0000-0000-000000000002','Synthetic Org B');
INSERT INTO auth.users(id,email) VALUES
 ('a9a00000-0000-0000-0000-000000000011','jw193-admin-a@example.test'),
 ('a9a00000-0000-0000-0000-000000000012','jw193-admin-b@example.test'),
 ('a9a00000-0000-0000-0000-000000000013','jw193-driver-a@example.test');
INSERT INTO public.user_profiles(auth_user_id,org_id,role,account_status,email) VALUES
 ('a9a00000-0000-0000-0000-000000000011','a9a00000-0000-0000-0000-000000000001','admin','active','jw193-admin-a@example.test'),
 ('a9a00000-0000-0000-0000-000000000012','a9a00000-0000-0000-0000-000000000002','admin','active','jw193-admin-b@example.test'),
 ('a9a00000-0000-0000-0000-000000000013','a9a00000-0000-0000-0000-000000000001','driver','active','jw193-driver-a@example.test')
 ON CONFLICT(auth_user_id) DO UPDATE SET org_id=EXCLUDED.org_id,role=EXCLUDED.role,account_status=EXCLUDED.account_status;
-- One synthetic job per org, for job-bound evidence acknowledgements.
INSERT INTO public.jobs (id, org_id, vehicle_reg, vehicle_make, vehicle_model, vehicle_colour,
  pickup_contact_name, pickup_contact_phone, pickup_address_line1, pickup_city, pickup_postcode,
  delivery_contact_name, delivery_contact_phone, delivery_address_line1, delivery_city, delivery_postcode)
SELECT v.id::uuid, v.org::uuid, 'JW193', 'Test', 'Car', 'Grey', 'P', '07000000000', '1 Street', 'Leeds', 'LS1 1AA',
  'D', '07000000001', '2 Road', 'York', 'YO1 1AA'
FROM (VALUES ('a9a00000-0000-0000-0000-0000000000a1','a9a00000-0000-0000-0000-000000000001'),
             ('a9a00000-0000-0000-0000-0000000000b1','a9a00000-0000-0000-0000-000000000002')) AS v(id, org);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a9a00000-0000-0000-0000-000000000011',true);
SELECT public.acknowledge_attention_exception('fixture:shared',NULL,'a9a00000-0000-0000-0000-000000000001','first');
SELECT public.acknowledge_attention_exception('fixture:shared',NULL,'a9a00000-0000-0000-0000-000000000001','second');
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 AND max(note)='second' FROM public.attention_acknowledgements WHERE exception_id='fixture:shared'), 'atomic upsert';
 BEGIN
 PERFORM public.acknowledge_attention_exception('fixture:foreign',NULL,'a9a00000-0000-0000-0000-000000000002','blocked');
 RAISE EXCEPTION 'cross-org RPC unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 INSERT INTO public.attention_acknowledgements(org_id,exception_id,acknowledged_by) VALUES
 ('a9a00000-0000-0000-0000-000000000001','fixture:spoof','a9a00000-0000-0000-0000-000000000012');
 RAISE EXCEPTION 'actor spoof unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','a9a00000-0000-0000-0000-000000000012',true);
DO $$ BEGIN
 ASSERT (SELECT count(*)=0 FROM public.attention_acknowledgements WHERE exception_id='fixture:shared'), 'foreign org row invisible';
END $$;
SELECT public.acknowledge_attention_exception('fixture:shared',NULL,'a9a00000-0000-0000-0000-000000000002','org B');
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 AND max(note)='org B' FROM public.attention_acknowledgements WHERE exception_id='fixture:shared'), 'same ID independent per tenant';
END $$;
SELECT set_config('request.jwt.claim.sub','a9a00000-0000-0000-0000-000000000013',true);
DO $$ BEGIN
 ASSERT (SELECT count(*)=0 FROM public.attention_acknowledgements WHERE exception_id='fixture:shared'), 'driver cannot read acknowledgements';
 BEGIN
 PERFORM public.acknowledge_attention_exception('fixture:driver',NULL,'a9a00000-0000-0000-0000-000000000001','blocked');
 RAISE EXCEPTION 'driver RPC unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
-- Real Attention Center evidence ID shapes (exceptionEngine.stableExcId) are accepted
-- when bound to the same job; mismatched or unbound evidence IDs are refused.
SELECT set_config('request.jwt.claim.sub','a9a00000-0000-0000-0000-000000000011',true);
SELECT public.acknowledge_attention_exception('evidence:a9a00000-0000-0000-0000-0000000000a1:missing-driver-signature','a9a00000-0000-0000-0000-0000000000a1',NULL,'paper POD');
SELECT public.acknowledge_attention_exception('evidence:a9a00000-0000-0000-0000-0000000000a1:repeated-upload-failures','a9a00000-0000-0000-0000-0000000000a1','a9a00000-0000-0000-0000-000000000001','snooze',now()+interval '1 day');
SELECT public.acknowledge_attention_exception('evidence:a9a00000-0000-0000-0000-0000000000a1','a9a00000-0000-0000-0000-0000000000a1',NULL,'job evidence resolved');
SELECT public.acknowledge_attention_exception('evidence:global:signature-resolution-failed:abc',NULL,'a9a00000-0000-0000-0000-000000000001','no job');
DO $$ BEGIN
 ASSERT (SELECT count(*)=4 FROM public.attention_acknowledgements WHERE exception_id LIKE 'evidence:%'), 'engine evidence IDs acknowledged';
 ASSERT (SELECT bool_and(org_id='a9a00000-0000-0000-0000-000000000001') FROM public.attention_acknowledgements WHERE exception_id LIKE 'evidence:%'), 'org derived from job';
 BEGIN
 PERFORM public.acknowledge_attention_exception('evidence:a9a00000-0000-0000-0000-0000000000b1:missing-driver-signature','a9a00000-0000-0000-0000-0000000000a1',NULL,'spoof');
 RAISE EXCEPTION 'mismatched evidence job unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
 PERFORM public.acknowledge_attention_exception('evidence:a9a00000-0000-0000-0000-0000000000a1',NULL,'a9a00000-0000-0000-0000-000000000001','unbound');
 RAISE EXCEPTION 'unbound job evidence marker unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
 PERFORM public.acknowledge_attention_exception('evidence:a9a00000-0000-0000-0000-0000000000a1x','a9a00000-0000-0000-0000-0000000000a1',NULL,'prefix');
 RAISE EXCEPTION 'evidence ID prefix collision unexpectedly accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
 PERFORM public.acknowledge_attention_exception('evidence:a9a00000-0000-0000-0000-0000000000b1:missing-driver-signature','a9a00000-0000-0000-0000-0000000000b1',NULL,'foreign job');
 RAISE EXCEPTION 'foreign org job evidence unexpectedly accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
-- Acknowledging never touches the job or its evidence.
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM public.jobs WHERE id='a9a00000-0000-0000-0000-0000000000a1'), 'job retained';
END $$;
ROLLBACK;
