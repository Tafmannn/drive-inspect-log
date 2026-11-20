-- Per-client fuel policy: does the client pay fuel on top, or is it inside the price?
--
--   'recharged' : the client pays fuel separately. Fuel expenses are recharged as their
--                 own lines on the invoice (Invoice Prep ticks Fuel by default).
--   'included'  : the quote already covers fuel. Fuel is NOT ticked by default in
--                 Invoice Prep, and the price suggestion says the rate must cover it.
--
-- Every existing client becomes 'recharged', which is how Invoice Prep already behaves
-- (it ticks Fuel by default for everyone), so nothing changes until a client is switched.
-- Profitability needs no change: it already counts all logged fuel as a cost and only
-- counts it as revenue when it was recharged on an invoice.
--
-- `clients` is admin-only to read and write (clients_select / clients_update_admin), so
-- this commercial term is not visible to drivers.
--
-- Keep the allowed values in sync with src/lib/fuelPolicy.ts. Re-runnable.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS fuel_policy text NOT NULL DEFAULT 'recharged';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.clients'::regclass
       AND conname = 'clients_fuel_policy_check'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_fuel_policy_check
      CHECK (fuel_policy IN ('recharged', 'included'));
  END IF;
END $$;

COMMENT ON COLUMN public.clients.fuel_policy IS
  'recharged = client pays fuel as a separate invoice line; included = fuel is inside the quoted price';
