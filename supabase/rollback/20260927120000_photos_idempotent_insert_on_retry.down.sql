-- Rollback for 20260927120000_photos_idempotent_insert_on_retry.sql
DROP INDEX IF EXISTS public.photos_backend_ref_unique;
