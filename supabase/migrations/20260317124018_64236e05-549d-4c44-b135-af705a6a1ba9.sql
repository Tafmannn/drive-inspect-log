
-- Explicitly set SECURITY INVOKER on the view (Postgres 15+)
ALTER VIEW public.active_driver_profiles SET (security_invoker = on);
