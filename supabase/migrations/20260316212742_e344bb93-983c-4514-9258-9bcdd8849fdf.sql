-- ═══════════════════════════════════════════════════════════════
-- Move 2: Admin Audit Log
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NOT NULL,
  performed_by_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id UUID,
  target_org_id UUID,
  before_state JSONB,
  after_state JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can read the audit log
CREATE POLICY "Super admins can read audit log"
  ON public.admin_audit_log
  FOR SELECT
  TO authenticated
  USING (is_super_admin());

-- Service role inserts (from edge functions) — no INSERT policy for authenticated
-- Edge functions use service role client which bypasses RLS

-- ═══════════════════════════════════════════════════════════════
-- Move 3: Attention Acknowledgements
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE public.attention_acknowledgements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id TEXT NOT NULL,
  job_id UUID,
  acknowledged_by UUID NOT NULL,
  note TEXT,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attention_acknowledgements ENABLE ROW LEVEL SECURITY;

-- Admins and super admins can manage acknowledgements
CREATE POLICY "Admins can manage attention acknowledgements"
  ON public.attention_acknowledgements
  FOR ALL
  TO authenticated
  USING (
    user_role() IN ('admin', 'super_admin')
  )
  WITH CHECK (
    user_role() IN ('admin', 'super_admin')
  );

-- Index for fast lookups by exception_id
CREATE INDEX idx_attention_ack_exception_id ON public.attention_acknowledgements(exception_id);
CREATE INDEX idx_attention_ack_snoozed ON public.attention_acknowledgements(snoozed_until) WHERE snoozed_until IS NOT NULL;