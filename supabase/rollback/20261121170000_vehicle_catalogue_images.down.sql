-- Rollback for 20261121170000_vehicle_catalogue_images.sql
-- Run 20261121170100_job_catalogue_image_matching.down.sql first.
--
-- The `vehicle-images` bucket is NOT deleted here: Supabase blocks direct deletes
-- from storage tables, and it may hold uploaded artwork. Empty and delete it in
-- the dashboard (Storage -> vehicle-images) if it is no longer wanted.

DROP POLICY IF EXISTS "vehicle-images super admin read" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-images super admin insert" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-images super admin update" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-images super admin delete" ON storage.objects;

DROP FUNCTION IF EXISTS public.get_vehicle_catalogue_image(text, text, int, text);

DROP POLICY IF EXISTS "catalogue images readable by signed-in users" ON public.vehicle_catalogue_images;
DROP POLICY IF EXISTS "catalogue images insert by super admin" ON public.vehicle_catalogue_images;
DROP POLICY IF EXISTS "catalogue images update by super admin" ON public.vehicle_catalogue_images;
DROP POLICY IF EXISTS "catalogue images delete by super admin" ON public.vehicle_catalogue_images;
DROP TABLE IF EXISTS public.vehicle_catalogue_images;

-- btree_gist is left installed; other objects may rely on it.
