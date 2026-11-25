-- Emergency containment: preserve tenant-scoped reads and all records.
-- Never reinstate the previous role-only cross-tenant policy.
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON public.attention_acknowledgements FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acknowledge_attention_exception(text,uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
COMMIT;
-- To re-enable after review: reapply the forward migration, which restores
-- the authenticated DML grants while keeping tenant RLS enabled.
