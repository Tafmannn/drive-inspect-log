-- =====================================================================
-- SECURITY-003: clients and invoice_items writes must be admin-only
-- =====================================================================
-- DEFECT: same shape as SECURITY-001 (driver_onboarding). Both
--   "Org members can manage clients" (20260323222553) and "Org members
--   can manage invoice_items" (same file) are single FOR ALL policies
--   scoped only by org_id — they apply to SELECT *and*
--   INSERT/UPDATE/DELETE alike. Every write path in the app is
--   admin-only in practice:
--     - clients: created/edited/archived/restored only via
--       ClientFormModal.tsx / ControlClients.tsx, both reachable only
--       through /control/clients (ControlRoute — admin/super-admin only).
--     - invoice_items: written only via createInvoice.ts's
--       createMultiJobInvoice, reachable only through
--       /control/invoice-prep (same ControlRoute gate) and /invoice/new
--       (AdminRoute).
--   Nothing at the database layer enforced that. Any authenticated org
--   member (including a driver) could call
--   supabase.from('clients').insert(...)/.update(...)/.delete(...) or
--   supabase.from('invoice_items').insert(...)/.update(...)/.delete(...)
--   directly, fabricating or tampering with client billing profiles and
--   invoice line items/amounts — a driver could, for example, insert a
--   line item on an existing invoice or alter its amount.
--
-- FIX: split each FOR ALL policy into SELECT (unchanged — any org member,
--   matching current read behaviour and avoiding any risk of breaking an
--   unreviewed read path) and INSERT/UPDATE/DELETE (admin/super-admin
--   only, org-scoped for admins). No legitimate call path is affected.
--
-- NOTE: the `invoices` table itself has no CREATE TABLE or RLS policy
--   anywhere in this migration history (20260323222553 only extends it
--   with a nullable column) — its current RLS definition is not visible
--   from source and therefore cannot be safely modified here without
--   risking an incorrect guess at its existing policy names. Flagged as
--   an unverified area in the audit report; recommend a follow-up
--   migration once the live policy definition is confirmed.
-- =====================================================================

DROP POLICY IF EXISTS "Org members can manage clients" ON public.clients;

CREATE POLICY "clients_select"
  ON public.clients FOR SELECT
  TO authenticated
  USING (is_super_admin() OR org_id = user_org_id());

CREATE POLICY "clients_insert_admin"
  ON public.clients FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin() OR (org_id = user_org_id() AND is_admin_or_super_admin()));

CREATE POLICY "clients_update_admin"
  ON public.clients FOR UPDATE
  TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id() AND is_admin_or_super_admin()))
  WITH CHECK (is_super_admin() OR (org_id = user_org_id() AND is_admin_or_super_admin()));

CREATE POLICY "clients_delete_admin"
  ON public.clients FOR DELETE
  TO authenticated
  USING (is_super_admin() OR (org_id = user_org_id() AND is_admin_or_super_admin()));

DROP POLICY IF EXISTS "Org members can manage invoice_items" ON public.invoice_items;

CREATE POLICY "invoice_items_select"
  ON public.invoice_items FOR SELECT
  TO authenticated
  USING (
    is_super_admin() OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id()
    )
  );

CREATE POLICY "invoice_items_insert_admin"
  ON public.invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (
    is_super_admin() OR (
      is_admin_or_super_admin() AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id()
      )
    )
  );

CREATE POLICY "invoice_items_update_admin"
  ON public.invoice_items FOR UPDATE
  TO authenticated
  USING (
    is_super_admin() OR (
      is_admin_or_super_admin() AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id()
      )
    )
  )
  WITH CHECK (
    is_super_admin() OR (
      is_admin_or_super_admin() AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id()
      )
    )
  );

CREATE POLICY "invoice_items_delete_admin"
  ON public.invoice_items FOR DELETE
  TO authenticated
  USING (
    is_super_admin() OR (
      is_admin_or_super_admin() AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id AND i.org_id = user_org_id()
      )
    )
  );
