-- =====================================================================
-- attention_acknowledgements: reconcile legacy exception-id formats
-- =====================================================================
-- Exception IDs moved to stable keys (exceptionEngine.ts stableExcId) so
-- acknowledgements survive refetches. Rows recorded under the two older
-- formats no longer match anything, which made previously dismissed
-- notifications resurface as active:
--
--   1. Dash format  ("timing-17dcbdf6-1509-51wd33"): fully volatile,
--      unmappable — deleted.
--   2. Colon format with a trailing base36 hash of the (volatile) detail
--      text:
--        a. "evidence:<uuid>:repeated-upload-failures:<hash>" — current id
--           is the same minus the hash → migrate by stripping the hash.
--        b. "timing:<uuid>:no-pickup-started[:<hash>]" — the
--           "No pickup started" exception has been removed from the
--           product entirely → deleted.
--        c. "compliance:global:<slug>:<hash>" — current compliance ids key
--           on user_id, and the hash cannot be mapped back to a driver →
--           deleted. (Distinguished from current 4-segment compliance ids,
--           whose 4th segment is a full UUID, by the hash's shape.)
--
-- Net effect: dismissals recorded under the current format keep sticking;
-- the handful of alerts whose old dismissal was unmappable resurface once
-- for a one-time re-dismiss, after which they stick permanently.
-- =====================================================================

-- 2a. Migrate strip-hash-able rows to the current stable id.
UPDATE public.attention_acknowledgements
SET exception_id = regexp_replace(exception_id, ':[a-z0-9]+$', '')
WHERE exception_id ~ '^evidence:[0-9a-f-]{36}:repeated-upload-failures:[a-z0-9]{4,8}$';

-- 2b. The no-pickup-started exception no longer exists.
DELETE FROM public.attention_acknowledgements
WHERE exception_id ~ '^timing:[0-9a-f-]{36}:no-pickup-started(:[a-z0-9]+)?$';

-- 2c. Legacy compliance ids with a base36 hash tail (current compliance
--     ids end in a full UUID, which this pattern cannot match).
DELETE FROM public.attention_acknowledgements
WHERE exception_id ~ '^compliance:global:[a-z0-9-]+:[a-z0-9]{4,8}$'
  AND exception_id !~ ':[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 1. Legacy dash-format ids (pre-colon-format engine) match nothing today.
DELETE FROM public.attention_acknowledgements
WHERE exception_id ~ '^(timing|evidence|sync|state|compliance)-';
