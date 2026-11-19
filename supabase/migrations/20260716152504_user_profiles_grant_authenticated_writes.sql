-- =====================================================================
-- Fix: "permission denied for table user_profiles" on profile photo upload
-- =====================================================================
-- Every other table in this project grants full CRUD at the table level to
-- both `anon` and `authenticated`, relying on RLS policies alone for real
-- authorization (confirmed via information_schema.role_table_grants across
-- jobs/invoices/clients/driver_onboarding). `user_profiles` is the sole
-- outlier: `authenticated` only ever had SELECT/REFERENCES/TRIGGER/TRUNCATE
-- — INSERT/UPDATE/DELETE were never granted, even though matching RLS
-- policies (user_profiles_insert_admin_super, user_profiles_update_self_
-- admin_super) already exist and were designed to gate them. Missing the
-- base GRANT means Postgres rejects the statement before RLS is ever
-- evaluated ("permission denied for table", not an RLS policy violation),
-- which is exactly the error users hit uploading a profile photo (the
-- self-service `user_profiles` UPDATE added for photo uploads).
-- No DELETE RLS policy exists for this table, so DELETE is intentionally
-- left ungranted here — matching what the RLS layer actually supports.
-- =====================================================================

GRANT INSERT, UPDATE ON public.user_profiles TO authenticated;
