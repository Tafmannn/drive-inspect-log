# Skill usage log — `ui-ux-pro-max`

**Verification:** `.claude/skills/ui-ux-pro-max/SKILL.md` read in full (Query Contract, design-system, dials, token export, stacks). Resources present: `data/*.csv` (styles, colors, typography, ux-guidelines, charts, products, icons, landing, app-interface, react-performance, stacks/), `scripts/{search,core,design_system,preview,reasoning_contract,validate_data}.py`, `references/{pro-rules,quick-reference}.md`. `search.py --help` ran. Python 3 stdlib only. 34 raw outputs saved in `skill-search-outputs/` (26 first pass + 8 evidence-closure pass).

Searches were run with `python3 -I …/search.py`, nothing persisted by the skill (`--persist` not used), no project data in queries.

| Output file | Query | Result | How it was used |
|---|---|---|---|
| `ds-a.txt` | `--design-system` "B2B enterprise vehicle logistics fleet operations dashboard" (density 7) | Pattern *Real-Time/Operations Landing*; style **HUD / Sci-Fi FUI**; neon green `#00FF41` on dark | **Rejected.** Landing-page pattern, neon-on-dark, "accessibility risk: high" — wrong for an operational app and outdoor driver use. Recorded as an off-fit result. |
| `ds-b.txt` | `--design-system` "SaaS field service inspection mobile-first professional" (variance 5) | *Trust & Authority*; style **Accessible & Ethical**; primary `#0F172A`, accent `#0369A1` | Accessibility emphasis adopted; palette not adopted (brand blue kept). |
| `ds-c.txt` | `--design-system` "operations control data-dense dispatch dashboard" (density 9, variance 3) | Pattern *Enterprise Gateway* (landing – n/a); style **Minimalism & Swiss**; primary `#1E40AF` | **Style adopted** for Concept A. Primary adjusted to `#1E4FA8` to stay close to the existing brand (`#0D4696`) while hitting 7.67:1 with white. |
| `style1.txt` | style "enterprise dashboard minimal data-dense" | *Data-Dense Dashboard*: gap 8px, padding 12px, row 36px, sidebar 240px, header 56px | Informed Concept C and the compact density mode; 248px sidebar / 56px bar follow these numbers. |
| `style2.txt` | style "bento modern saas clean" | Bento/modern entries | Reviewed; informed Concept B; not adopted. |
| `color1.txt`, `color2.txt` | color "logistics fleet transport"; "enterprise saas dashboard blue" | Logistics/Delivery: blue `#2563EB` + orange (tracking) + green (delivered); Analytics Dashboard `#1E40AF` | Confirms blue + green/amber/red semantics. Hex values re-derived and contrast-checked, not copied. |
| `typo1.txt`, `typo2.txt` | typography "professional enterprise dashboard readable"; "modern saas clean sans" | Corporate Trust (Lexend/Source Sans 3), Dashboard Data (Fira), Enterprise SaaS Mobile / Friendly SaaS (Plus Jakarta Sans), Minimal Swiss (Inter) | **Inter** for A (Minimal Swiss, tabular numerals); **Plus Jakarta Sans** for B. *IBM Plex for C is my choice, not a skill result.* |
| `chart1.txt` | chart "kpi dashboard status distribution" | Bullet/gauge for performance vs target | Noted; no charts in the six concepts. |
| `ux1.txt` | ux "data table dense scannable" | Table handling (scroll/card fallback), bulk actions | Table scroll wrapper + keep `ResponsiveList` card fallback. Bulk actions = new feature → **out of scope**. |
| `ux2.txt`, `web1.txt` | ux "touch target spacing"; web "safe areas touch" | 44pt/48dp, 8px gap; web targets judged against WCAG 2.5.8; safe-area insets | 44px mobile targets, 8px gaps, safe-area padding retained. |
| `ux3.txt` | ux "focus not obscured" | Offset sticky UI with scroll-padding; 3:1 focus indicator | Focus ring spec + `scroll-padding-top`. |
| `ux4.txt` | ux "form label error" | Labels, error below input + `aria-describedby`, `role=alert` | Form field spec. |
| `ux5.txt` | ux "bottom nav mobile" | Back button, sticky nav padding, inputmode | `inputmode="numeric"` on odometer; nav padding. |
| `ux6.txt` | ux "status badge color not only" | "Use icons/text in addition to color" | Dot + label on every badge. |
| `ux7.txt` | ux "skeleton loading empty state" | Empty-state message + action; reserve space | Skeleton/empty spec. |
| `prod1.txt`, `prod2.txt` | product "logistics delivery fleet"; "inspection checklist field service" | Logistics/Delivery → *Minimalism & Swiss + Flat*, blue + orange + green; Home Services → *Flat + Accessible* | Supports Concept A; other results (drone fleet, grocery) irrelevant. |
| `stk1.txt` | `--stack shadcn` "table form tailwind" | Table/DataTable/form guidance | Mapping stays inside shadcn components. |
| `react1.txt` | react "list rerender memo" | memo/deps guidance | Noted for large lists; not applied (no code changes). |
| `icon1.txt`, `icon2.txt`, `stk2.txt`, `stk3.txt` | icons "navigation status vehicle", "arrow status"; react stack "dashboard layout responsive", "list" | **0 results / off-topic** after one retry | **No verified match.** Icon choices fall back to Lucide (already in the app); layout guidance falls back to the priority table in SKILL.md. |

**Not used:** `--persist`, `--preview`, `--tokens` (I wrote tokens by hand and validated them separately), GSAP presets (motion kept minimal).
**Limitation:** the skill's databases are generic; its `ds-*` outputs mostly matched marketing/landing patterns, so recommendations were filtered by judgement against the product requirements.

## Evidence-closure pass: targeted searches (v2 refinement)
All eight returned results on the first attempt (no retries needed). Raw outputs: `skill-search-outputs/v2-*.txt`.
| Output | Query | Guidance returned | Applied as |
|---|---|---|---|
| `v2-ux-validation.txt` | ux "error summary validation" | Focusable error summary at top; errors below the input with `aria-describedby`; `role=alert` | UI-5 / R24: inline summary + per-field messages in `04-inspection-mobile.html` and `09d`; **flagged for sign-off** because focus movement is behaviour-adjacent and the app currently uses a toast |
| `v2-ux-nav.txt` | ux "sidebar navigation collapse hamburger" | sticky-nav padding; keyboard order = visual order; breadcrumbs for 3+ levels | sidebar → icon rail → menu button; `scroll-padding-top`; breadcrumbs kept (collapsed ≤560px) |
| `v2-ux-table.txt` | ux "table horizontal scroll responsive card" | scroll or card layout | cards below 900px (existing `ResponsiveList` behaviour); sticky actions column added after populated tests |
| `v2-ux-upload.txt` | ux "photo upload progress" | step indicators / progress bar | progress bar + per-slot upload states in `04`, `09c` |
| `v2-ux-dragging.txt` | ux "dragging movements" | provide button/tap alternatives to drags | **Not applied** (no drag in the six screens); note for `SwipeableRow`/`PullToRefresh`: confirm button alternatives exist (open item) |
| `v2-ux-reflow.txt` | ux "text reflow zoom" | wrap chip collections or provide `+n` disclosure; fluid sizes | chip rows wrap on desktop, edge-fade scroll on mobile (R15); 2-line clamps |
| `v2-ux-truncate.txt` | ux "badge chip label wraps" | `nowrap` + shrink for compact labels; expose full text to keyboard/pointer/touch | KPI label rule (R12); `title` on every truncation (`touch` access still weak — open) |
| `v2-style-swiss.txt` | style "minimalism swiss enterprise" | 1 result; confirms Minimalism & Swiss | consistent with Concept A; no new rule |

Searches that were **not** repeated: design-system generation (`ds-*`) — v2 refines the already chosen direction; nothing was persisted by the skill.
