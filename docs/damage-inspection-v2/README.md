# Vehicle Damage Inspection V2

Screenshots in this folder are real Chromium captures (Playwright) of the dev-only
routes `/dev/damage-diagrams` (all 45 views) and `/dev/damage-inspector` (the real
`DamageInspector` component with local state). Both routes exist only when
`import.meta.env.DEV` is true and are absent from production bundles.

## Model
- 9 generic families (`src/features/damage/bodyTypes.ts`) × 5 views, generated from one
  parametric spec per family (`geometry/specs.ts`, `geometry/views.ts`). Panels are real
  polygons: the drawn shape, the native SVG hit area and the pure resolver (`hitTest.ts`)
  use the same geometry.
- Panel IDs (`panels.ts`, `DIAGRAM_VERSION = v2.0`) are vehicle-relative: left = driver's
  left = UK nearside. The Front view therefore shows left panels on the viewer's right.
- Pins are stored per panel (`panel_id`, `view_id`, `panel_position {u,v}` within the
  panel's box), not as whole-diagram x/y. Legacy `x/y/area/location/item` are still
  written (item = panel label) so older readers agree with the panel.

## Body type resolution
manual choice for this draft → `jobs.vehicle_type` (normalised synonyms) → the job's matched
`vehicle_catalogue_images.body_type` → body-type picker. Never inferred from make alone,
never defaults to saloon. The manual choice is stored on each damage row (`body_type`);
the job record is **not** modified.

## Database (migration `20261122120000_damage_inspection_v2.sql`, additive)
- `damage_items`: `panel_id, view_id, body_type, diagram_version, severity, panel_position`.
- `inspections.damage_declaration` (`none_found` | `recorded` | NULL).
- `submit_inspection` re-declared byte-for-byte except the payload allowlist; invalid
  values become NULL rather than rejecting evidence. Not applied to any database yet —
  apply to staging first. Until applied, the new client still works: the old RPC ignores
  the extra keys and the legacy columns carry the panel label.

## Known limitations
- Templates are generic. Van side configuration (sliding door on both sides), pickup cab
  styles and 3-door vs 5-door variants are not distinguished; the editor's **Change**
  panel list and **Other / not on diagram** (free-text) cover mismatches.
- Pins are shown precisely only on the view they were placed on; on other views where the
  same panel is visible, a hollow numbered marker is shown at the panel centre (no
  cross-view projection is claimed).
- Interior, underbody, sunroof and wheel-trim detail are not drawn; record them via "Other".
- Tyres in the plan view and some lamp slivers are small; they rely on the 14 px snap
  tolerance and the ambiguity chooser.
- Visual style is a hand-tuned vector illustration, not photorealistic artwork.
- Not tested on physical iPhone hardware (Playwright device emulation only).
