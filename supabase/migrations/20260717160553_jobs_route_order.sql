-- =====================================================================
-- jobs.route_order: admin-controlled run order for a driver's job list
-- =====================================================================
-- Admins can now explicitly sequence the jobs a driver should do, in
-- order. The driver app's ranking (executionRanking.ts) treats a set
-- route_order as the top sort criterion within an execution class; jobs
-- without one keep the automatic heuristics (time windows, route
-- adjacency, job_date).
--
-- Writes are already admin-only at the DB level: the jobs UPDATE policy
-- (20260630100100_phase1_jobs_write_scope_admin_only) restricts all job
-- updates to org admins/super admins, so no new policy is needed for
-- this column and drivers cannot reorder their own queue.
-- =====================================================================

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS route_order integer;

COMMENT ON COLUMN public.jobs.route_order IS
  'Admin-set run order for the assigned driver''s job list (ascending; null = automatic ordering).';
