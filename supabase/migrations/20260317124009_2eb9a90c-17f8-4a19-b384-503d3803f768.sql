
-- Fix 1: Remove SECURITY DEFINER from the view by recreating it as a regular view
-- Views are already SECURITY INVOKER by default, but the linter flagged it
-- because it references security definer functions. Let's ensure it's INVOKER.
drop view if exists public.active_driver_profiles;
create view public.active_driver_profiles as
select dp.*
from public.driver_profiles dp
join public.user_profiles up
  on up.auth_user_id = dp.user_id
where coalesce(dp.is_active, true) = true
  and dp.archived_at is null
  and up.role = 'driver'
  and up.account_status = 'active';

-- Fix 2: Add search_path to set_updated_at function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
