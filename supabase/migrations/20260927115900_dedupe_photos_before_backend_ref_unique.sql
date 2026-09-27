-- 20260927115900_dedupe_photos_before_backend_ref_unique
--
-- One-time data cleanup, run immediately before
-- 20260927120000_photos_idempotent_insert_on_retry adds a unique index on
-- photos.backend_ref. Three jobs' pickup inspections, each submitted over a
-- sustained bad connection, had retried every photo upload repeatedly
-- (insertPhoto had no idempotency key — see that migration for the full
-- story), leaving 18 groups of duplicate rows (135 extra rows total) all
-- pointing at the same storage object.
--
-- For each duplicate group this archives every row but the earliest
-- (archived_at = now(); the storage object and the surviving row's url are
-- untouched, so nothing an admin/driver can already see changes), then
-- clears backend_ref on the newly-archived rows. Multiple NULLs are always
-- allowed under a unique index, so this lets one simple, PostgREST-upsert-
-- compatible index cover the whole table without also needing every
-- historical archived duplicate to keep a colliding backend_ref.
--
-- Idempotent: safe to re-run — a table with no active-row duplicates and no
-- archived rows sharing a backend_ref is a no-op both times.

WITH ranked AS (
  SELECT id, backend_ref,
    ROW_NUMBER() OVER (PARTITION BY backend_ref ORDER BY created_at ASC, id ASC) AS rn
  FROM public.photos
  WHERE backend_ref IS NOT NULL AND archived_at IS NULL
)
UPDATE public.photos SET archived_at = now()
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

UPDATE public.photos SET backend_ref = NULL
WHERE archived_at IS NOT NULL
  AND backend_ref IN (
    SELECT backend_ref FROM public.photos
    WHERE backend_ref IS NOT NULL
    GROUP BY backend_ref HAVING count(*) > 1
  );
