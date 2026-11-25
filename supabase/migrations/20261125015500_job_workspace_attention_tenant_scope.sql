-- Batch 01: tenant-safe acknowledgements, no financial or evidence deletion.
-- Legacy rows without a verified job link remain quarantined (NULL org_id).
-- Apply only after verified staging baseline and a restorable backup.
BEGIN;
ALTER TABLE public.attention_acknowledgements
 ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organisations(id);
UPDATE public.attention_acknowledgements a
 SET org_id=j.org_id FROM public.jobs j
 WHERE a.job_id=j.id AND a.org_id IS NULL;
-- Fail instead of silently deleting duplicate historical records.
CREATE UNIQUE INDEX IF NOT EXISTS attention_ack_org_exception_unique
 ON public.attention_acknowledgements(org_id, exception_id);

CREATE OR REPLACE FUNCTION public.guard_attention_acknowledgement_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO public AS $$
DECLARE v_org uuid;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.job_id IS DISTINCT FROM OLD.job_id
    OR NEW.exception_id IS DISTINCT FROM OLD.exception_id) THEN
   RAISE EXCEPTION 'ACK_IDENTITY_IMMUTABLE' USING ERRCODE='23514';
 END IF;
 IF NEW.job_id IS NOT NULL THEN
   SELECT org_id INTO v_org FROM public.jobs WHERE id=NEW.job_id;
   IF v_org IS NULL OR (NEW.org_id IS NOT NULL AND NEW.org_id IS DISTINCT FROM v_org) THEN
      RAISE EXCEPTION 'ACK_JOB_SCOPE_INVALID' USING ERRCODE='42501';
   END IF;
   NEW.org_id:=v_org;
 END IF;
 IF NEW.exception_id LIKE 'evidence:%' AND (NEW.job_id IS NULL OR NEW.exception_id IS DISTINCT FROM ('evidence:' || NEW.job_id::text)) THEN
   RAISE EXCEPTION 'ACK_EVIDENCE_ID_INVALID' USING ERRCODE='23514';
 END IF;
 IF NEW.org_id IS NULL THEN
   RAISE EXCEPTION 'ACK_ORGANISATION_REQUIRED' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_attention_ack_scope ON public.attention_acknowledgements;
CREATE TRIGGER trg_attention_ack_scope BEFORE INSERT OR UPDATE ON public.attention_acknowledgements
 FOR EACH ROW EXECUTE FUNCTION public.guard_attention_acknowledgement_scope();

ALTER TABLE public.attention_acknowledgements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage attention acknowledgements" ON public.attention_acknowledgements;
DROP POLICY IF EXISTS ack_tenant_select ON public.attention_acknowledgements;
DROP POLICY IF EXISTS ack_tenant_insert ON public.attention_acknowledgements;
DROP POLICY IF EXISTS ack_tenant_update ON public.attention_acknowledgements;
DROP POLICY IF EXISTS ack_tenant_delete ON public.attention_acknowledgements;
CREATE POLICY ack_tenant_select ON public.attention_acknowledgements FOR SELECT TO authenticated
 USING (org_id IS NOT NULL AND public.is_admin_or_super_admin()
    AND (public.is_super_admin() OR org_id=public.user_org_id()));
CREATE POLICY ack_tenant_insert ON public.attention_acknowledgements FOR INSERT TO authenticated
 WITH CHECK (org_id IS NOT NULL AND public.is_admin_or_super_admin()
    AND acknowledged_by=auth.uid() AND (public.is_super_admin() OR org_id=public.user_org_id()));
CREATE POLICY ack_tenant_update ON public.attention_acknowledgements FOR UPDATE TO authenticated
 USING (org_id IS NOT NULL AND public.is_admin_or_super_admin()
    AND (public.is_super_admin() OR org_id=public.user_org_id()))
 WITH CHECK (org_id IS NOT NULL AND public.is_admin_or_super_admin()
    AND acknowledged_by=auth.uid() AND (public.is_super_admin() OR org_id=public.user_org_id()));
CREATE POLICY ack_tenant_delete ON public.attention_acknowledgements FOR DELETE TO authenticated
 USING (org_id IS NOT NULL AND public.is_admin_or_super_admin()
    AND (public.is_super_admin() OR org_id=public.user_org_id()));

CREATE OR REPLACE FUNCTION public.acknowledge_attention_exception(
 p_exception_id text,p_job_id uuid DEFAULT NULL,p_org_id uuid DEFAULT NULL,
 p_note text DEFAULT NULL,p_snoozed_until timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO public AS $$
DECLARE v_org uuid:=p_org_id;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin_or_super_admin() THEN
   RAISE EXCEPTION 'ACK_ADMIN_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF NULLIF(btrim(p_exception_id),'') IS NULL THEN
   RAISE EXCEPTION 'ACK_EXCEPTION_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF p_job_id IS NOT NULL THEN
   SELECT org_id INTO v_org FROM public.jobs WHERE id=p_job_id;
   IF v_org IS NULL OR (p_org_id IS NOT NULL AND p_org_id IS DISTINCT FROM v_org) THEN
     RAISE EXCEPTION 'ACK_JOB_SCOPE_INVALID' USING ERRCODE='42501';
   END IF;
 END IF;
 IF v_org IS NULL OR (NOT public.is_super_admin() AND v_org IS DISTINCT FROM public.user_org_id()) THEN
   RAISE EXCEPTION 'ACK_ORGANISATION_SCOPE_INVALID' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.attention_acknowledgements
 (org_id,exception_id,job_id,acknowledged_by,note,snoozed_until)
 VALUES(v_org,p_exception_id,p_job_id,auth.uid(),p_note,p_snoozed_until)
 ON CONFLICT(org_id,exception_id) DO UPDATE SET
 acknowledged_by=EXCLUDED.acknowledged_by,note=EXCLUDED.note,
 snoozed_until=EXCLUDED.snoozed_until,created_at=now()
 WHERE attention_acknowledgements.job_id IS NOT DISTINCT FROM EXCLUDED.job_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACK_JOB_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.acknowledge_attention_exception(text,uuid,uuid,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_attention_exception(text,uuid,uuid,text,timestamptz) TO authenticated;
COMMIT;
