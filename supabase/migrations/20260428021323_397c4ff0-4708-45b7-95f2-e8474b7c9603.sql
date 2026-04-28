-- Grant table privileges required before Row Level Security policies can allow writes.
-- The existing RLS policies still enforce driver self-access, org-scoped admin access, and super admin access.
GRANT SELECT, INSERT, UPDATE ON TABLE public.driver_profiles TO authenticated;

-- Keep anonymous users read-only/no-write for this sensitive profile table.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.driver_profiles FROM anon;