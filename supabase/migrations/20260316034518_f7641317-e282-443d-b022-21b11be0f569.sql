
-- Fix organisations RLS: "Users can read their organisation" currently reads
-- org_id from JWT root which doesn't exist in standard Supabase JWTs.
-- Must read from app_metadata/user_metadata like user_org_id() does.

DROP POLICY IF EXISTS "Users can read their organisation" ON public.organisations;

CREATE POLICY "Users can read their organisation"
ON public.organisations
FOR SELECT
TO authenticated
USING (
  id = user_org_id()
  OR is_super_admin()
);
