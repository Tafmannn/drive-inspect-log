ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS rate_per_mile numeric,
  ADD COLUMN IF NOT EXISTS minimum_charge numeric,
  ADD COLUMN IF NOT EXISTS agreed_price numeric,
  ADD COLUMN IF NOT EXISTS waiting_rate_per_hour numeric,
  ADD COLUMN IF NOT EXISTS rate_card_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rate_card_notes text;
