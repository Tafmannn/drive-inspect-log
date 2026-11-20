-- Rollback for 20261121150000_evidence_write_lockdown.sql (restores the previous, broader access).
DROP TRIGGER IF EXISTS trg_photos_guard_identity ON public.photos;
DROP FUNCTION IF EXISTS public.guard_photo_identity_columns();

DROP POLICY IF EXISTS qr_confirmations_select_scoped ON public.qr_confirmations;
DROP POLICY IF EXISTS qr_confirmations_insert_scoped ON public.qr_confirmations;
DROP POLICY IF EXISTS "Org members can manage qr_confirmations" ON public.qr_confirmations;
CREATE POLICY "Org members can manage qr_confirmations" ON public.qr_confirmations
  FOR ALL
  USING (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = qr_confirmations.job_id AND j.org_id = public.user_org_id()))
  WITH CHECK (public.is_super_admin() OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = qr_confirmations.job_id AND j.org_id = public.user_org_id()));

GRANT UPDATE ON public.evidence_items, public.qr_confirmations TO authenticated;
GRANT DELETE ON public.photos, public.inspections, public.damage_items,
  public.evidence_items, public.qr_confirmations TO authenticated;
