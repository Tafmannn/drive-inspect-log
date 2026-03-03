-- Drop all legacy permissive anon policies from domain tables
-- These are replaced by org-aware policies already in place

DROP POLICY IF EXISTS "Allow all for anon on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow all for anon on inspections" ON public.inspections;
DROP POLICY IF EXISTS "Allow all for anon on damage_items" ON public.damage_items;
DROP POLICY IF EXISTS "Allow all for anon on photos" ON public.photos;
DROP POLICY IF EXISTS "Allow all for anon on job_activity_log" ON public.job_activity_log;
DROP POLICY IF EXISTS "Allow all for anon on expenses" ON public.expenses;
DROP POLICY IF EXISTS "Allow all for anon on expense_receipts" ON public.expense_receipts;
DROP POLICY IF EXISTS "Allow all for anon on qr_confirmations" ON public.qr_confirmations;
DROP POLICY IF EXISTS "Allow all for anon on sync_errors" ON public.sync_errors;
