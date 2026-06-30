-- Rollback for 20260629100100_photos_server_side_links_and_org
-- Restores the prior single FOR ALL photos policy and drops the triggers.
-- The additive photos.damage_item_id column is left in place (harmless).
-- NOTE: reverting re-introduces V9 (client-tagged org) and V6 (best-effort link).

DROP TRIGGER IF EXISTS trg_photos_set_org ON public.photos;
DROP TRIGGER IF EXISTS trg_photos_sync_damage ON public.photos;
DROP FUNCTION IF EXISTS public.set_photo_org_from_job();
DROP FUNCTION IF EXISTS public.sync_damage_photo_url();

DROP POLICY IF EXISTS "photos_select_org" ON public.photos;
DROP POLICY IF EXISTS "photos_insert_job_org" ON public.photos;
DROP POLICY IF EXISTS "photos_update_org" ON public.photos;
DROP POLICY IF EXISTS "photos_delete_org" ON public.photos;

CREATE POLICY "Org members can manage photos"
ON public.photos FOR ALL
USING (public.is_super_admin() OR org_id = public.user_org_id())
WITH CHECK (public.is_super_admin() OR org_id = public.user_org_id());
