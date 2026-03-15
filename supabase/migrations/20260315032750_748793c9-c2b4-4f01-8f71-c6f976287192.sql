
-- G: Make vehicle-signatures bucket private
UPDATE storage.buckets SET public = false WHERE id = 'vehicle-signatures';

-- Add RLS policy so authenticated users within same org can read signatures
-- Signatures are stored with path: jobs/{jobId}/signatures/{type}/{role}
-- We allow read if the user has access to the related job's org
CREATE POLICY "Authenticated users can read org signatures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'vehicle-signatures'
  AND (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.org_id = public.user_org_id()
      AND storage.objects.name LIKE 'jobs/' || j.id::text || '/%'
    )
  )
);

-- Allow authenticated users to upload signatures
CREATE POLICY "Authenticated users can upload signatures"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'vehicle-signatures'
);
