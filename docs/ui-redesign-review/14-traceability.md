# Traceability: every recommendation → observed issue or documented objective

**Documented objectives (from the brief's quality gates):** O1 preserve functionality and permission boundaries · O2 WCAG 2.2 AA visual accessibility · O3 consistent, reusable components · O4 practical touch interaction · O5 low visual performance overhead / no unnecessary effects · O6 legible in information-dense screens · O7 cohesive across roles · O8 works on desktop and mobile.

**Evidence:** issue IDs `U01–U28` and verified findings `V01–V14` are in `02-ui-audit.md`; populated-test defects `P1–P11` in `10-populated-layout-assessment.md`; UI-only change IDs `UI-1…UI-9` in `11-preservation-matrices.md`; phases in `06-prioritisation-and-roadmap.md`.

| Rec | Recommendation | Observed issue(s) | Objective | Verified how | Phase |
|---|---|---|---|---|---|
| R01 | Status badge: dark text on tint + dot; keep label text | U01 | O2 | token maths (2.20–4.02 today); v2 pairs 5.78–6.87 rendered | 1 |
| R02 | Darken light-mode success/warning/destructive solid fills; keep white text | U02 | O2 | token maths (2.14–3.76 today); v2 solids 5.02–5.50 | 1 |
| R03 | Control-boundary colour `#7C8BA0` and `--input` set to it | U02 (`--input` 1.2:1); P10 | O2 | rendered: all 240 boundary instances ≥3.08 | 1 |
| R04 | Solid double focus ring | (design objective; old ring ≈1.8:1 in prototype) | O2 | computed 6.68–7.67 | 1 |
| R05 | Sidebar group labels, ⌘K hint, subtitle: raise contrast and size to 12px | U24, U06 | O2 | rendered current UI: 2.61 / 2.32 / 3.30 | 1 |
| R06 | Role label in brand band: opaque colour, 12px | U25 | O2 | rendered 3.43 | 1 |
| R07 | Toast/alert colours dark-on-tint or darkened solid | U26 | O2 | rendered 3.16–3.60 | 1 |
| R08 | Single `--navy-900` / brand token | U11 | O3 | 3 blues measured | 1 |
| R09 | 12px floor, applied by context (captions, badges, labels, buttons…) | U06, U27, V-ctx | O2, O6 | 383 uses classified; 25.7% of rendered desktop text | 1 (tokens) → 2–7 (hotspots) |
| R10 | `tabular-nums` on IDs, counts, money, times | U16 | O6 | Inter default digits misalign by 18.9px | 1 |
| R11 | Decide Option S (system font) vs Option I (self-hosted Inter) | U16 | O3, O5 | `13-…` measurements | 1b (approval) |
| R12 | KPI tile layout and column rules; stacked icon ≤420px | U07, U17, U18 | O6, O8 | v1/v2 render, layout check at 320px | 2 |
| R13 | One mobile header band; hide breadcrumb below `md` | U08 | O8 | 24% chrome measured | 2 |
| R14 | 44px hit areas on touch; 32px+ desktop icon buttons | U14, U27 | O4 | layout check: 0 targets <44 at ≤768 | 2 |
| R15 | Chip rows: wrap on desktop, edge-fade scroll on mobile | U13, V04 | O4, O8 | clipped chips seen on 4 pages | 2 |
| R16 | Unify metric/launcher component families | U09 | O3 | code | 2 |
| R17 | Jobs/dispatch tables: sticky actions column, 2-line clamp, tooltip, icon actions | U27, P2, P3 | O6, O1 | populated stress tests | 4 |
| R18 | Status secondary cues visible as text | UI-4 (tooltip-only cue in source) | O2, O4 | `JobsColumns.tsx` | 4 |
| R19 | Mobile job cards keep all four actions with labels | P9 | O1 | preservation matrix | 4 |
| R20 | Ops-role pages in the Control shell (`/`, `/admin*`, `/super-admin*`, `/admin/users`) | U03, U04, U20, U23 | O7, O8 | screenshots V05, V09 | 6 |
| R21 | One presentation for both super-admin dashboards (no merging) | U21, V06 | O7, O1 | screenshots | 6 |
| R22 | Auth screens aligned to brand surface; raise secondary text | U05, V13 | O7, O2 | screenshots (contrast indeterminate) | 6 |
| R23 | Invoice header actions wrap on mobile; filter bars tidy | U19, U22 | O8 | screenshots V03, V08 | 6 |
| R24 | Desktop forms: two-column fields, error summary + inline errors | U23, UI-5 | O6, O2 | screenshots V09; skill UX guidance | 4–6 (**sign-off**) |
| R25 | Inspection flow restyle, renderers kept inline | O1 (risk) | O1, O4 | source comment on focus/signature | 5 |
| R26 | Currency-appropriate receipt icon | U12 | O7 | screenshots V11 | quick win |
| R27 | Raw palette colours → semantic tokens | U10 | O3 | grep ≈100 lines | 3 / 7 |
| R28 | Compact table density mode (44px rows, 13px) | (dense-data objective) | O6 | `.t.compact` in v2 | 3 |
| R29 | Branded link previews | U15 | O7 | code | 7 |
| R30 | Derive and validate dark theme for Concept A | — (**gap**, not an observed defect) | O2, O7 | not done | 7 / open |
| R31 | Capture populated, non-production screens before Phases 3–4 | evidence gap: dims 9–10, 70 of 88 captures non-populated | all | `09-…` | pre-3 |

**Recommendations with no observed issue behind them:** R04 (design objective only), R30 and R31 (explicitly gaps). Everything else maps to at least one measured, verified or code-read issue.

**Considered and rejected / out of scope:** merging the two super-admin dashboards; splitting the shared "IN PROGRESS" label; adding chip counts, global search or bulk actions; changing login copy; any inspection procedure change.
