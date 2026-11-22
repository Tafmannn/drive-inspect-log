# Damage-diagram artwork pipeline

Turns the supplied per-body-type illustrations into the diagram assets and
pixel data used by `src/features/damage/artwork/`. Requires Python 3 with Pillow
and NumPy.

1. Put the source PNGs in `<dir>/axentra_<type>_individual_views/<type>-<view>.png`
   (views: top, front, rear, left, right; top views with the front at the left
   are rotated so the front points up).
2. `python3 -I scripts/damage-art/art.py <dir> src/features/damage/assets /tmp/art.json 236`
   isolates the vehicle (largest non-background region), writes cropped
   `assets/<type>/<view>.webp`, and traces outline / red lamps / dark regions.
3. `python3 -I scripts/damage-art/gen.py /tmp/art.json src/features/damage/artwork/artPixels.ts`
4. Re-read seams for any changed view into `artwork/artSpecs.ts`. Use
   `grid2.py` for a coordinate grid and `overlay.py` to check extraction, then
   open `/dev/damage-diagrams?type=<type>&big=1&labels=1` (dev server) to see
   every panel outlined on the artwork.
5. `npm test` — `src/test/damage-diagrams.test.ts` checks every panel is
   tappable, ids are known, and left/right are vehicle-relative in all views.

The van set predates this pipeline and lives in `artwork/vanArtwork.ts` /
`vanOutlines.ts`.
