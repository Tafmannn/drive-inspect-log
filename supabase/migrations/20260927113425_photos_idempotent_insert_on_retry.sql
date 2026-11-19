-- Version 20260927113425 as recorded in production's migration history
-- (SQL reproduced verbatim). It created a PARTIAL unique index. Production's
-- live index is the plain one created by 20260927113543 below, so this index
-- was replaced there; 20260927113543 drops-then-creates so that a fresh build
-- ends in the same state as production.
CREATE UNIQUE INDEX IF NOT EXISTS photos_backend_ref_unique
  ON public.photos (backend_ref)
  WHERE backend_ref IS NOT NULL AND archived_at IS NULL;
