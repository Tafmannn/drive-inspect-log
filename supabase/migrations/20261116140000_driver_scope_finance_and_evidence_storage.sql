-- Driver lockdown, part 2: money data and evidence files.
--
-- Before this migration every signed-in user in an org (drivers included)
-- could read every invoice, invoice line, pricing snapshot, client record,
-- expense and receipt in the org, could edit or delete any expense, and could
-- read, overwrite or delete any job's photos/signatures in storage.
--
-- After:
--   * invoices, invoice_items, invoice_expenses, pricing_snapshots, clients:
--     readable by admins / super-admins only. (The client portal reads its
--     own invoices through SECURITY DEFINER portal_* functions and its own
--     invoice-pdfs policy, which are unchanged.)
--   * expenses / expense_receipts: drivers see and manage only expenses on
--     jobs assigned to them, and cannot edit or delete an expense that is on
--     a (non-voided) invoice. Admins unchanged.
--   * storage: invoice-pdfs admin-only (portal policy unchanged);
--     expense-receipts scoped like expenses; vehicle-photos and
--     vehicle-signatures readable/writable by drivers only for their own jobs
--     that are not completed (same rule as the evidence tables in
--     20261116120000_driver_read_scope_own_jobs.sql).
--
-- Every CREATE POLICY is preceded by DROP POLICY IF EXISTS of the same name,
-- so this file can be re-run.

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so they can look through jobs/expenses/invoice_expenses
-- without recursing into (or being blocked by) those tables' own policies.

-- The current driver is assigned to this job (any status).
CREATE OR REPLACE FUNCTION public.driver_owns_job(p_job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.jobs j
    JOIN public.driver_profiles dp ON dp.id = j.driver_id
    WHERE j.id = p_job_id
      AND dp.user_id = auth.uid()
      AND j.org_id = public.user_org_id()
  )
$$;

-- The current driver owns the job this expense belongs to. Takes text so it
-- can be fed a storage path segment without a failing ::uuid cast.
CREATE OR REPLACE FUNCTION public.driver_can_access_expense(p_expense_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.expenses e
    WHERE e.id::text = p_expense_id
      AND public.driver_owns_job(e.job_id)
  )
$$;

-- The expense is on an invoice that has not been voided.
CREATE OR REPLACE FUNCTION public.expense_is_invoiced(p_expense_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoice_expenses ie
    WHERE ie.expense_id = p_expense_id AND NOT ie.voided
  )
$$;

-- Storage object path jobs/<jobId>/... belongs to one of the current driver's
-- jobs that is not completed.
CREATE OR REPLACE FUNCTION public.driver_can_use_job_path(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT split_part(p_name, '/', 1) = 'jobs'
     AND EXISTS (
       SELECT 1
       FROM public.jobs j
       JOIN public.driver_profiles dp ON dp.id = j.driver_id
       WHERE j.id::text = split_part(p_name, '/', 2)
         AND dp.user_id = auth.uid()
         AND j.status <> 'completed'
     )
$$;

REVOKE ALL ON FUNCTION public.driver_owns_job(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_can_access_expense(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_is_invoiced(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_can_use_job_path(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_owns_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_can_access_expense(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expense_is_invoiced(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_can_use_job_path(text) TO authenticated;

-- ── invoices / invoice_items / invoice_expenses: admin-only reads ──────────

DROP POLICY IF EXISTS "invoices_select" ON public.invoices;
CREATE POLICY "invoices_select" ON public.invoices
  FOR SELECT TO authenticated
  USING (is_super_admin() OR ((org_id = user_org_id()) AND is_admin_or_super_admin()));

DROP POLICY IF EXISTS "invoice_items_select" ON public.invoice_items;
CREATE POLICY "invoice_items_select" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin_or_super_admin() AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id())));

DROP POLICY IF EXISTS "invoice_expenses_select" ON public.invoice_expenses;
CREATE POLICY "invoice_expenses_select" ON public.invoice_expenses
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin_or_super_admin() AND EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_expenses.invoice_id AND i.org_id = user_org_id())));

-- ── pricing_snapshots / clients: admin-only reads ──────────────────────────

DROP POLICY IF EXISTS "Org members can view pricing_snapshots" ON public.pricing_snapshots;
DROP POLICY IF EXISTS "pricing_snapshots_select_admin" ON public.pricing_snapshots;
CREATE POLICY "pricing_snapshots_select_admin" ON public.pricing_snapshots
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (is_admin_or_super_admin() AND (org_id = user_org_id())));

DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients
  FOR SELECT TO authenticated
  USING (is_super_admin() OR ((org_id = user_org_id()) AND is_admin_or_super_admin()));

-- ── expenses: drivers limited to their own jobs; invoiced = locked ─────────

DROP POLICY IF EXISTS "Org members can manage expenses" ON public.expenses;

DROP POLICY IF EXISTS "expenses_select_scoped" ON public.expenses;
CREATE POLICY "expenses_select_scoped" ON public.expenses
  FOR SELECT TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id() AND (is_admin_or_super_admin() OR driver_owns_job(job_id))));

DROP POLICY IF EXISTS "expenses_insert_scoped" ON public.expenses;
CREATE POLICY "expenses_insert_scoped" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR (org_id = user_org_id() AND (is_admin_or_super_admin() OR driver_owns_job(job_id))));

DROP POLICY IF EXISTS "expenses_update_scoped" ON public.expenses;
CREATE POLICY "expenses_update_scoped" ON public.expenses
  FOR UPDATE TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id() AND (
    is_admin_or_super_admin() OR (driver_owns_job(job_id) AND NOT expense_is_invoiced(id)))))
  WITH CHECK (is_super_admin() OR (org_id = user_org_id() AND (is_admin_or_super_admin() OR driver_owns_job(job_id))));

DROP POLICY IF EXISTS "expenses_delete_scoped" ON public.expenses;
CREATE POLICY "expenses_delete_scoped" ON public.expenses
  FOR DELETE TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id() AND (
    is_admin_or_super_admin() OR (driver_owns_job(job_id) AND NOT expense_is_invoiced(id)))));

-- ── expense_receipts: follow the parent expense ────────────────────────────

DROP POLICY IF EXISTS "Org members can manage expense_receipts" ON public.expense_receipts;

DROP POLICY IF EXISTS "expense_receipts_select_scoped" ON public.expense_receipts;
CREATE POLICY "expense_receipts_select_scoped" ON public.expense_receipts
  FOR SELECT TO authenticated
  USING (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (
          SELECT 1 FROM public.expenses e
          WHERE e.id = expense_receipts.expense_id AND e.org_id = user_org_id()))
    OR driver_can_access_expense(expense_id::text));

DROP POLICY IF EXISTS "expense_receipts_insert_scoped" ON public.expense_receipts;
CREATE POLICY "expense_receipts_insert_scoped" ON public.expense_receipts
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (
          SELECT 1 FROM public.expenses e
          WHERE e.id = expense_receipts.expense_id AND e.org_id = user_org_id()))
    OR driver_can_access_expense(expense_id::text));

DROP POLICY IF EXISTS "expense_receipts_update_scoped" ON public.expense_receipts;
CREATE POLICY "expense_receipts_update_scoped" ON public.expense_receipts
  FOR UPDATE TO authenticated
  USING (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (
          SELECT 1 FROM public.expenses e
          WHERE e.id = expense_receipts.expense_id AND e.org_id = user_org_id()))
    OR (driver_can_access_expense(expense_id::text) AND NOT expense_is_invoiced(expense_id)))
  WITH CHECK (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (
          SELECT 1 FROM public.expenses e
          WHERE e.id = expense_receipts.expense_id AND e.org_id = user_org_id()))
    OR driver_can_access_expense(expense_id::text));

DROP POLICY IF EXISTS "expense_receipts_delete_scoped" ON public.expense_receipts;
CREATE POLICY "expense_receipts_delete_scoped" ON public.expense_receipts
  FOR DELETE TO authenticated
  USING (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (
          SELECT 1 FROM public.expenses e
          WHERE e.id = expense_receipts.expense_id AND e.org_id = user_org_id()))
    OR (driver_can_access_expense(expense_id::text) AND NOT expense_is_invoiced(expense_id)));

-- ── storage: invoice-pdfs admin-only (portal policy untouched) ─────────────

DROP POLICY IF EXISTS "invoice_pdfs_select_org" ON storage.objects;
CREATE POLICY "invoice_pdfs_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND split_part(name, '/', 1) = (user_org_id())::text)));

DROP POLICY IF EXISTS "invoice_pdfs_insert_org" ON storage.objects;
CREATE POLICY "invoice_pdfs_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-pdfs' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND split_part(name, '/', 1) = (user_org_id())::text)));

DROP POLICY IF EXISTS "invoice_pdfs_update_org" ON storage.objects;
CREATE POLICY "invoice_pdfs_update_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND split_part(name, '/', 1) = (user_org_id())::text)))
  WITH CHECK (bucket_id = 'invoice-pdfs' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND split_part(name, '/', 1) = (user_org_id())::text)));

DROP POLICY IF EXISTS "invoice_pdfs_delete_org" ON storage.objects;
CREATE POLICY "invoice_pdfs_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND split_part(name, '/', 1) = (user_org_id())::text)));

-- ── storage: expense-receipts bucket (path <expenseId>/...) ────────────────

DROP POLICY IF EXISTS "expense_receipts_select_org" ON storage.objects;
CREATE POLICY "expense_receipts_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (
          SELECT 1 FROM public.expenses e
          WHERE e.id::text = split_part(objects.name, '/', 1) AND e.org_id = user_org_id()))
    OR driver_can_access_expense(split_part(name, '/', 1))));

DROP POLICY IF EXISTS "expense_receipts_insert_org" ON storage.objects;
CREATE POLICY "expense_receipts_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (
          SELECT 1 FROM public.expenses e
          WHERE e.id::text = split_part(objects.name, '/', 1) AND e.org_id = user_org_id()))
    OR driver_can_access_expense(split_part(name, '/', 1))));

DROP POLICY IF EXISTS "expense_receipts_delete_org" ON storage.objects;
CREATE POLICY "expense_receipts_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (
          SELECT 1 FROM public.expenses e
          WHERE e.id::text = split_part(objects.name, '/', 1) AND e.org_id = user_org_id()))
    OR driver_can_access_expense(split_part(name, '/', 1))));

-- ── storage: vehicle-photos (jobs/<jobId>/..., expense-receipts/<id>/...) ──

DROP POLICY IF EXISTS "vehicle_photos_select_org" ON storage.objects;
CREATE POLICY "vehicle_photos_select_org" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-photos' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND (
          EXISTS (SELECT 1 FROM public.jobs j
                  WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%'))
       OR EXISTS (SELECT 1 FROM public.expenses e
                  WHERE e.org_id = user_org_id() AND objects.name LIKE ('expense-receipts/' || e.id::text || '/%'))))
    OR driver_can_use_job_path(name)
    OR (split_part(name, '/', 1) = 'expense-receipts' AND driver_can_access_expense(split_part(name, '/', 2)))));

DROP POLICY IF EXISTS "vehicle_photos_insert_org" ON storage.objects;
CREATE POLICY "vehicle_photos_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-photos' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (SELECT 1 FROM public.jobs j
          WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%')))
    OR driver_can_use_job_path(name)));

DROP POLICY IF EXISTS "vehicle_photos_update_org" ON storage.objects;
CREATE POLICY "vehicle_photos_update_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-photos' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (SELECT 1 FROM public.jobs j
          WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%')))
    OR driver_can_use_job_path(name)))
  WITH CHECK (bucket_id = 'vehicle-photos' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (SELECT 1 FROM public.jobs j
          WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%')))
    OR driver_can_use_job_path(name)));

DROP POLICY IF EXISTS "vehicle_photos_delete_org" ON storage.objects;
CREATE POLICY "vehicle_photos_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-photos' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (SELECT 1 FROM public.jobs j
          WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%')))
    OR driver_can_use_job_path(name)));

-- ── storage: vehicle-signatures (jobs/<jobId>/signatures/...) ──────────────

DROP POLICY IF EXISTS "Authenticated users can read org signatures" ON storage.objects;
CREATE POLICY "Authenticated users can read org signatures" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vehicle-signatures' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (SELECT 1 FROM public.jobs j
          WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%')))
    OR driver_can_use_job_path(name)));

DROP POLICY IF EXISTS "vehicle_signatures_insert_org" ON storage.objects;
CREATE POLICY "vehicle_signatures_insert_org" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vehicle-signatures' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (SELECT 1 FROM public.jobs j
          WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%')))
    OR driver_can_use_job_path(name)));

DROP POLICY IF EXISTS "vehicle_signatures_update_org" ON storage.objects;
CREATE POLICY "vehicle_signatures_update_org" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vehicle-signatures' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (SELECT 1 FROM public.jobs j
          WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%')))
    OR driver_can_use_job_path(name)))
  WITH CHECK (bucket_id = 'vehicle-signatures' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (SELECT 1 FROM public.jobs j
          WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%')))
    OR driver_can_use_job_path(name)));

DROP POLICY IF EXISTS "vehicle_signatures_delete_org" ON storage.objects;
CREATE POLICY "vehicle_signatures_delete_org" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vehicle-signatures' AND (is_super_admin()
    OR (is_admin_or_super_admin() AND EXISTS (SELECT 1 FROM public.jobs j
          WHERE j.org_id = user_org_id() AND objects.name LIKE ('jobs/' || j.id::text || '/%')))
    OR driver_can_use_job_path(name)));
