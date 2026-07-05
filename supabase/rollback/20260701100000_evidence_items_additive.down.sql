-- =====================================================================
-- ROLLBACK for 20260701100000_evidence_items_additive
-- =====================================================================
-- The forward migration is strictly additive, so rollback simply removes the
-- new objects. WARNING: dropping the table deletes any evidence_items ROWS
-- written after the migration (storage objects in vehicle-photos are NOT
-- touched — they remain and are still covered by the existing bucket
-- policies). Legacy public.photos is unaffected throughout.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_evidence_touch_updated ON public.evidence_items;
DROP TRIGGER IF EXISTS trg_evidence_set_org ON public.evidence_items;
DROP FUNCTION IF EXISTS public.touch_evidence_updated_at();
DROP FUNCTION IF EXISTS public.set_evidence_org_from_job();
DROP TABLE IF EXISTS public.evidence_items;
