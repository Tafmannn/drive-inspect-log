-- Drivers no longer get "View PODs" by default: an admin has to allow it per person.
--
-- Until now the driver role template had pod.view = ALLOWED, so every new driver could
-- open PODs unless an admin remembered to deny it on their profile (as was done for two
-- drivers). The owner's rule is the opposite: drivers must not see PODs unless allowed.
--
-- This flips the ONE template row (role 'driver', permission 'pod.view') to not allowed.
-- Nothing else changes:
--   * a per-person "allow" override still wins, so an admin can still let a particular
--     driver see PODs (user_has_permission checks overrides before the template);
--   * a per-person "deny" override is unaffected;
--   * admins and the super admin are unaffected (their own template rows stay allowed);
--   * pod.manage is untouched (drivers never had it).
-- Together with 20261120140000_pod_storage_follow_permissions.sql (storage follows the
-- permission) this means a driver with no explicit allow can neither see POD links nor
-- fetch POD files.
--
-- At the time of writing the only drivers with no explicit setting are three accounts with
-- no jobs. Re-runnable: it sets a value, so running it twice changes nothing more.

UPDATE public.role_permission_templates
   SET is_allowed = false
 WHERE role = 'driver'
   AND permission_key = 'pod.view'
   AND is_allowed IS DISTINCT FROM false;
