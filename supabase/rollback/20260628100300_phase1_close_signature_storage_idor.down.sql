-- Rollback for 20260628100300_phase1_close_signature_storage_idor
-- Restores the previous (permissive) vehicle-signatures policies.
-- NOTE: this re-opens the cross-org signature read IDOR — only use if the
-- org-scoped policies break a legitimate signature capture/display flow that
-- cannot be fixed by correcting the job's org data.

DROP POLICY IF EXISTS "vehicle_signatures_insert_org" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_signatures_update_org" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_signatures_delete_org" ON storage.objects;

-- Restore the permissive bucket-only INSERT policy (from 20260315032750).
CREATE POLICY "Authenticated users can upload signatures"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vehicle-signatures');

-- Restore the original fully-permissive policies (from 20260225231715).
CREATE POLICY "Allow public read vehicle-signatures"
  ON storage.objects FOR SELECT USING (bucket_id = 'vehicle-signatures');
CREATE POLICY "Allow public upload vehicle-signatures"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vehicle-signatures');
CREATE POLICY "Allow public update vehicle-signatures"
  ON storage.objects FOR UPDATE USING (bucket_id = 'vehicle-signatures');
CREATE POLICY "Allow public delete vehicle-signatures"
  ON storage.objects FOR DELETE USING (bucket_id = 'vehicle-signatures');
