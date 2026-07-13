-- =====================================================================
-- SECURITY-005: invoices writes must be admin-only
-- =====================================================================
-- DEFECT: same shape as SECURITY-001 (driver_onboarding) and SECURITY-003
--   (clients/invoice_items). The `invoices` table has never had a
--   CREATE TABLE or RLS-policy migration anywhere in tracked history — only
--   an ALTER TABLE ... ADD COLUMN (20260323222553) — so its RLS was
--   "unknown from source" and explicitly flagged as an unverified area in
--   the prior audit (docs/audits/FULL_UI_WORKFLOW_AUDIT.md, Remaining
--   Risk #2). Live inspection (this migration's authoring session) found a
--   single FOR ALL policy scoped only by org_id — production names it
--   "Org admins can manage invoices" (a misleading name: it is NOT
--   admin-gated, only org-gated), staging names the same-shaped policy
--   "Org members can manage invoices". Both have the identical
--   USING/WITH CHECK: is_super_admin() OR org_id = user_org_id() — no
--   admin check at all. Confirmed exploitable live: a non-admin driver
--   directly UPDATEd an invoice's total and status ('paid') with no error.
--   Every real write path (InvoiceGenerator.tsx, createInvoice.ts,
--   useInvoicePrepData.ts) is admin-only in practice (ControlRoute/
--   AdminRoute gated).
--
-- FIX: split the single FOR ALL policy into SELECT (unchanged — any org
--   member, matching current read behaviour and avoiding any risk of
--   breaking an unreviewed read path) and INSERT/UPDATE/DELETE (admin/
--   super-admin only, org-scoped for admins). No legitimate call path is
--   affected. Drops both known policy names since production and staging
--   have diverged in naming for what is otherwise the identical policy.
-- =====================================================================

DROP POLICY IF EXISTS "Org admins can manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "Org members can manage invoices" ON public.invoices;

CREATE POLICY "invoices_select"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (is_super_admin() OR org_id = user_org_id());

CREATE POLICY "invoices_insert_admin"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin() OR (org_id = user_org_id() AND is_admin_or_super_admin()));

CREATE POLICY "invoices_update_admin"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id() AND is_admin_or_super_admin()))
  WITH CHECK (is_super_admin() OR (org_id = user_org_id() AND is_admin_or_super_admin()));

CREATE POLICY "invoices_delete_admin"
  ON public.invoices FOR DELETE
  TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id() AND is_admin_or_super_admin()));
