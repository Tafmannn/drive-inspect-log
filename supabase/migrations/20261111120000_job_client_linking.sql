-- Make job → client linking actually work.
--
-- Found while linking jobs for the customer portal: only 5 of 72 jobs had a
-- client_id. Two causes:
--
--  1. auto_link_job_to_client() compared client COMPANY names against the
--     job's client_name — which holds the contact person ("Chris Ellsworth"),
--     while the company ("CJE Transport") is in client_company. It also only
--     fired on changes to client_name/client_id, never client_company.
--  2. linkJobToClient() (src/lib/clientApi.ts) never wrote client_id; it
--     relied on (1). Fixed in the frontend in the same change.
--
-- This migration:
--  a. Rewrites auto_link_job_to_client() to match the job's company (and a
--     company typed into the contact field, as older jobs did) against the
--     client's company/name in the job's own org; respects a deliberate
--     unlink; and guards that an explicitly set client_id belongs to the
--     job's org.
--  b. Re-points the trigger at client_company too (CREATE OR REPLACE
--     TRIGGER, no drop).
--  c. Adds link_jobs_to_client(job_ids, client_id) for the admin "Link jobs
--     to clients" screen: SECURITY INVOKER (RLS applies), admin-only,
--     atomic, links only jobs in the client's org.
--
-- Existing jobs are NOT relinked automatically: an admin confirms each
-- suggestion on the new screen.

-- a ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_link_job_to_client()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $function$
declare
  v_company text := normalize_client_name(new.client_company);
  v_contact text := normalize_client_name(new.client_name);
  v_client_org uuid;
  v_match uuid;
begin
  -- An explicitly chosen client must belong to the job's organisation.
  if new.client_id is not null
     and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    select c.org_id into v_client_org from clients c where c.id = new.client_id;
    if v_client_org is null or v_client_org is distinct from new.org_id then
      raise exception 'client % does not belong to this job''s organisation', new.client_id
        using errcode = '23514';
    end if;
    return new;
  end if;

  if new.client_id is not null then
    return new;
  end if;

  -- A deliberate unlink stays unlinked.
  if tg_op = 'UPDATE' and old.client_id is not null then
    return new;
  end if;

  if v_company = '' and v_contact = '' then
    return new;
  end if;

  -- Company field against the client's company or name; or a company typed
  -- into the contact field against the client's company. Never person-to-
  -- person: two contacts can share a name.
  select c.id
    into v_match
    from clients c
   where c.org_id = new.org_id
     and (
       (v_company <> '' and (normalize_client_name(c.company) = v_company
                             or normalize_client_name(c.name) = v_company))
       or (v_contact <> '' and normalize_client_name(c.company) = v_contact)
     )
   order by c.is_active desc, c.created_at asc
   limit 1;

  if v_match is not null then
    new.client_id := v_match;
  end if;

  return new;
end;
$function$;

-- b ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE TRIGGER trg_auto_link_job_to_client
  BEFORE INSERT OR UPDATE OF client_name, client_company, client_id
  ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_job_to_client();

-- c ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.link_jobs_to_client(p_job_ids uuid[], p_client_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public
AS $function$
declare
  v_client record;
  v_count integer;
begin
  if not public.is_admin_or_super_admin() then
    raise exception 'only admins can link jobs to clients' using errcode = '42501';
  end if;
  if p_client_id is null or p_job_ids is null or cardinality(p_job_ids) = 0 then
    return 0;
  end if;

  -- RLS on clients: the caller must be able to see the client.
  select c.id, c.org_id, c.name, c.company, c.email
    into v_client
    from clients c
   where c.id = p_client_id;
  if v_client.id is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  -- Same fields linkJobToClient() writes, so invoice prep matches too.
  update jobs j
     set client_id      = v_client.id,
         client_company = coalesce(nullif(trim(v_client.company), ''), v_client.name),
         client_name    = v_client.name,
         client_email   = v_client.email
   where j.id = any(p_job_ids)
     and j.org_id = v_client.org_id;
  get diagnostics v_count = row_count;

  -- Invoices for these jobs that have no client yet follow the job.
  update invoices i
     set client_id = v_client.id
   where i.client_id is null
     and i.org_id = v_client.org_id
     and (i.job_id = any(p_job_ids)
          or exists (select 1 from invoice_items it
                      where it.invoice_id = i.id and it.job_id = any(p_job_ids)));

  return v_count;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.link_jobs_to_client(uuid[], uuid) TO authenticated;
