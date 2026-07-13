-- =====================================================================
-- Invoice integrity: atomic number allocation + uniqueness constraints
-- =====================================================================
-- PROBLEM
--   Invoice numbers were generated client-side by reading the latest
--   invoice, parsing its trailing digits, and adding 1. With no DB-level
--   uniqueness, two concurrent invoice creations produced the SAME
--   invoice_number and BOTH inserts succeeded. Likewise, a job could be
--   added to two invoices at once (the client-side "already invoiced"
--   check is a TOCTOU race) because invoice_items.job_id had only a plain
--   index, not a unique one.
--
-- FIX
--   1. A per-org counter table + SECURITY DEFINER RPC allocate_invoice_number()
--      that increments atomically under a row lock, so concurrent callers
--      serialise and never collide. (Numbers may have gaps if a creation is
--      rolled back — acceptable and standard for accounting sequences.)
--   2. UNIQUE (org_id, invoice_number) as the authoritative guarantee.
--   3. A partial UNIQUE index on invoice_items(job_id) so a job can appear
--      on at most one invoice.
--
-- SAFETY
--   The two uniqueness constraints will FAIL LOUDLY if pre-existing data
--   already violates them (duplicate invoice numbers, or a job on two
--   invoices). That is intentional: such rows are corrupted financial
--   records that a human must reconcile before this migration can apply.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Per-org invoice number counter
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
  org_id   uuid PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  last_seq integer NOT NULL DEFAULT 1000
);

ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;
-- No direct policies: the table is only ever touched through the SECURITY
-- DEFINER RPC below. (RLS enabled + no policy = deny-by-default for clients.)

-- Seed from existing invoices so numbering continues without collisions.
-- Uses the max trailing-digit sequence per org, floored at 1000 so the
-- first allocated number is >= 1001 (matching the previous default).
INSERT INTO public.invoice_number_counters (org_id, last_seq)
SELECT
  i.org_id,
  GREATEST(
    1000,
    MAX( COALESCE( NULLIF( (regexp_match(i.invoice_number, '(\d+)$'))[1], '' ), '0' )::int )
  )
FROM public.invoices i
WHERE i.org_id IS NOT NULL
GROUP BY i.org_id
ON CONFLICT (org_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) Atomic allocation RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_invoice_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq  integer;
  v_year text;
BEGIN
  -- Authorisation: only a super-admin or a member of the target org may
  -- allocate a number for that org.
  IF NOT (public.is_super_admin() OR p_org_id = public.user_org_id()) THEN
    RAISE EXCEPTION 'not authorised to allocate invoice numbers for org %', p_org_id
      USING ERRCODE = '42501';
  END IF;

  -- Atomic increment: the row lock taken by INSERT ... ON CONFLICT DO UPDATE
  -- serialises concurrent callers so no two ever receive the same sequence.
  INSERT INTO public.invoice_number_counters (org_id, last_seq)
  VALUES (p_org_id, 1001)
  ON CONFLICT (org_id)
    DO UPDATE SET last_seq = public.invoice_number_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  v_year := to_char(now(), 'YY');
  RETURN 'AX' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_invoice_number(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Uniqueness guarantees (the real safety net)
-- ---------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_org_number_unique UNIQUE (org_id, invoice_number);

CREATE UNIQUE INDEX IF NOT EXISTS invoice_items_job_id_unique
  ON public.invoice_items (job_id)
  WHERE job_id IS NOT NULL;
