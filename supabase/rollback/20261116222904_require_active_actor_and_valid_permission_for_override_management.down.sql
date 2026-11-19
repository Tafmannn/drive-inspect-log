-- Rollback for 20261116222904_require_active_actor_and_valid_permission_for_override_management.sql.
-- BEST-EFFORT RECONSTRUCTION, NOT A RESTORED ORIGINAL. The function's body
-- before this migration is not recorded in the repo or in production's migration
-- history (the function predates tracked migrations), so it cannot be restored
-- verbatim. This removes the two checks the migration added (actor account must
-- be 'active'; permission key must exist in permissions_catalog) and keeps every
-- other rule unchanged. Running it WEAKENS permission-override management:
-- review it against a backup of the previous definition before use.
-- Same signature, SECURITY DEFINER and search_path, so grants are unaffected.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_actor_manage_permission(p_actor_user_id uuid, p_target_user_id uuid, p_permission_key text, p_grant_type text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
declare
 actor_role text; actor_org uuid;
 target_org uuid; target_role text; permission_sensitive boolean;
begin
 if p_grant_type not in ('allow','deny') then return false; end if;
 select up.role,up.org_id into actor_role,actor_org
 from public.user_profiles up where up.auth_user_id=p_actor_user_id;
 select up.role,up.org_id into target_role,target_org
 from public.user_profiles up where up.auth_user_id=p_target_user_id;
 if actor_role is null or target_role is null then return false; end if;
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

COMMIT;
