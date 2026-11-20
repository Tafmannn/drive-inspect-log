-- Rollback for 20261120120000_client_fuel_policy.sql.
-- Removes the per-client fuel policy. WARNING: this discards each client's setting; after
-- it, Invoice Prep goes back to ticking Fuel by default for every client.
BEGIN;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_fuel_policy_check;
ALTER TABLE public.clients DROP COLUMN IF EXISTS fuel_policy;

COMMIT;
