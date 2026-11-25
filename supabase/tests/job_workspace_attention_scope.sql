-- Run only on disposable/staging-equivalent database. Transaction rolled back.
BEGIN;
INSERT INTO public.organisations(id,name) VALUES
 ('a9a00000-0000-0000-0000-000000000001','Synthetic Org A'),
 ('a9a00000-0000-0000-0000-000000000002','Synthetic Org B');
INSERT INTO auth.users(id) VALUES
 ('a9a00000-0000-0000-0000-000000000011'),
 ('a9a00000-0000-0000-0000-000000000012'),
 ('a9a00000-0000-0000-0000-000000000013');
INSERT INTO public.user_profiles(auth_user_id,org_id,role,account_status) VALUES
 ('a9a00000-0000-0000-0000-000000000011','a9a00000-0000-0000-0000-000000000001','admin','active'),
 ('a9a00000-0000-0000-0000-000000000012','a9a00000-0000-0000-0000-000000000002','admin','active'),
 ('a9a00000-0000-0000-0000-000000000013','a9a00000-0000-0000-0000-000000000001','driver','active')
 ON CONFLICT(auth_user_id) DO UPDATE SET org_id=EXCLUDED.org_id,role=EXCLUDED.role,account_status=EXCLUDED.account_status;
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
RESET ROLE;
ROLLBACK;
