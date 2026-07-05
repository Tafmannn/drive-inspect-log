-- =====================================================================
-- Phase 1 / C5: token-keyed SECURITY DEFINER RPCs for the QR handover flow
-- =====================================================================
-- DEFECT: the public customer handover page (QrConfirm.tsx, unauthenticated →
--   anon key) read `qr_confirmations` and `jobs` and UPDATEd `qr_confirmations`
--   directly. The only anon policy on qr_confirmations was the original
--   "Allow all for anon" USING(true) (dropped in 20260303121807). That left the
--   flow either broken (deny-all) or — if a permissive anon policy still exists
--   out-of-band in the live DB — a wide-open surface: any anon could read or
--   overwrite EVERY handover confirmation, and enumerate jobs.
--
-- FIX: expose exactly two SECURITY DEFINER RPCs, keyed on the unguessable 24-byte
--   token. They return/modify ONLY the non-sensitive handover fields and never
--   leak ids or other org data. Direct anon table access is no longer required,
--   so any lingering permissive anon policy is dropped and none is recreated
--   (RLS stays deny-by-default for direct access; the RPCs are the only path).
-- =====================================================================

-- Defensive: ensure RLS is on and no permissive anon policy remains (covers the
-- live-DB-drift case where "Allow all for anon on qr_confirmations" was re-added
-- via the dashboard). Direct table access by anon/authenticated is denied; the
-- RPCs below (SECURITY DEFINER) are the sole entry point.
-- Guarded for schema drift: skip table-level hardening if qr_confirmations is
-- absent in this environment (the RPCs below still create — plpgsql resolves
-- table names at call time — and simply return no data until the table exists).
DO $$
BEGIN
  IF to_regclass('public.qr_confirmations') IS NOT NULL THEN
    ALTER TABLE public.qr_confirmations ENABLE ROW LEVEL SECURITY;
    -- Remove ALL permissive anon policies. Besides the original USING(true) one,
    -- the live DB carries dashboard-created anon policies that are NOT token-
    -- scoped in RLS: "read by token" allows SELECT of EVERY unconfirmed row
    -- (all tokens/job ids, cross-org) and "confirm" allows anon UPDATE of any
    -- unconfirmed row. Both are replaced by the token-keyed SECURITY DEFINER
    -- RPCs below; the anonymous customer no longer needs direct table access.
    DROP POLICY IF EXISTS "Allow all for anon on qr_confirmations" ON public.qr_confirmations;
    DROP POLICY IF EXISTS "Anon can read qr_confirmation by token" ON public.qr_confirmations;
    DROP POLICY IF EXISTS "Anon can confirm qr_confirmation" ON public.qr_confirmations;
    -- NOTE: "Org members can manage qr_confirmations" (authenticated, org-scoped)
    -- is intentionally LEFT IN PLACE — admins still manage handovers directly.
  END IF;
END $$;

-- ── qr_lookup(token): fetch display data for a pending handover ──────────
-- Returns { status: 'ready'|'done'|'expired'|'not_found', ... }. On 'ready'
-- it includes only event_type + job_ref + vehicle_reg (exactly what the page
-- shows). No ids or other job/org fields are exposed.
CREATE OR REPLACE FUNCTION public.qr_lookup(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.qr_confirmations%ROWTYPE;
  v_ref text;
  v_reg text;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v FROM public.qr_confirmations WHERE token = p_token LIMIT 1;
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'done');
  END IF;
  IF v.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  SELECT COALESCE(NULLIF(j.external_job_number, ''), left(v.job_id::text, 8)),
         j.vehicle_reg
    INTO v_ref, v_reg
    FROM public.jobs j WHERE j.id = v.job_id;

  RETURN jsonb_build_object(
    'status', 'ready',
    'event_type', v.event_type,
    'job_ref', v_ref,
    'vehicle_reg', v_reg
  );
END;
$$;

-- ── qr_confirm(token, name, notes): record the customer handover ────────
-- Atomically confirms iff the token is valid, unexpired, and not already
-- confirmed. Returns { status: 'done'|'invalid'|'error' }. Cannot overwrite
-- an existing confirmation (WHERE confirmed_at IS NULL).
CREATE OR REPLACE FUNCTION public.qr_confirm(
  p_token text,
  p_customer_name text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
    RETURN jsonb_build_object('status', 'error', 'error', 'NAME_REQUIRED');
  END IF;
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  UPDATE public.qr_confirmations
     SET confirmed_at = now(),
         customer_name = btrim(p_customer_name),
         notes = NULLIF(btrim(COALESCE(p_notes, '')), '')
   WHERE token = p_token
     AND confirmed_at IS NULL
     AND expires_at >= now()
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  RETURN jsonb_build_object('status', 'done');
END;
$$;

-- Expose to the anonymous customer (and authenticated drivers). Execution is the
-- ONLY qr_confirmations access path; the token gates everything.
REVOKE ALL ON FUNCTION public.qr_lookup(text) FROM public;
REVOKE ALL ON FUNCTION public.qr_confirm(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.qr_lookup(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.qr_confirm(text, text, text) TO anon, authenticated;
