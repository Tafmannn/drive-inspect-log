-- Rollback for 20261120150000_driver_pod_view_default_off.sql.
-- Puts the driver default for "View PODs" back to ALLOWED, so drivers can open PODs unless an
-- admin denies it on their profile. Per-person overrides are not touched.
BEGIN;

UPDATE public.role_permission_templates
   SET is_allowed = true
 WHERE role = 'driver'
   AND permission_key = 'pod.view';

COMMIT;
