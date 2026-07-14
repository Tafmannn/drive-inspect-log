-- =====================================================================
-- SECURITY-005: client_logs anon INSERT accepts arbitrary unbounded rows
-- =====================================================================
-- DEFECT: the INSERT policy on public.client_logs is:
--     CREATE POLICY "Allow insert for anon on client_logs"
--       ON public.client_logs FOR INSERT WITH CHECK (true);
--   Its role set is PUBLIC (pg_policy.polroles = {0}), despite the name
--   mentioning "anon". WITH CHECK (true) means anyone holding the public
--   anon API key (embedded in the frontend) can INSERT unlimited rows of
--   any shape: arbitrary severity strings, multi-megabyte message/context
--   payloads, spoofed user_id/job_id. Impact is log pollution / storage
--   cost / noise in the admin log readers — NOT data disclosure (reads are
--   admin-scoped by 20260713210000). This is the residual half of the
--   client_logs surface: read exposure was closed previously; write shape
--   was left wide open.
--
-- DELIBERATE, PRESERVED: unauthenticated INSERT itself is intentional —
--   client-side error logging must work even during auth failures /
--   pre-login (documented in 20260713210000). This migration does NOT
--   close anon insert. It only constrains the row SHAPE so the endpoint
--   can't be used as an arbitrary bulk write sink.
--
-- FIX: swap the WITH CHECK(true) for a bounded predicate via ALTER POLICY
--   (preserves the policy name, command, and PUBLIC role set — minimal
--   change, no drop/recreate). Bounds are set with generous headroom over
--   real observed traffic (n=1361: severity in {info,warn,error}, event
--   <=33 chars, message <=200, user_id/job_id <=36, context <=1.1 KB), so
--   no legitimate insert is rejected while abusive payloads are refused.
-- =====================================================================

ALTER POLICY "Allow insert for anon on client_logs"
  ON public.client_logs
  WITH CHECK (
    severity IN ('debug', 'info', 'warn', 'error')
    AND event IS NOT NULL
    AND char_length(event) BETWEEN 1 AND 128
    AND (message IS NULL OR char_length(message) <= 4000)
    AND (user_id IS NULL OR char_length(user_id) <= 64)
    AND (job_id  IS NULL OR char_length(job_id)  <= 64)
    AND (context IS NULL OR char_length(context::text) <= 16384)
  );
