# Populated-layout assessment (fictional data)

**Why this exists.** 70 of the 88 current-state screenshots show skeletons, spinners or empty states, so they say nothing about how a *populated* interface behaves. This assessment stress-tests the proposed Concept A v2 with safe fictional data in isolated static pages (`mockups/v2/09a…09f`). Nothing touches the application, backend, auth or real data.

**What it is not.** These are hand-built HTML demonstrations, not the real React components. They prove the *visual system* copes with hard content; they do not prove that the real `ResponsiveList`, `CompactTable`, `PhotoViewer`, etc. will behave the same. Real data, real photos, virtualisation, keyboard flows and performance at thousands of rows are **untested**.

## Method
- **Stress pages:** 60-row jobs table with 5-digit KPIs, long client names (up to ~85 characters), hyphenated and Welsh town names, mixed statuses and cues, unassigned/long driver names; dense Command Center (10 exceptions, 15 dispatch rows, 4-digit KPIs); photo grid with 16 slots in five upload states; form with five simultaneous validation errors; settings with 12 long toggle labels; mobile job detail with a ~~180-character address containing a 58-letter unbroken word; mobile list with 12 cards and a 10-chip row.
- **Automated checks** (`tools/layout-check.cjs`) at 320 / 390 / 768 / 1024 / 1440 / 1920 px (**76 page×width checks over 16 pages**): page overflow, elements beyond the viewport/frame, text overflowing its box, truncation without a tooltip, any text < 12px, tap targets (< 24px, and < 44px at ≤ 768px), and table actions hidden by horizontal scroll.
- **Visual inspection** of the rendered pages (screenshots in `screenshots/proposed-v2/`).
- Review annotations (`.note`, `.ribbon`) are excluded from checks because they are not part of the proposed UI.

## Result: final state
| Check | Result across 76 checks |
|---|---|
| Page-level horizontal overflow | **0** |
| Elements beyond viewport / phone frame | **0** |
| Text overflowing its box | **0** |
| Truncated text without a tooltip (`title`) | **0** of 163 truncated elements |
| Text smaller than 12px | **0** |
| Tap targets < 24px | **0** (2,874 controls measured) |
| Tap targets < 44px at ≤ 768px | **0** |
| Table row actions hidden by scroll | **0** (sticky action column); the 3 largest tables scroll horizontally at 1024px only |

**These are the results *after* fixes.** Getting there required the defects below, most of which were visible only with populated data.

## Defects found by populated testing, and what was done
| # | Found where | Defect | Found by | Fix in v2 |
|---|---|---|---|---|
| P1 | Command Center / Jobs tables | `position:sticky; top:56px` header inside an `overflow` wrapper pushed the header over the first row | visual | header no longer offset |
| P2 | 60-row jobs table @1440 | Action column fell outside the visible card (8 columns + long data) — the action icons were invisible without scrolling | **visual only** (the automated check initially exempted scroll containers) | actions column made sticky; padding/column widths tightened; check added for hidden actions |
| P3 | Same | Different long client names truncated to the **same visible prefix** ("Northgate Motors Re…") | visual | two-line clamp + tooltip; full text remains on the job |
| P4 | Mobile job detail | A 58-letter unbroken word in an address ran past the card edge | visual | `overflow-wrap:anywhere`; check added for text overflowing its box |
| P5 | KPI tiles @320px | Label overflowed its tile ("Organisations") | automated (after adding the check) | icon stacks above label at ≤420px |
| P6 | Nav group labels, ⌘K hint, damage pins, brand subtitle | 11px text although the spec said 12px floor | automated | raised to 12px |
| P7 | ≤768px | Menu button squashed to 34–37px wide, 26px switches, 38px counters, 40px icon buttons | automated | `flex:none`, 44px hit areas |
| P8 | Many rows | Truncated text with no tooltip | automated | `title` added everywhere |
| P9 | Mobile cards | Cards offered only Assign/Reassign — **View, POD and Expense had disappeared** | preservation review | full action set restored |
| P10 | Control borders | `#8795A8` border passes 3:1 on white (3.05) but **fails on the tinted page background (2.81)** | rendered contrast check | `--border-strong` darkened to `#7C8BA0` (3.47 white / 3.20 page / 3.08 chip fill) |
| P11 | Focus | 35%-opacity focus ring was only ≈1.8:1 | token calculation | solid double ring: 2px white + 2px `#1E4FA8` (6.68–7.67:1) |

## Scenario-by-scenario assessment
| Scenario | Prototype | Verdict | Residual risk |
|---|---|---|---|
| Large job table (60 rows, mixed statuses, long text) | `09a-stress-jobs-large-table.html` | Readable and scannable at 1440/1920; at 1024 (icon-rail layout) the 3 largest tables scroll horizontally with a sticky action column | Rows are 60px; 5,000-row performance and virtualisation untested. At 1024 users must scroll to see Updated. |
| Multiple statuses | same + `08-states.html` | All 6 status styles + 4 cues (Stale, Blocked, Action needed, Heads up) distinguishable by text, dot and tint; none relies on colour alone | A table cell with badge **and** cue is wide; wraps below badge only if space is short |
| Long customer names and addresses | `09a`, `09f` | Table: two-line clamp + tooltip; mobile: wrap with `overflow-wrap:anywhere`, notes in strips | Tooltips are hover-only; touch users need the job page to read the full value |
| Dense dashboard | `09b-stress-dense-dashboard.html` | 7 KPI tiles fit one row at ≥1280px; 10 exceptions and 15 rows remain scannable | Real exception rows (AttentionQueue) were not rendered; their content is a representative guess |
| Vehicle inspection photos | `09c-stress-photos.html` | 16 slots with saved / uploading / queued / failed / empty states distinguishable by icon + text + colour; long labels clamp to two lines | Prototype thumbnails are placeholders; real photo aspect ratios, loading, retry behaviour untested |
| Forms with validation | `09d-stress-form-validation.html`, `04-inspection-mobile.html` (step 1 and 5) | Summary + inline messages + invalid border (3px edge + icon + text) give three redundant signals | The app today uses a **toast**; showing inline messages from the same `missing` list needs product sign-off (UI-5) |
| Admin / super-admin settings | `09e-stress-settings.html`, `06c-super-admin-settings.html` | 12 long toggle labels wrap without overflow; switch hit area 52×44 | Real `FeatureFlagsCard` flags were never seen; labels are placeholders |
| Mobile with substantial content | `09f-stress-mobile-content.html` | 12 cards + 10-chip scrolling row with edge fade + ~180-character address all stay inside 390px | Chip scrolling is a horizontal gesture; needs a visible scroll affordance (fade added) and keyboard operability check |

## Responsive behaviour (v2 Command Center and Jobs)
Screenshots: `screenshots/proposed-v2/v2-r-01-{1920,1180,1024,768,390}.png` and `v2-r-02-*`.
- **≥1280px:** full sidebar (248px), KPI strip on one row (7/6 tiles), tables.
- **≤1180px:** sidebar collapses to a 72px icon rail.
- **≤900px:** sidebar becomes a menu button; tables become cards with all actions as labelled 44px buttons; KPI tiles 2-up with the last odd tile spanning both columns (no orphan).
- **≤560px:** breadcrumbs reduce to the current page; **≤420px:** KPI icon stacks above label.

## Conclusions and limits
1. The visual system copes with long names, large numbers, mixed states and long forms **in static form**; the defects it exposed were real and are fixed in v2.
2. Four classes of defect were invisible until populated: hidden actions, ambiguous truncation, unbroken-word overflow and tinted-background border contrast. **Any implementation must be tested with populated data** — the current app could not be, because the backend was unreachable.
3. Residual risks to carry forward: performance at scale, real component behaviour, real photos, real flag labels, touch access to tooltips, and keyboard operability of scrolling chip rows.
