-- Version 20261103003017 as recorded in production's migration history.
-- The repo previously carried this as section 8 of the client_portal file;
-- it is split out here so repo and production list the same versions.
-- ── 8. Auto-link jobs to clients within the job's own org only ─────────
-- This trigger matched clients by company name across EVERY organisation,
-- so a job could be linked to another operator's same-named client. With a
-- client portal keyed on jobs.client_id, that would have been a cross-tenant
-- leak (the portal functions independently also require job.org_id =
-- client.org_id, so it is blocked twice). No mis-links existed when fixed.
CREATE OR REPLACE FUNCTION public.auto_link_job_to_client()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  matched_client_id uuid;
begin
  if new.client_id is not null then
    return new;
  end if;

  if coalesce(trim(new.client_name), '') = '' then
    return new;
  end if;

  -- Only ever link to a client in the job's own organisation.
  select c.id
  into matched_client_id
  from clients c
  where c.org_id = new.org_id
    and normalize_client_name(c.company) = normalize_client_name(new.client_name)
  order by c.created_at asc
  limit 1;

  if matched_client_id is not null then
    new.client_id := matched_client_id;
  end if;

  return new;
end;
$function$;
