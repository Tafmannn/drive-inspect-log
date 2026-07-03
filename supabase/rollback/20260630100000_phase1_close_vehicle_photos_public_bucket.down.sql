-- =====================================================================
-- ROLLBACK for 20260630100000_phase1_close_vehicle_photos_public_bucket
-- =====================================================================
-- Restores the pre-migration state: public bucket + permissive policies.
--
-- WARNING: applying this rollback re-opens the public read/upload/update/delete
-- exposure on customer photos. Use ONLY to revert a bad deploy, and re-apply the
-- forward migration as soon as possible. The client read-path change
-- (src/lib/vehiclePhotoUrl.ts) is backwards-compatible with a public bucket —
-- signed URLs still work against a public bucket — so no client rollback is
-- required alongside this.
-- =====================================================================

-- Drop the org-scoped policies added by the forward migration.
DROP POLICY IF EXISTS "vehicle_photos_select_org" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_photos_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_photos_update_org" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_photos_delete_org" ON storage.objects;

-- Restore the original permissive policies (recreated verbatim).
CREATE POLICY "Allow public read vehicle-photos"   ON storage.objects FOR SELECT USING (bucket_id = 'vehicle-photos');
CREATE POLICY "Allow public upload vehicle-photos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vehicle-photos');
CREATE POLICY "Allow public update vehicle-photos" ON storage.objects FOR UPDATE USING (bucket_id = 'vehicle-photos');
CREATE POLICY "Allow public delete vehicle-photos" ON storage.objects FOR DELETE USING (bucket_id = 'vehicle-photos');

-- Restore public bucket flag.
UPDATE storage.buckets SET public = true WHERE id = 'vehicle-photos';
