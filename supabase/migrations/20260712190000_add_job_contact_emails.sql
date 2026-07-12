-- Additive: pickup/delivery contact email on jobs, so the POD email feature
-- can send the download link directly via a transactional email service
-- instead of relying on the driver's own mail client with a hand-typed
-- recipient address.
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS pickup_contact_email text,
  ADD COLUMN IF NOT EXISTS delivery_contact_email text;
