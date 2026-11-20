-- One live invoice per job, enforced in the database across BOTH ways a job
-- can be invoiced:
--   • invoice_items.job_id (multi-job flow, createInvoice.ts) — already
--     unique per non-voided line via invoice_items_job_id_unique;
--   • invoices.job_id + line_items JSON (legacy single-job page,
--     /invoice/new/:jobId) — only an app-side check, and nothing stopped a
--     job sitting on a legacy invoice AND an invoice_items line.
-- Credit notes never carry job_id (cancel_invoice) and cancelled invoices /
-- voided lines don't count. A per-job advisory lock serialises concurrent
-- writers so the check can't be raced. Raises 23505 so the existing
-- "already invoiced" handling in createInvoice.ts applies.
-- Prod had 0 conflicting rows on 20 Nov 2026.
-- Rollback: supabase/rollback/20261121140000_one_live_invoice_per_job.down.sql

CREATE OR REPLACE FUNCTION public.guard_one_live_invoice_per_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job uuid;
  v_invoice uuid;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.job_id IS NULL OR NEW.status = 'cancelled'
       OR COALESCE(NEW.document_type, 'invoice') <> 'invoice' THEN
      RETURN NEW;
    END IF;
    v_job := NEW.job_id;
    v_invoice := NEW.id;
  ELSE
    IF NEW.job_id IS NULL OR COALESCE(NEW.voided, false) THEN
      RETURN NEW;
    END IF;
    v_job := NEW.job_id;
    v_invoice := NEW.invoice_id;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-job:' || v_job::text, 0));

  IF EXISTS (
       SELECT 1 FROM public.invoices i
        WHERE i.job_id = v_job
          AND i.id IS DISTINCT FROM v_invoice
          AND i.status <> 'cancelled'
          AND COALESCE(i.document_type, 'invoice') = 'invoice')
     OR (TG_TABLE_NAME = 'invoices' AND EXISTS (
       SELECT 1 FROM public.invoice_items ii
        WHERE ii.job_id = v_job
          AND NOT COALESCE(ii.voided, false)
          AND ii.invoice_id IS DISTINCT FROM v_invoice))
  THEN
    RAISE EXCEPTION 'JOB_ALREADY_INVOICED: job % is already on a live invoice', v_job
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.guard_one_live_invoice_per_job() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_invoices_one_live_per_job ON public.invoices;
CREATE TRIGGER trg_invoices_one_live_per_job
  BEFORE INSERT OR UPDATE OF job_id, status, document_type ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_one_live_invoice_per_job();

DROP TRIGGER IF EXISTS trg_invoice_items_one_live_per_job ON public.invoice_items;
CREATE TRIGGER trg_invoice_items_one_live_per_job
  BEFORE INSERT OR UPDATE OF job_id, voided, invoice_id ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_one_live_invoice_per_job();
