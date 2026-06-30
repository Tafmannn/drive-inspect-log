-- =====================================================================
-- V6 + V9: server-authoritative photo links (org + damage) and job-based
--          insert authorization for photos
-- =====================================================================
-- V9 — photos.org_id was set CLIENT-SIDE (the driver's resolved org) while
--      inspections/damage_items derive org from jobs.org_id (server-side).
--      If a driver's org diverged from the job's org, the photo was tagged
--      with the driver's org and became invisible to the job-org reviewers.
--      Fix: a BEFORE INSERT trigger sets photos.org_id from the job, and the
--      INSERT policy authorizes by the JOB's org (a photo is insertable iff
--      the caller can access the job). SELECT/UPDATE/DELETE stay org-scoped
--      (org_id now always equals the job's org).
--
-- V6 — damage close-up photos were linked to their damage_item ONLY via a
--      best-effort client UPDATE of damage_items.photo_url (catch-swallowed);
--      on failure the photo existed but did not show against its damage in
--      the POD. Fix: add photos.damage_item_id and an AFTER INSERT trigger
--      that syncs damage_items.photo_url server-side (atomic with the insert).
-- Additive + backwards compatible.
-- =====================================================================

-- V6: durable link column
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS damage_item_id uuid REFERENCES public.damage_items(id);
CREATE INDEX IF NOT EXISTS idx_photos_damage_item_id ON public.photos(damage_item_id);

-- V9: derive org_id from the job (ignore any client-supplied value)
CREATE OR REPLACE FUNCTION public.set_photo_org_from_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.job_id IS NOT NULL THEN
    SELECT j.org_id INTO NEW.org_id FROM public.jobs j WHERE j.id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_photos_set_org ON public.photos;
CREATE TRIGGER trg_photos_set_org
  BEFORE INSERT ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.set_photo_org_from_job();

-- V6: keep damage_items.photo_url in sync server-side (atomic with the insert)
CREATE OR REPLACE FUNCTION public.sync_damage_photo_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.damage_item_id IS NOT NULL AND NEW.url IS NOT NULL THEN
    UPDATE public.damage_items
       SET photo_url = NEW.url
     WHERE id = NEW.damage_item_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_photos_sync_damage ON public.photos;
CREATE TRIGGER trg_photos_sync_damage
  AFTER INSERT ON public.photos
  FOR EACH ROW EXECUTE FUNCTION public.sync_damage_photo_url();

-- V9: split the FOR ALL policy so INSERT is authorized by the JOB's org.
DROP POLICY IF EXISTS "Org members can manage photos" ON public.photos;

CREATE POLICY "photos_select_org"
ON public.photos FOR SELECT TO authenticated
USING (public.is_super_admin() OR org_id = public.user_org_id());

CREATE POLICY "photos_insert_job_org"
ON public.photos FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_id AND j.org_id = public.user_org_id()
  )
);

CREATE POLICY "photos_update_org"
ON public.photos FOR UPDATE TO authenticated
USING (public.is_super_admin() OR org_id = public.user_org_id())
WITH CHECK (public.is_super_admin() OR org_id = public.user_org_id());

CREATE POLICY "photos_delete_org"
ON public.photos FOR DELETE TO authenticated
USING (public.is_super_admin() OR org_id = public.user_org_id());
