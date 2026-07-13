-- =====================================================================
-- SECURITY-004: client_logs was readable by ANYONE, including anon
-- =====================================================================
-- DEFECT: client_logs' original policy (20260301095617) was:
--     CREATE POLICY "Allow select for anon on client_logs"
--       ON public.client_logs FOR SELECT USING (true);
--   No role restriction (no `TO authenticated`), no org scoping — every
--   row (event, message, job_id, user_id, context jsonb — internal error
--   diagnostics across every organisation) was readable by a completely
--   unauthenticated request. A later migration (20260316204833) added a
--   narrower "Org admins can read own org client_logs" policy, but never
--   dropped the original — Postgres RLS OR's all applicable permissive
--   policies together for the same command, so the blanket USING(true)
--   policy remained fully in effect regardless of the newer, narrower
--   one layered alongside it. That later migration's own comment
--   ("Super admins retain global visibility via existing policy")
--   confirms this was relied on rather than replaced — an oversight, not
--   a deliberate choice: the intent was clearly to scope this table, it
--   was just never finished. Verified no other migration ever drops this
--   policy (grepped the full migration history for both the exact policy
--   name and any generic "client_logs" reference).
--
-- FIX: drop the anon-readable policy; replace the org-admin policy with
--   one that actually requires admin/super-admin (matching its own name
--   — every real call site, `SuperAdminErrors`/`SuperAdminPages`/
--   `useAttentionData`/`useSuperAdminControlData`, is admin+ gated
--   already) and gives super-admins explicit global visibility instead
--   of accidentally depending on the exposure being fixed here. The
--   anon INSERT policy is untouched — deliberately unauthenticated
--   best-effort client-side error logging (so errors can be reported
--   even during auth failures/pre-login), not part of this defect.
-- =====================================================================

DROP POLICY IF EXISTS "Allow select for anon on client_logs" ON public.client_logs;
DROP POLICY IF EXISTS "Org admins can read own org client_logs" ON public.client_logs;

CREATE POLICY "client_logs_select_admin"
  ON public.client_logs
  FOR SELECT
  TO authenticated
  USING (
    is_super_admin()
    OR ((context->>'org_id')::uuid = user_org_id() AND is_admin_or_super_admin())
  );
