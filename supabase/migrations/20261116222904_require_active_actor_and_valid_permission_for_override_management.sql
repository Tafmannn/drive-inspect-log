-- Version 20261116222904 as recorded in production's migration history (SQL
-- reproduced verbatim). This migration existed in production but had no file in
-- the repo. can_actor_manage_permission() now refuses (a) an actor whose account
-- is not active and (b) a permission key that is not in permissions_catalog.
-- NOTE: the function's original CREATE is not in the repo or in production's
-- recorded history (it predates tracked migrations), so a from-scratch build of
-- this repo still cannot create it before 20260716192611 revokes on it.
create or replace function public.can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text)
returns boolean language plpgsql stable security definer set search_path = public
as $$
declare
 actor_role text; actor_org uuid; actor_status text;
 target_org uuid; target_role text; permission_sensitive boolean;
begin
 if p_grant_type not in ('allow','deny') then return false; end if;
 select up.role,up.org_id,up.account_status into actor_role,actor_org,actor_status
 from public.user_profiles up where up.auth_user_id=p_actor_user_id;
 select up.role,up.org_id into target_role,target_org
 from public.user_profiles up where up.auth_user_id=p_target_user_id;
 if actor_role is null or target_role is null or actor_status is distinct from 'active' then return false; end if;
 if not exists(select 1 from public.permissions_catalog where key=p_permission_key) then return false; end if;
 if actor_role='super_admin' then return true; end if;
 if actor_role <> 'admin' then return false; end if;
 if actor_org is distinct from target_org then return false; end if;
 if target_role='super_admin' then return false; end if;
 if p_permission_key='platform.super_admin' then return false; end if;
 select pc.is_sensitive into permission_sensitive from public.permissions_catalog pc where pc.key=p_permission_key;
 if not public.user_has_permission(p_actor_user_id,p_permission_key) then return false; end if;
 if permission_sensitive and p_permission_key in ('users.manage_permissions','users.manage_admins') then return false; end if;
 return true;
end;
$$;
