-- Rollback for 20261121170100_job_catalogue_image_matching.sql
-- Removes automatic image matching on jobs. Catalogue images themselves are kept
-- (see 20261121170000_vehicle_catalogue_images.down.sql to remove those too).

DROP TRIGGER IF EXISTS zz_jobs_catalogue_image ON public.jobs;
DROP TRIGGER IF EXISTS catalogue_images_refresh_jobs ON public.vehicle_catalogue_images;
DROP TRIGGER IF EXISTS make_aliases_refresh_jobs ON public.vehicle_make_aliases;

DROP FUNCTION IF EXISTS public.catalogue_refresh_jobs();
DROP FUNCTION IF EXISTS public.jobs_set_catalogue_image();

-- Restore the simple lookup from 20261121170000 before dropping the resolver it now calls.
CREATE OR REPLACE FUNCTION public.get_vehicle_catalogue_image(
  p_make text, p_model text, p_year int, p_colour text DEFAULT NULL
) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT image_path
  FROM public.vehicle_catalogue_images
  WHERE lower(make) = lower(trim(p_make))
    AND lower(model) = lower(trim(p_model))
    AND p_year BETWEEN year_from AND year_to
  ORDER BY (lower(colour) = lower(trim(coalesce(p_colour, '')))) DESC, created_at
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.get_vehicle_catalogue_image(text, text, int, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_vehicle_catalogue_image(text, text, int, text) TO authenticated;

DROP FUNCTION IF EXISTS public.resolve_catalogue_image(text, text, text, text);
DROP FUNCTION IF EXISTS public.canonical_make(text);
DROP FUNCTION IF EXISTS public.vehicle_name_norm(text);

ALTER TABLE public.jobs DROP COLUMN IF EXISTS catalogue_image_path;

DROP POLICY IF EXISTS "make aliases readable by signed-in users" ON public.vehicle_make_aliases;
DROP POLICY IF EXISTS "make aliases managed by super admin" ON public.vehicle_make_aliases;
DROP TABLE IF EXISTS public.vehicle_make_aliases;
