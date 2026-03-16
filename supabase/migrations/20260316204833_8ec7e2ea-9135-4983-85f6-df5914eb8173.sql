-- Allow org admins to read client_logs rows that belong to their org
-- (via context->>'org_id'). Super admins retain global visibility via existing policy.
-- Rows without context.org_id remain invisible to org admins (correct: no provenance).
CREATE POLICY "Org admins can read own org client_logs"
  ON public.client_logs
  FOR SELECT
  TO authenticated
  USING (
    (context->>'org_id')::uuid = user_org_id()
  );