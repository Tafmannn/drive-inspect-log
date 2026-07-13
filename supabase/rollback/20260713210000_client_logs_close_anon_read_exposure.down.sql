-- Rollback for 20260713210000_client_logs_close_anon_read_exposure.sql
-- Restores the original two policies exactly as created in
-- 20260301095617_79cc0317-c907-44b1-a3cb-d848bac22089.sql and
-- 20260316204833_8ec7e2ea-9135-4983-85f6-df5914eb8173.sql.

DROP POLICY IF EXISTS "client_logs_select_admin" ON public.client_logs;

CREATE POLICY "Allow select for anon on client_logs"
  ON public.client_logs
  FOR SELECT
  USING (true);

CREATE POLICY "Org admins can read own org client_logs"
  ON public.client_logs
  FOR SELECT
  TO authenticated
  USING (
    (context->>'org_id')::uuid = user_org_id()
  );
