-- Create separate admin-only client_rate_cards table to keep commercial pricing
-- data out of the general clients table (which is readable by all org members).

CREATE TABLE IF NOT EXISTS public.client_rate_cards (
  client_id uuid PRIMARY KEY,
  org_id uuid NOT NULL,
  rate_per_mile numeric,
  minimum_charge numeric,
  agreed_price numeric,
  waiting_rate_per_hour numeric,
  rate_card_active boolean NOT NULL DEFAULT false,
  rate_card_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS client_rate_cards_org_id_idx
  ON public.client_rate_cards(org_id);

-- Backfill from clients (preserve any existing rate card data)
INSERT INTO public.client_rate_cards (
  client_id, org_id, rate_per_mile, minimum_charge, agreed_price,
  waiting_rate_per_hour, rate_card_active, rate_card_notes
)
SELECT
  c.id, c.org_id, c.rate_per_mile, c.minimum_charge, c.agreed_price,
  c.waiting_rate_per_hour, COALESCE(c.rate_card_active, false), c.rate_card_notes
FROM public.clients c
WHERE c.rate_per_mile IS NOT NULL
   OR c.minimum_charge IS NOT NULL
   OR c.agreed_price IS NOT NULL
   OR c.waiting_rate_per_hour IS NOT NULL
   OR COALESCE(c.rate_card_active, false) = true
   OR c.rate_card_notes IS NOT NULL
ON CONFLICT (client_id) DO NOTHING;

-- Drop rate-card columns from clients (commercial data must not be exposed
-- via the org-wide clients SELECT policy).
ALTER TABLE public.clients DROP COLUMN IF EXISTS rate_per_mile;
ALTER TABLE public.clients DROP COLUMN IF EXISTS minimum_charge;
ALTER TABLE public.clients DROP COLUMN IF EXISTS agreed_price;
ALTER TABLE public.clients DROP COLUMN IF EXISTS waiting_rate_per_hour;
ALTER TABLE public.clients DROP COLUMN IF EXISTS rate_card_active;
ALTER TABLE public.clients DROP COLUMN IF EXISTS rate_card_notes;

-- Enable RLS and lock to admin/super_admin only
ALTER TABLE public.client_rate_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view rate cards in their org"
  ON public.client_rate_cards
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
  );

CREATE POLICY "Admins can insert rate cards in their org"
  ON public.client_rate_cards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
  );

CREATE POLICY "Admins can update rate cards in their org"
  ON public.client_rate_cards
  FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
  )
  WITH CHECK (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
  );

CREATE POLICY "Admins can delete rate cards in their org"
  ON public.client_rate_cards
  FOR DELETE
  TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_admin_or_super_admin() AND org_id = public.user_org_id())
  );

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_client_rate_cards_updated_at ON public.client_rate_cards;
CREATE TRIGGER trg_client_rate_cards_updated_at
  BEFORE UPDATE ON public.client_rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();