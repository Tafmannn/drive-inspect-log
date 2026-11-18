# D. Axentra UI Design System — Concept A (verified specification)

Implementation-ready **presentation** spec. It changes colours, type, spacing, radii, shadows and component *styling* only. No props, handlers, routes, permissions, statuses or data shapes change. Reference stylesheet: `mockups/v2/assets/axentra-v2.css`. All contrast figures were computed, and the prototype-level results were re-measured on the rendered pages (`12-contrast-and-text-verification.md`). Reference prototypes: `mockups/v2/`.

## 1. Colour tokens (light theme)

| Token | HEX | Use |
|---|---|---|
| `navy-900` | `#0B1C3F` | Brand mark, mobile brand band, `theme-color` |
| `navy-800` / `navy-700` | `#12295A` / `#1B3770` | Avatar fills, hover on navy |
| `primary` | `#1E4FA8` | Primary buttons, links, focus ring, active nav text |
| `primary-hover` | `#173F87` | Primary hover/pressed |
| `primary-soft` | `#E8F0FB` | Active nav fill, info tint |
| `bg` | `#F4F6F9` | App background |
| `surface` | `#FFFFFF` | Cards, sidebar, inputs |
| `surface-2` / `surface-3` | `#F8FAFC` / `#EEF2F6` | Table header, hover, chips |
| `border` | `#DCE2EA` | Decorative dividers and card edges |
| `border-strong` | `#7C8BA0` | **Control boundaries** (inputs, outline buttons, radios, segmented, empty photo slots). *Changed from `#8795A8` after rendered checks showed 2.81:1 on the tinted page background.* |
| `text` / `text-2` / `text-3` | `#0F1B2D` / `#435166` / `#5B6779` | Primary / secondary / tertiary text |

### Semantic pairs (badge = dark text on tint; solid = white text on fill)

| Role | Text on tint | Tint | Solid fill (white text) |
|---|---|---|---|
| Success | `#0F6B3A` | `#E3F4EA` | `#15803D` |
| Warning | `#7A4A00` | `#FFF1D1` | `#B45309` |
| Danger | `#B42318` | `#FDE7E4` | `#C62E22` |
| Info | `#1E4FA8` | `#E8F0FB` | `#1E4FA8` |
| Complete (violet) | `#4A3CB0` | `#ECE9FB` | — |
| Neutral | `#475467` | `#EEF1F5` | — |

### Computed contrast (all pass)

| Pair | Ratio | Needs |
|---|---|---|
| text on bg / surface | 15.96 / 17.28 | 4.5 |
| text-2 on surface | 8.05 | 4.5 |
| text-3 on surface / page / chip fill / primary-soft | 5.74 / 5.30 / 5.10 / 5.00 | 4.5 |
| white on primary / primary-hover | 7.67 / 10.01 | 4.5 |
| primary on primary-soft | 6.68 | 4.5 |
| success / warning / danger / info / complete / neutral text on tint | 5.78 / 6.68 / 5.55 / 6.68 / 6.87 / 6.79 | 4.5 |
| white on danger-solid / success-solid / warning-solid | 5.50 / 5.02 / 5.02 | 4.5 |
| danger text on white (error copy) | 6.57 | 4.5 |
| `border-strong` `#7C8BA0` vs white / page `#F4F6F9` / chip fill `#EEF2F6` | **3.47 / 3.20 / 3.08** | 3.0 (WCAG 1.4.11) |
| Focus ring `#1E4FA8` (2px, with 2px white gap) vs white / page / chip fill / `primary-soft` | **7.67 / 7.08 / 6.82 / 6.68** | 3.0 |
| Button on tinted alert/photo fill: border `--text-3` `#5B6779` | ≥ 5.0 | 3.0 |
| `border` vs surface (decorative only) | 1.30 | n/a |

**Dark theme is not yet specified.** The existing `.dark` tokens in `index.css` must be kept and re-validated after the light palette lands; deriving a dark mapping for Concept A is an open item (see `07-quality-risk-assessment.md`).

### Job status mapping (replaces white-on-saturated in `src/lib/statusConfig.ts`)

Colour values only; status keys, labels and the `ADMIN_TRANSITIONS` logic stay untouched. Labels below are the *existing* labels.

| Existing label | Statuses sharing it | Badge (text / tint) | Today's white-text ratio |
|---|---|---|---|
| NEW | new | `#1E4FA8` / `#E8F0FB` | 4.02 |
| DRAFT, INCOMPLETE | draft, incomplete | `#475467` / `#EEF1F5` | 3.26 |
| READY, ASSIGNED | ready_for_pickup, assigned | `#0F6B3A` / `#E3F4EA` | 2.22 |
| IN PROGRESS | pickup_in_progress, pickup_complete, in_transit, delivery_in_progress | `#7A4A00` / `#FFF1D1` | 2.20 |
| COMPLETED | delivery_complete, pod_ready, completed | `#4A3CB0` / `#ECE9FB` | 5.65 |
| CANCELLED | cancelled | `#B42318` / `#FDE7E4` | 3.55 |

Every badge keeps its text label and gains a 6px dot, so colour is never the only signal. *Note (out of scope):* several distinct statuses share one label (e.g. four statuses all read "IN PROGRESS"). Splitting them would change what users see operationally and is **not** proposed here.

## 2. Typography

| Item | Spec |
|---|---|
| Family | **Decision pending (see `13-typography-and-font-evaluation.md`).** Today **no typeface is declared** (system font per device). **Option S (recommended for Phase 1):** keep the system stack `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` + `tabular-nums`. **Option I (Phase 1b, needs approval):** self-hosted Inter variable, Latin subset (new dependency; ~47 KB; ≈7% wider than Roboto/Arial-class fonts). The prototypes are drawn in Inter. |
| Numerals | `font-variant-numeric: tabular-nums` on IDs, counts, money, timestamps. |
| Scale | Display 28/32 · H1 24/32 · H2 18/24 (mobile page title) · H3/card title 14/20 semibold · Body 14/20 · Body-mobile 16/24 · Label 13/18 semibold · Caption 12/16 · **Floor: 12px** |
| Weights | 400 body, 500 UI, 600 labels/table heads, 650 headings/KPI |
| Case | Sentence case for table heads and card titles. Reserve tracked uppercase for sidebar group labels only (**12px**, 600, `+0.06em`, `--text-3`). |
| Replaces | `text-[8|9|10|11px]` (383 uses) → `text-xs` (12px) or `text-sm` |

## 3. Spacing, radius, elevation, grid

| Token | Values |
|---|---|
| Spacing (4px base) | 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 |
| Radius | `sm 6` (tags) · `md 8` (buttons, inputs) · `lg 12` (cards) · `pill 999` (badges, chips) |
| Elevation | `e1: 0 1px 2px rgba(15,27,45,.06)` cards · `e2: 0 4px 12px rgba(15,27,45,.08)` popovers/menus. No other shadows, no gradients. |
| Page padding | Mobile 16 · Desktop 28 |
| Content width | Desktop max 1360px; text blocks max 72ch |
| Grid | Desktop 12-col, 16px gutters; KPI strips use 6 or 4 equal columns — **no orphan tile** (fixes U07): use `repeat(auto-fit,minmax(168px,1fr))` so any tile count redistributes evenly; no tile is removed |
| Breakpoints | `sm 640` · `md 768` · `lg 1024` (sidebar appears) · `xl 1280` · max 1360 |

## 4. Shell and navigation (presentation only)

| Element | Spec |
|---|---|
| Desktop sidebar | 248px, `surface`, 1px right border; groups use the **existing** `CONTROL_NAV` groups and labels (`src/features/control/config/navigation.ts`); item 36px high, 8px radius; active = `primary-soft` fill + `primary` text + `aria-current="page"` |
| Desktop top bar | 56px, white, breadcrumb left, role tag + notifications right (existing ⌘K search stays) |
| Mobile | One 44px `navy-900` brand band + one 56px page header (back + title in the same row) + optional 36px breadcrumb **hidden below `md`**; bottom nav 4 tabs, 48px min target, 12px labels, safe-area bottom padding |
| Ops roles at `/`, `/admin`, `/super-admin` | Present inside the Control shell on `lg+` (same content, same routes, same handlers) |

## 5. Components

| Component | Spec |
|---|---|
| Button | 36px (desktop) / 44–48px (mobile CTA), 8px radius; primary `primary`/white; secondary white + `border-strong`; ghost; destructive uses danger-solid. Focus ring `0 0 0 3px rgba(30,79,168,.35)`. Disabled 45% opacity + `not-allowed` + native `disabled`. |
| Icon button | Visual 16–20px icon in a **≥40px (desktop) / 44px (touch)** hit area. |
| Input / select / textarea | 44px (mobile 52px for numeric key-in), 8px radius, `border-strong`, visible label above, helper text below, error text below in `danger` with `aria-describedby`. |
| Segmented control | 44px segments, selected = `primary` fill + white text, `role="radiogroup"`. |
| Switch | 52×44px hit area, 44×26px track (`border-strong` off / `primary` on), `role="switch"`. |
| Touch | ≤ 900px: every button, chip and icon button ≥ 44px; desktop minimum 32px visual with ≥ 4px gaps (WCAG 2.5.8 needs 24px). |
| Tabs / view chips | 32px pills; selected = `navy-900` fill. |
| Card | `surface`, 1px `border`, 12px radius, `e1`; header 14px/650 with optional right-aligned caption. |
| KPI tile | Label top-left (12.5px/550, may wrap to two lines) + icon chip top-right (28px) + value below (26px/650 tabular); 3px left edge in `danger-solid` / `warning-solid` / `primary` when state ≠ neutral. Keeps existing click-through. Column rules: `repeat(N,1fr)` for N = 4–7 at ≥ 1280px, auto-fit below, 2 columns on mobile with the last odd tile spanning both; at ≤ 420px the icon stacks above the label (prevents the "OR G…" truncation seen on the current mobile super-admin page). |
| Table | 36px header on `surface-2`; 12px/600 `text-2` column titles; rows 52–60px (44px compact); row hover `surface-2`; right-aligned numerics. **Last (actions) column is `position:sticky; right:0`** so actions can never be scrolled out of view (found necessary with long data at 1440px). Long text: client names clamp to two lines with a tooltip; routes wrap; models truncate with tooltip. Horizontal scroll only below the icon-rail breakpoint; the existing `ResponsiveList` card layout takes over below 900px. Sticky headers only work when the table is not inside an `overflow` wrapper. |
| Row actions | Desktop: 32px icon buttons (View, Assign/Reassign, POD, Expense) with `aria-label` + tooltip — labels move out of sight, a visible change to confirm with users. Mobile cards: full text labels, 44px. Status secondary cues (Stale, Blocked, Action needed, Heads up) are visible text, not tooltip-only. |
| Badge | 24px pill, 12px/600, dot + label, dark text on tint (Section 1). |
| Plate (`UKPlate`) | Keep existing component; add `lg` size (20px) for detail headers. |
| Modal / drawer | White, 12px radius, `e2`, scrim `rgba(11,28,63,.5)`, 44px close target, focus trap (existing Radix). |
| Toast / alert | Tinted fill + dark text + icon; never white-on-saturated; `role="alert"` for errors. |
| Skeleton | Keep current skeleton components; background `surface-3`, shimmer disabled under `prefers-reduced-motion`. |
| Empty / error | Icon (currency-correct), one-line title, one-line help, action button where one exists today. |
| Focus | Solid double ring: `0 0 0 2px #FFFFFF, 0 0 0 4px #1E4FA8` (≥ 6.68:1 on every surface). An earlier 3px 35%-opacity ring measured ≈1.8:1 and was replaced. Never obscured by sticky bars (`scroll-padding-top: 72px`). |
| Icons | Lucide only (already used); 16/20/24px tokens; 1.75 stroke; decorative icons `aria-hidden`, icon-only controls keep their `aria-label`. |

## 6. Density standards

| Context | Row / control height | Body text |
|---|---|---|
| Mobile (driver) | controls 44–52px, list rows ≥56px | 16px inputs, 14–16px body |
| Desktop comfortable (default) | rows 52px, controls 36px | 14px |
| Desktop compact (`data-density="compact"`) | rows 40px, controls 32px | 13px (never <12px) |

## 7. Mapping onto existing code (no behaviour change)

| Design element | Where it lands | Notes |
|---|---|---|
| Colour tokens | `src/index.css` `:root` (HSL, shadcn naming) | `--primary 219 70% 39%`, `--background 216 29% 97%`, `--foreground 216 50% 12%`, `--muted 210 31% 95%`, `--muted-foreground 216 14% 42%`, `--accent 215 70% 95%` (soft), `--border 214 25% 89%`, **`--input 215 16% 56%`**, `--ring 219 70% 39%`, `--destructive 4 71% 45%`, `--success 142 72% 29%`, `--warning 26 90% 37%` (solid fills; all keep white foreground). Today `--input` is the faint border (`214 32% 91%`), which fails 3:1 for control edges. |
| Semantic tint tokens | New CSS variables `--success-soft`, `--warning-soft`, `--danger-soft`, `--info-soft`, `--done-soft`, `--neutral-soft` + matching `tailwind.config.ts` `colors` entries | Additive |
| Status badges | `src/lib/statusConfig.ts` values; render in `JobCard`, `ControlJobs` columns, `StatusPill` (`ui-kit`) | Colour/format only |
| Buttons, inputs, badge, card, tabs | `src/components/ui/{button,input,badge,card,tabs}.tsx` | Variant classes only |
| KPI | Unify on `ui-kit/MetricBlock` + `control/components/shared/KpiStrip`; `KpiPill` becomes a thin wrapper | Same props/`onClick` |
| Header | `AppHeader.tsx`: merge brand band + title; `Breadcrumbs` `hidden md:block` | Same `title/showBack/onBack/children` props |
| Brand blue | Replace `bg-[hsl(216,100%,40%)]` and `#0b1c3f` literals with `--navy-900` | |
| Font | Option S: `tailwind.config.ts` `fontFamily.sans` stack + `tabular-nums` utility, no dependency. Option I: `index.css` `@font-face` + same config, new dependency | Decision pending — `13-typography-and-font-evaluation.md` |
| Ops-role shell | Reuse `ControlLayout` chrome for `Dashboard`, `AdminDashboard`, `SuperAdminDashboard`, `AdminUsers` presentation | Routing/guards unchanged; **verify no guard or redirect logic is touched** |

## 8. Review-prototype caveats

The prototypes load Inter from Google Fonts at view time; production would self-host if Option I is approved. They use inline SVG icons modelled on Lucide shapes, not the real `lucide-react` glyphs, so icon details will differ slightly in the app.
