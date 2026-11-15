-- Rollback for 20261115100000_org_bank_details_and_late_payment.sql
-- WARNING: drops the saved bank details and the late-payment switch. Invoices
-- already issued keep their stored PDFs, so they are unaffected. Deploy the
-- previous frontend first: the previous invoice code has its own bank details.
-- portal_get_invoice is left as is (its extra fields are ignored by the older
-- frontend); re-apply 20261114140000_portal_invoice_status_and_pdf.sql to
-- restore its exact previous body.
ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS organisations_bank_account_number_format,
  DROP CONSTRAINT IF EXISTS organisations_bank_sort_code_format,
  DROP COLUMN IF EXISTS late_payment_notice,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_sort_code,
  DROP COLUMN IF EXISTS bank_account_name,
  DROP COLUMN IF EXISTS bank_name;
