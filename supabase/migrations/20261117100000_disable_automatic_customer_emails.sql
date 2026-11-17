-- Turn off automatic customer status emails (owner's decision, 2026-11-17).
--
-- Every customer email (POD / POC) is to be sent by hand from the job's POD
-- page. Until now a trigger queued a "collected" / "delivered" email on every
-- status change and the notify-customers function sent it to the client's
-- portal users. The sender has been turned off; this removes the queueing.
--
--  1. Drop the trigger and its function: status changes no longer queue
--     anything.
--  2. Mark anything still waiting as skipped, so nothing old can go out if a
--     sender is ever reintroduced.
--  3. clients.status_emails_enabled defaults to and is set to false, so the
--     stored setting matches what actually happens.
--
-- The customer_notifications table is kept as history (one row today).
-- Rollback: re-run the trigger section of 20261111140000_customer_status_emails.sql.

DROP TRIGGER IF EXISTS trg_enqueue_customer_notification ON public.jobs;
DROP FUNCTION IF EXISTS public.enqueue_customer_notification();

UPDATE public.customer_notifications
   SET status = 'skipped',
       skip_reason = 'automatic_emails_disabled'
 WHERE status IN ('pending', 'sending', 'failed');

ALTER TABLE public.clients ALTER COLUMN status_emails_enabled SET DEFAULT false;
UPDATE public.clients SET status_emails_enabled = false WHERE status_emails_enabled;
