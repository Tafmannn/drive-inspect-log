-- Staging-only regression: credit notes, revised invoices and invoice-pack storage.
--
-- Run against STAGING ONLY (mfedxybzajdgavzmajkl), e.g. through the Supabase MCP
-- execute_sql tool or psql as the postgres role. Every step runs as a real
-- fixture identity (scripts/staging/regression/fixtures.sql) under RLS via
-- `role = authenticated` + request.jwt.claims. The script ALWAYS ends by
-- raising an exception that carries the results, so the whole transaction is
-- rolled back and staging is left unchanged (no invoice numbers, rows or
-- storage objects persist). Read the results from the error message:
--   STAGING_INVOICE_REGRESSION passed=N failed=M | PASS 01 ... | FAIL 07 ...
--
-- Expectation syntax per step:
--   ok            statement succeeds and returns a non-null value
--   save:KEY      as ok, and stores the value as {KEY} for later steps
--   err:REGEX     statement fails with a message matching REGEX (case-insensitive)
--   val:TEXT      statement returns exactly TEXT
DO $regression$
DECLARE
  -- fixtures
  org_a  constant uuid := '5f000000-0000-4000-8000-00000000000a';
  cli_a  constant uuid := '5f000000-0000-4000-8000-0000000c000a';
  users  constant jsonb := jsonb_build_object(
    'A_admin',  '5f000000-0000-4000-8000-0000000000a1',
    'A_driver', '5f000000-0000-4000-8000-0000000000a2',
    'A_client', '5f000000-0000-4000-8000-0000000000a5',
    'B_admin',  '5f000000-0000-4000-8000-0000000000b1',
    'B_client', '5f000000-0000-4000-8000-0000000000b5',
    'SUPER',    '5f000000-0000-4000-8000-000000000051');
  tokens jsonb;
  j1 uuid; j2 uuid; j3 uuid;
  step record; q text; v text; k text; expect text; ok boolean; detail text;
  results text[] := '{}'; passed int := 0; failed int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '5f000000-0000-4000-8000-0000000000a1'
                   AND email = 'zz-a-admin@axentra-staging.test') THEN
    RAISE EXCEPTION 'REFUSED: staging fixtures not found; this script runs on staging only';
  END IF;

  -- Three org-A jobs with no live invoice (any status; the DB guard does not check it).
  SELECT to_jsonb(array_agg(id ORDER BY created_at)) INTO STRICT tokens
    FROM (SELECT j.id, j.created_at FROM public.jobs j
           WHERE j.org_id = org_a
             AND NOT EXISTS (SELECT 1 FROM public.invoice_items ii WHERE ii.job_id = j.id AND NOT ii.voided)
             AND j.status <> 'aborted'
             AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.job_id = j.id AND i.status <> 'cancelled')
           ORDER BY j.created_at LIMIT 3) s;
  -- (tokens is reused as a scratch array above; reset to the real token map below)
  j1 := (tokens->>0)::uuid; j2 := (tokens->>1)::uuid; j3 := (tokens->>2)::uuid;
  IF j3 IS NULL THEN RAISE EXCEPTION 'REFUSED: need 3 uninvoiced org-A jobs'; END IF;
  tokens := jsonb_build_object('ORGA', org_a, 'CLIA', cli_a, 'J1', j1, 'J2', j2, 'J3', j3);

  FOR step IN
    SELECT * FROM (VALUES
    -- create + isolate
    ('01 admin A allocates an invoice number', 'A_admin', $q$select public.allocate_invoice_number('{ORGA}')$q$, 'save:NUM1'),
    ('02 admin A creates a draft invoice', 'A_admin', $q$insert into public.invoices (org_id, client_id, client_name, invoice_number, subtotal, vat_registered, vat_rate, vat_amount, total, status) values ('{ORGA}','{CLIA}','ZZ Fixture Client A1','{NUM1}',100,true,20,20,120,'draft') returning id::text$q$, 'save:INV1'),
    ('03 admin A adds job J1 to it', 'A_admin', $q$insert into public.invoice_items (invoice_id, job_id, description, quantity, unit_price, amount, sort_order) values ('{INV1}','{J1}','ZZ test move',1,100,100,0) returning id::text$q$, 'ok'),
    ('04 admin B cannot see org A invoice', 'B_admin', $q$select count(*)::text from public.invoices where id = '{INV1}'$q$, 'val:0'),
    ('05 driver A cannot see invoices', 'A_driver', $q$select count(*)::text from public.invoices where org_id = '{ORGA}'$q$, 'val:0'),
    ('06 admin B cannot cancel org A invoice', 'B_admin', $q$select public.cancel_invoice('{INV1}','x')::text$q$, 'err:invoice not found'),
    ('07 driver A cannot cancel', 'A_driver', $q$select public.cancel_invoice('{INV1}','x')::text$q$, 'err:only admins'),
    -- invoice pack storage (access rules on storage.objects; bytes are built client-side)
    ('08 admin A stores pack PDF in own org path', 'A_admin', $q$insert into storage.objects (bucket_id, name) values ('invoice-pdfs','{ORGA}/pack-v1-{INV1}/u1/{NUM1}.pdf') returning name$q$, 'save:PDF1'),
    ('09 admin A stores pack ZIP in own org path', 'A_admin', $q$insert into storage.objects (bucket_id, name) values ('invoice-pdfs','{ORGA}/pack-v1-{INV1}/u1/{NUM1}.zip') returning name$q$, 'ok'),
    ('10 admin B cannot write into org A pack path', 'B_admin', $q$insert into storage.objects (bucket_id, name) values ('invoice-pdfs','{ORGA}/pack-v1-{INV1}/evil/x.pdf') returning name$q$, 'err:row-level security'),
    ('11 admin B cannot list org A pack', 'B_admin', $q$select count(*)::text from storage.objects where bucket_id='invoice-pdfs' and name like '{ORGA}/pack-v1-{INV1}/%'$q$, 'val:0'),
    ('12 driver A cannot list org A pack', 'A_driver', $q$select count(*)::text from storage.objects where bucket_id='invoice-pdfs' and name like '{ORGA}/pack-v1-{INV1}/%'$q$, 'val:0'),
    ('13 portal client A cannot read the PDF before it is sent', 'A_client', $q$select count(*)::text from storage.objects where bucket_id='invoice-pdfs' and name like '{ORGA}/pack-v1-{INV1}/%'$q$, 'val:0'),
    ('14 admin A attaches the PDF to the draft', 'A_admin', $q$update public.invoices set pdf_url = '{PDF1}' where id = '{INV1}' and status = 'draft' returning id::text$q$, 'ok'),
    ('15 admin A marks it sent', 'A_admin', $q$update public.invoices set status = 'sent', sent_at = now() where id = '{INV1}' and status = 'draft' and pdf_url = '{PDF1}' returning status$q$, 'val:sent'),
    ('16 portal client A can read the sent PDF only (not the ZIP)', 'A_client', $q$select string_agg(right(name, 4), ',' order by name) from storage.objects where bucket_id='invoice-pdfs' and name like '{ORGA}/pack-v1-{INV1}/%'$q$, 'val:.pdf'),
    ('17 portal client B cannot read org A PDF', 'B_client', $q$select count(*)::text from storage.objects where bucket_id='invoice-pdfs' and name like '{ORGA}/pack-v1-{INV1}/%'$q$, 'val:0'),
    -- immutability once issued
    ('18 issued invoice total cannot change', 'A_admin', $q$update public.invoices set total = 1 where id = '{INV1}' returning id::text$q$, 'err:cannot be changed'),
    ('19 issued invoice cannot be deleted', 'A_admin', $q$delete from public.invoices where id = '{INV1}' returning id::text$q$, 'err:cannot be deleted'),
    ('20 issued invoice lines cannot change', 'A_admin', $q$update public.invoice_items set amount = 1 where invoice_id = '{INV1}' returning id::text$q$, 'err:lines cannot be changed'),
    ('21 issued invoice cannot return to draft', 'A_admin', $q$update public.invoices set status = 'draft' where id = '{INV1}' returning id::text$q$, 'err:cannot return to draft'),
    -- duplicate guard while the original is live
    ('22 admin A opens a second draft', 'A_admin', $q$insert into public.invoices (org_id, client_id, client_name, invoice_number, subtotal, vat_registered, vat_rate, vat_amount, total, status) values ('{ORGA}','{CLIA}','ZZ Fixture Client A1',public.allocate_invoice_number('{ORGA}'),100,true,20,20,120,'draft') returning id::text$q$, 'save:INV2'),
    ('23 J1 cannot go on a second live invoice', 'A_admin', $q$insert into public.invoice_items (invoice_id, job_id, description, quantity, unit_price, amount, sort_order) values ('{INV2}','{J1}','dup',1,100,100,0) returning id::text$q$, 'err:JOB_ALREADY_INVOICED|duplicate key'),
    -- credit note
    ('24 cancelling needs a reason', 'A_admin', $q$select public.cancel_invoice('{INV1}','  ')::text$q$, 'err:reason is required'),
    ('25 admin A cancels the issued invoice', 'A_admin', $q$select public.cancel_invoice('{INV1}','Wrong price')::text$q$, 'save:CN1'),
    ('26 credit note mirrors the invoice, negated, issued', 'A_admin', $q$select concat_ws('|', document_type, status, total, vat_amount, subtotal, credits_invoice_id = '{INV1}', sent_at is not null) from public.invoices where id = '{CN1}'$q$, 'val:credit_note|sent|-120.00|-20.00|-100.00|t|t'),
    ('27 original is cancelled with the reason', 'A_admin', $q$select concat_ws('|', status, cancel_reason, cancelled_at is not null) from public.invoices where id = '{INV1}'$q$, 'val:cancelled|Wrong price|t'),
    ('28 original lines are voided', 'A_admin', $q$select bool_and(voided)::text from public.invoice_items where invoice_id = '{INV1}'$q$, 'val:true'),
    ('29 cannot cancel twice', 'A_admin', $q$select public.cancel_invoice('{INV1}','again')::text$q$, 'err:already cancelled'),
    ('30 a credit note cannot be cancelled', 'A_admin', $q$select public.cancel_invoice('{CN1}','x')::text$q$, 'err:credit note cannot be cancelled'),
    ('31 cancelled invoice cannot be reopened', 'A_admin', $q$update public.invoices set status = 'sent' where id = '{INV1}' returning id::text$q$, 'err:cannot be reopened'),
    ('32 credit note amounts cannot change', 'A_admin', $q$update public.invoices set total = 0 where id = '{CN1}' returning id::text$q$, 'err:cannot be changed'),
    ('33 credit note cannot be deleted', 'A_admin', $q$delete from public.invoices where id = '{CN1}' returning id::text$q$, 'err:cannot be deleted'),
    ('34 at most one credit note per invoice', 'A_admin', $q$insert into public.invoices (org_id, client_id, client_name, invoice_number, document_type, credits_invoice_id, subtotal, total, status) values ('{ORGA}','{CLIA}','x','ZZ-CN-DUP','credit_note','{INV1}',-100,-120,'draft') returning id::text$q$, 'err:duplicate key|one_credit_note'),
    ('35 admin B cannot see org A credit note', 'B_admin', $q$select count(*)::text from public.invoices where id = '{CN1}'$q$, 'val:0'),
    ('36 portal client A sees the credit note, linked to the original', 'A_client', $q$select concat_ws('|', public.portal_get_invoice('{CN1}')->>'document_type', public.portal_get_invoice('{CN1}')->>'credits_invoice_number' = '{NUM1}', public.portal_list_invoices() @> jsonb_build_array(jsonb_build_object('id','{CN1}')))$q$, 'val:credit_note|t|t'),
    ('37 portal client B does not list it', 'B_client', $q$select (public.portal_list_invoices() @> jsonb_build_array(jsonb_build_object('id','{CN1}')))::text$q$, 'val:false'),
    ('37a portal client B cannot open it', 'B_client', $q$select public.portal_get_invoice('{CN1}')::text$q$, 'err:NOT_FOUND'),
    ('37b portal users cannot read the invoices table directly', 'A_client', $q$select count(*)::text from public.invoices where id in ('{INV1}','{CN1}')$q$, 'val:0'),
    -- revised invoice
    ('38 J1 can go on a revised invoice after the credit', 'A_admin', $q$insert into public.invoice_items (invoice_id, job_id, description, quantity, unit_price, amount, sort_order) values ('{INV2}','{J1}','ZZ test move (revised)',1,100,100,0) returning id::text$q$, 'ok'),
    ('39 revised invoice is issued', 'A_admin', $q$update public.invoices set status = 'sent', sent_at = now() where id = '{INV2}' returning status$q$, 'val:sent'),
    ('40 cancelling the revision issues the next credit number', 'A_admin', $q$select public.cancel_invoice('{INV2}','second correction')::text$q$, 'save:CN2'),
    ('41 credit note numbers are distinct and sequential', 'A_admin', $q$select (regexp_replace(b.invoice_number,'\D','','g')::bigint - regexp_replace(a.invoice_number,'\D','','g')::bigint)::text from public.invoices a, public.invoices b where a.id = '{CN1}' and b.id = '{CN2}'$q$, 'val:1'),
    ('42 credit note numbers do not reuse the invoice series', 'A_admin', $q$select (count(distinct invoice_number) = 4)::text from public.invoices where id in ('{INV1}','{INV2}','{CN1}','{CN2}')$q$, 'val:true'),
    -- draft cancellation
    ('43 admin A drafts an invoice for J2', 'A_admin', $q$insert into public.invoices (org_id, client_id, client_name, invoice_number, job_id, subtotal, total, status) values ('{ORGA}','{CLIA}','ZZ Fixture Client A1',public.allocate_invoice_number('{ORGA}'),'{J2}',50,50,'draft') returning id::text$q$, 'save:INV3'),
    ('44 cancelling a draft raises no credit note', 'A_admin', $q$select coalesce(public.cancel_invoice('{INV3}','not needed')::text, 'no-credit-note')$q$, 'val:no-credit-note'),
    ('45 J2 is invoiceable again after draft cancel', 'A_admin', $q$insert into public.invoices (org_id, client_id, client_name, invoice_number, job_id, subtotal, total, status) values ('{ORGA}','{CLIA}','ZZ Fixture Client A1',public.allocate_invoice_number('{ORGA}'),'{J2}',50,50,'draft') returning id::text$q$, 'ok'),
    ('45b an aborted job with an unapproved fee cannot be invoiced', 'A_admin', $q$insert into public.invoices (org_id, client_id, client_name, invoice_number, job_id, subtotal, total, status) select '{ORGA}','{CLIA}','ZZ Fixture Client A1',public.allocate_invoice_number('{ORGA}'), j.id, 50, 50, 'draft' from public.jobs j where j.org_id = '{ORGA}' and j.status = 'aborted' and not exists (select 1 from public.job_aborts a where a.job_id = j.id and a.finance_status = 'approved') limit 1 returning id::text$q$, 'err:ABORT_NOT_APPROVED'),
    -- super admin
    ('46 super admin sees org A credit notes', 'SUPER', $q$select count(*)::text from public.invoices where id in ('{CN1}','{CN2}')$q$, 'val:2')
    ) AS t(name, actor, sql, expect)
  LOOP
    q := step.sql;
    FOR k IN SELECT jsonb_object_keys(tokens) LOOP
      q := replace(q, '{' || k || '}', tokens->>k);
    END LOOP;
    expect := step.expect; v := NULL; detail := NULL;
    BEGIN
      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', users->>step.actor, 'role', 'authenticated')::text, true);
      PERFORM set_config('request.jwt.claim.sub', users->>step.actor, true);
      PERFORM set_config('role', 'authenticated', true);
      EXECUTE q INTO v;
      PERFORM set_config('role', 'none', true);
      IF expect LIKE 'err:%' THEN ok := false; detail := 'succeeded, expected error ~ ' || substr(expect, 5) || ' (got ' || coalesce(v, 'null') || ')';
      ELSIF expect LIKE 'val:%' THEN ok := v IS NOT DISTINCT FROM substr(expect, 5); detail := 'got ' || coalesce(v, 'null');
      ELSE ok := v IS NOT NULL; detail := 'returned null (0 rows: RLS?)';
      END IF;
      IF ok AND expect LIKE 'save:%' THEN tokens := tokens || jsonb_build_object(substr(expect, 6), v); END IF;
    EXCEPTION WHEN others THEN
      ok := expect LIKE 'err:%' AND SQLERRM ~* substr(expect, 5);
      detail := 'error: ' || SQLERRM;
    END;
    PERFORM set_config('role', 'none', true);
    PERFORM set_config('request.jwt.claims', '', true);
    PERFORM set_config('request.jwt.claim.sub', '', true);
    IF ok THEN passed := passed + 1; results := results || ('PASS ' || step.name);
    ELSE failed := failed + 1; results := results || ('FAIL ' || step.name || ': ' || detail);
    END IF;
  END LOOP;

  RAISE EXCEPTION USING MESSAGE = format('STAGING_INVOICE_REGRESSION passed=%s failed=%s | %s',
    passed, failed, array_to_string(results, ' | '));
END
$regression$;
