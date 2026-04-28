-- Fix inspection submission failure caused by trigger writing to non-existent
-- photos.updated_at column. The link_unlinked_photos_to_inspection() and
-- link_photo_to_inspection_on_update() trigger functions both reference
-- photos.updated_at, but the column was never added to the photos table.
-- Result: every inspection submit raised SQLSTATE 42703
-- ("column updated_at of relation photos does not exist") inside the
-- submit_inspection RPC, which surfaced to the user as a generic
-- "Submission failed" toast.

-- Add the missing column with a sensible default and backfill it.
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Keep updated_at fresh on row updates using the existing helper.
DROP TRIGGER IF EXISTS set_photos_updated_at ON public.photos;
CREATE TRIGGER set_photos_updated_at
  BEFORE UPDATE ON public.photos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();