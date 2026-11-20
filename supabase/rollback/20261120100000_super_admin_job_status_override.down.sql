-- Rollback for 20261120100000_super_admin_job_status_override.sql.
-- Removes the super-admin status-override function and its audit table.
-- WARNING: dropping the table deletes the override audit history. Export it first
-- if you need it (SELECT * FROM public.job_status_overrides). Jobs keep whatever
-- status the overrides gave them; job_activity_log rows are left in place.
BEGIN;

DROP FUNCTION IF EXISTS public.super_admin_override_job_status(uuid, text, text);
DROP TABLE IF EXISTS public.job_status_overrides;

COMMIT;
