-- Rollback for 20260628100000_phase1_backfill_user_profiles_and_signup_trigger
--
-- Removes the signup trigger and function. By design this does NOT delete the
-- backfilled user_profiles rows, because deleting them could lock active users
-- out of their org. The backfill is idempotent and safe to leave in place.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- OPTIONAL (DESTRUCTIVE — only if you must fully revert the backfill and you
-- understand it will remove profile rows that did not previously exist):
--
-- DELETE FROM public.user_profiles up
-- WHERE up.created_at >= '2026-06-28'  -- adjust to the backfill apply time
--   AND NOT up.is_protected;
