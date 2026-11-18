# C. Design Direction Report

Viewable: `mockups/07-directions-style-tiles.html` (screenshot `screenshots/proposed-v2/v2-07-directions-style-tiles.png`). All three tiles use the same fictional data and the same components so differences are visible, not asserted.

## 1. What the product actually has to do (the selection criteria)

Derived from the code and routes (`02-ui-audit.md`), not from taste:

| Requirement | Evidence | Weight |
|---|---|---|
| **Drivers use phones, often outdoors**, one-handed, in a PWA with offline queueing | `InspectionFlow`, `PendingUploads`, `OfflineBanner`, `service-worker.ts`, 44px bottom nav | Highest |
| **Dispatchers/admins scan many jobs on desktop** | `ControlJobs` (10 views, 7-column table), `ControlOverview` queues, KPI strips | High |
| **Status must be readable at a glance** and not by colour alone | 16 job statuses collapsing to 6 labels, `statusConfig.ts` | High |
| **Same product, 3 roles** (driver / admin / super-admin) must feel like one brand | 3 current shells (`02-ui-audit.md` U03/U04) | High |
| **Low regression risk**: shadcn + Tailwind tokens, existing `ui-kit/`, lots of tests | `src/test/*`, `components/ui/*`, `index.css` tokens | High |
| Light-first; dark mode exists and must stay correct | `.dark` block with documented contrast maths | Medium |
| Brand: "Precision in every move"; blue identity (`axentra-logo.png`) | `Login.tsx`, `AppHeader.tsx` | Medium |

## 2. The three directions

Benchmarks are named only as quality references (clarity, restraint, density), **from general familiarity, not from research performed in this session**: Stripe Dashboard (legibility, tabular figures), Linear (restraint, density), fleet/field-service products such as Samsara or Onfleet (status-first operations UI). None is a template.

### Concept A — Refined Enterprise *(recommended)*
| Aspect | Specification |
|---|---|
| Typography | Inter (single family) **or the system stack — decision pending, see `13-typography-and-font-evaluation.md`**; weights 400/500/600/650; `tabular-nums` for IDs, counts, money. Body 14px desktop / 16px inputs on mobile; nothing under 12px. |
| Colour | Brand navy `#0B1C3F`, action blue `#1E4FA8`, neutral cool greys; semantic colours as **dark text on tinted fill** (never white on saturated). |
| Layout | One shell for all roles: 248px light sidebar (desktop) + 56px top bar; bottom nav (mobile). 12-col content grid, max 1360px. |
| Surfaces | White cards on `#F4F6F9`, 1px border `#DCE2EA`, one soft shadow, 12px radius. |
| Spacing/density | 4/8px scale; comfortable by default; table rows 52px (with plate) / 40px compact. |
| Navigation | Reuses the existing Control sidebar structure and labels; active item = soft-blue fill + blue text. |
| Buttons/inputs | 36px desktop buttons (44–48px mobile), 8px radius; inputs 44px with a ≥3:1 border (`#7C8BA0`, verified on rendered pages), visible labels. |
| Tables | Sticky 36px header, 12px semibold column labels (no all-caps), row hover, status pill + plate cell. |
| Cards | KPI: label, value, one-line note, 3px state edge. |
| Mobile | Single dark-navy brand band, back + title in one row, sticky CTA bar, 4-tab nav. |
| Personality | Calm, dependable, operational. |
| **Advantages** | Lowest risk; maps onto current shadcn tokens; highest legibility for outdoor use; consistent across roles. |
| **Trade-offs** | Least "wow"; relies on craft (spacing, type) rather than effects. |

### Concept B — Contemporary SaaS
| Aspect | Specification |
|---|---|
| Typography | Plus Jakarta Sans (appears in the skill's typography results), 800-weight display numerals. |
| Colour | Vivid blue `#2B59E8`, lavender-tinted surfaces, teal accent. |
| Layout | Floating cards, generous whitespace, gradient hero strip behind page headers. |
| Surfaces | 16px radius, layered shadow `0 8px 24px`. |
| Density | Spacious; rows 60px. |
| Navigation | Floating/rounded sidebar, pill tabs. |
| **Advantages** | Most distinctive and marketing-friendly. |
| **Trade-offs** | Fewer rows per screen (hurts dispatchers); shadows/gradients add paint cost on low-end phones; most files to touch; "avoid unnecessary gradients/effects" quality gate. |

### Concept C — Precision Operations
| Aspect | Specification |
|---|---|
| Typography | IBM Plex Sans + IBM Plex Mono for references/numbers (my choice; not from a skill result). 12–12.5px body. |
| Colour | Ink `#0B1220`, blue `#0B57D0`, amber/green/red semantic text on tinted 4px-radius tags. |
| Layout | Border-defined panels, no shadows, 34px rows, 28px table header. |
| Navigation | Dense sidebar, command palette emphasis. |
| **Advantages** | Most information per screen; excellent for dispatch tables. |
| **Trade-offs** | 12px body text conflicts with outdoor phone use and the "no text under 12px" rule; cold personality; weakest fit for drivers; largest typographic change. |

## 3. Comparison against Axentra's requirements (1–5, 5 = best fit)

| Criterion (weight) | A | B | C |
|---|---|---|---|
| Driver phone legibility, outdoors (×3) | 5 | 4 | 2 |
| Dispatcher desktop scanning (×2) | 4 | 3 | 5 |
| One brand across 3 roles (×2) | 5 | 4 | 3 |
| Regression risk / reuse of shadcn + tokens (×3) | 5 | 3 | 3 |
| Accessibility headroom (×2) | 5 | 4 | 4 |
| Visual distinctiveness (×1) | 3 | 5 | 3 |
| Performance cost (×1) | 5 | 3 | 5 |
| **Weighted total (max 70)** | **66** | **51** | **47** |

Scores are judgement; weights are mine and reflect the requirement table above. The ordering is robust: A stays first unless dispatcher density is weighted above driver legibility *and* regression risk.

## 4. Recommendation: Concept A, with a documented **compact density mode** from C

**Why A is commercially and aesthetically strongest here**
1. The audit's biggest problems are *inconsistency and contrast*, not lack of flair (`U01–U04`). A fixes those directly and cheaply; B and C add stylistic change on top of unresolved inconsistency.
2. It keeps what already works (Control sidebar structure and labels, skeletons, UKPlate, bottom nav).
3. Real users are drivers on phones first. A is the only direction that doesn't trade phone legibility for either spectacle (B) or density (C).
4. It is the smallest delta from today's token system, so it can ship in phases behind visual-regression checks.

**What I borrow from C (not a fourth concept):** a compact table mode (44px rows, 13px text, still ≥12px) — shown on the POD Review Queue and Recently Completed tables in `mockups/v2/01-command-center.html` (`.t.compact`) — for `/control/jobs`, finance and invoice-prep. This addresses C's one real advantage without importing its type size or tone.

**What would change the recommendation:** if user research showed dispatchers spend most of their day on very large tables and drivers barely use the app, C-leaning density should become the default. That research has not been done here.

## 5. Re-validation after the evidence-closure pass
The recommendation stands. What the new evidence changed: (1) the problems to fix are even more concentrated in accessibility and consistency (`02-ui-audit.md`), which A addresses directly; (2) the populated stress tests (`10-populated-layout-assessment.md`) showed that dense tables are the hardest part of any direction — A needed a sticky action column, two-line clamping and icon row-actions to hold up at 1440px, which supports keeping C's compact mode as an option; (3) the font question (`13-…`) is independent of the direction.
