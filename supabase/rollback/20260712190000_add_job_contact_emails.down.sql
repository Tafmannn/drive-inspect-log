-- =====================================================================
-- ROLLBACK for 20260712190000_add_job_contact_emails
-- =====================================================================
-- Strictly additive forward migration; rollback drops the two columns.
-- WARNING: any pickup_contact_email/delivery_contact_email values entered
-- after the forward migration are lost.
-- =====================================================================

ALTER TABLE public.jobs
  DROP COLUMN IF EXISTS pickup_contact_email,
  DROP COLUMN IF EXISTS delivery_contact_email;
