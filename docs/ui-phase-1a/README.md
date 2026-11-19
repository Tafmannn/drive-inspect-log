# UI-only Phase 1a — validation report

> **Not approved for merge.** Draft for review. Nothing in this branch has been merged or deployed, and this report does **not** claim production readiness: it rests on a dev-server build with the backend deliberately unreachable (skeleton/empty data), real components rendered with fixture props, and automated tests — not on populated production data or real devices.

Branch `claude/ui-phase-1a-tokens`, based on `main` @ `b1c0784`. Design review (reference, not part of this change): commit `cbe6c16`, `docs/ui-redesign-review/04-design-system.md`.

## 1. Scope delivered (authorised items only)
| # | Authorised item | Implemented as | Result |
|---|---|---|---|
| 1 | Approved light-theme colour tokens | `src/index.css` `:root` (foreground, primary, muted, muted-foreground, destructive, success, warning, info, border, `--border-strong`, `--input`, `--ring`) + additive `*-soft` tokens + Tailwind entries | Light contrast failures on real routes 190 → 0 |
| 2 | Low-contrast sidebar and role labels | `ControlSidebar`, `ControlTopbar`, `AppHeader` class changes | Sidebar group labels 2.61:1 → 5.59:1; role label 3.43:1 → 5.82:1; ⌘K 2.32:1 → passes |
| 3 | Input / control boundary contrast | `--input` = `--border-strong` (`hsl(215 16% 56%)`) | Inputs median 1.24:1 → 3.42:1; selects, comboboxes, textareas, switches all ≥ 3:1 (light) |
| 4 | Accessible focus ring | `--ring` = action blue; zero-specificity `:focus-visible` fallback (2px ring + page-colour halo) | Real routes: 80/80 Tab stops show an indicator ≥ 3:1 (min 5.82:1); before 74/80 |
| 5 | Job-status badges | `statusConfig.ts` colour values (dark text on tint) | All 16 statuses restyled; keys/labels/transitions identical |
| 6 | Single action-blue token | `--primary`, `--ring`, `--info` = `219 70% 39%` (#1E4FA8-class) | white on primary 7.68:1 |
| 7 | `tabular-nums` | 10 components + `table` base rule | identifiers, amounts, counts, ages |
| 8 | Type scale as tokens | CSS vars + Tailwind `fontSize` tokens; **no existing `text-[Npx]` rewritten** | additive only |

## 2. Deviations and scoped decisions (please review)
| Topic | Decision | Why |
|---|---|---|
| Semantic colours | `--success/--warning/--destructive` set **1% lightness darker than the spec hex** (`142 72% 28%`, `26 90% 36%`, `4 71% 44%`) | The app uses them both as solid fills with white text **and** as text on 10% tints of themselves. Spec values gave 4.40:1 / 4.43:1 on a 10% tint (< 4.5); these give ≥ 4.59:1 and still ≥ 5.27:1 white-on-solid |
| `--background` | **Not changed** (stays white) | 106 consumers; page wrappers, dialogs, sheets and inputs all use it. Changing it to the spec's page tint would turn dialogs/inputs grey. Needs a separate `--page` token (later phase) |
| `--accent` | **Not changed** (stays purple) | Used as hover surface (25×) **and** text colour (16×); the spec's soft-blue `--accent` would make `text-accent` unreadable |
| Brand band blue | `bg-[hsl(216,100%,40%)]` in `AppHeader` **left as is**; only the role-label colour changed | Banner colour is a brand decision, not in the authorised list. (Main just merged navy PDF/email banners.) |
| Status badge dot | **Not added** | Would require markup edits in ~12 components; label text is still shown (not colour-only) |
| Dark theme | Initially unchanged (additive tokens only). **Follow-up commit, at the user's explicit request:** four dark *contrast* token values changed (`--sidebar-primary`, `--input`/`--border-strong`, `--destructive` + `--destructive-foreground`); no redesign | See §5.7 |
| Focus halo | Added `box-shadow` halo after finding the ring alone was **1.12:1 on the blue brand band** | Defect found by measurement during this phase and fixed |
| Dev-only banner | "DEV ROLE OVERRIDE" now renders dark orange (it uses `bg-warning`) | Not shipped to production |

## 3. Changed-file manifest
`git diff --stat origin/main -- src tailwind.config.ts`: **16 files**. No file under `supabase/`, `src/lib/**` other than `statusConfig.ts`, hooks, contexts, routes, services or tests was changed; no dependency added (`package.json`/lockfile untouched).

| File | Lines | Change |
|---|---|---|
| `src/components/AdminJobCard.tsx` | +1 / −1 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `src/components/AppHeader.tsx` | +1 / −1 | Class change: role label `text-white/60` 11px → `text-white/90` 12px. |
| `src/components/DriverJobCard.tsx` | +1 / −1 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `src/components/JobCard.tsx` | +1 / −1 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `src/components/ui-kit/JobHeaderCard.tsx` | +1 / −1 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `src/components/ui-kit/MetricBlock.tsx` | +2 / −2 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `src/features/control/components/ControlSidebar.tsx` | +6 / −6 | Class changes: group labels / subtitle / email / inactive items / "Back to App" / collapse icon contrast and 12px size. |
| `src/features/control/components/ControlTopbar.tsx` | +1 / −1 | Class change: ⌘K hint contrast and 12px size. |
| `src/features/control/pages/ControlOverview.tsx` | +1 / −1 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `src/features/control/pages/jobs/JobsColumns.tsx` | +1 / −1 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `src/index.css` | +77 / −14 | Light-theme colour tokens, `--border-strong`/`--input`/`--ring`, additive tint + type-scale tokens, zero-specificity `:focus-visible` fallback (ring + halo), table `tabular-nums`. `.dark` block: only mirrored values for the new tokens. |
| `src/lib/statusConfig.ts` | +28 / −14 | Badge colour VALUES only (dark text on tint). Keys, labels, groupings and `ADMIN_ALLOWED_TRANSITIONS` untouched. |
| `src/pages/Expenses.tsx` | +1 / −1 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `src/pages/Profile.tsx` | +1 / −1 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `src/pages/Timesheets.tsx` | +5 / −5 | `tabular-nums` class added to an identifier, amount or count (class change only). |
| `tailwind.config.ts` | +19 / −0 | Additive colour entries (`border-strong`, `*-soft`) and `fontSize` tokens (`caption`, `label`, `body`, `title`, `h1`, `display`). Nothing existing changed. |

Additional files (evidence only, not application code): everything under `docs/ui-phase-1a/` (this report, composites, `data/`, `tools/`, `skill-search-outputs/`).

## 4. What was checked on what (read this to judge the evidence)
| Kind | What | Used for | Limitation |
|---|---|---|---|
| **A. Real application routes** | Vite dev server of the real app (`VITE_ENABLE_AUTH=false`, backend URL pointed at an unreachable address, dev-only `?admin=1`/`?super=1`), 20 routes, Chromium, light + dark | contrast/size of shell, sidebars, headers, forms; overflow at 320/390/768/1024/1440; Tab focus; DOM control inventory (31 routes) | **Data screens show skeleton/empty states; nothing is populated** |
| **B. Real components, fixture props** | The real `JobCard`, `AdminJobCard`, `KpiPill`, shadcn `Input/Textarea/Button/Badge/Checkbox/Switch` rendered by an **untracked, uncommitted** harness page (`__p1a_fixture.tsx`) served by the same Vite server | status badges for all 16 statuses, control boundaries, semantic colours, light + dark | Fixture props, not live data; the harness is not part of this PR |
| **C. Calculation** | Token/hex contrast arithmetic | choosing values; status badge pairs | not pixel measurements |
| **D. Automated tests** | Existing vitest suite, `tsc`, ESLint, production build | regression gate | tests were not extended |

*Not performed:* real-device checks, Safari/Firefox, populated production data, print/PDF output of `PodReport`, screen-reader testing, visual-regression tooling.

## 5. Results
### 5.1 Project checks (final code)
| Check | Result |
|---|---|
| `tsc -b --noEmit` | exit 0 |
| `vitest run` | **133 files, 1,075 tests, all pass** (run on final code; also passed before the focus-halo change) |
| `npm run build` | succeeds (PWA precache generated); `git status` clean afterwards |
| ESLint on the 16 changed files | **1 error + 1 warning, identical to `main`** (pre-existing: `require()` in `tailwind.config.ts`, fast-refresh warning in `DriverJobCard.tsx`; neither line touched) |
| New dependencies | none |

### 5.2 Text contrast and size (rendered DOM; login excluded, its glass background is not resolvable by the method)
| Surface | Text nodes | Below 12px (before → after) | **WCAG AA contrast failures (before → after)** |
|---|---|---|---|
| routes light 1440 | 711 | 208 → 135 | **190 → 0** |
| routes light 390 | 474 | 144 → 135 | **17 → 0** |
| routes dark 1440 | 711 | 208 → 135 | **28 → 10** |
| routes dark 390 | 474 | 144 → 135 | **10 → 1** |
| real components (fixture) light 1440 | 332 | 157 → 157 | **60 → 0** |
| real components (fixture) dark 1440 | 332 | 157 → 157 | **33 → 7** |

*Below-12px counts fall only where Phase 1a deliberately raised sidebar/role/⌘K/email text to 12px; the remaining sub-12px text is out of scope (no global rewrite authorised).*

### 5.3 Control boundaries (≥ 3:1 against the surface they sit on)
Light theme, real routes (before → after, median ratio; elements below 3:1 after): inputs 1.24 → 3.42 (10 below, **all on the login page's own-styled glass inputs**); comboboxes 1.24 → 3.42 (0); selects 1.24 → 3.42 (0); textareas 1.24 → 3.42 (0); switches 1.24 → 3.42 (0). One login checkbox is unchanged (custom styling). Dark theme boundaries are unchanged by design (1.59:1; see §6).

### 5.4 Keyboard focus (real routes, light, first 12 Tab stops × 7 routes)
Indicator contrast against the surface: **before 74 of 80 ≥ 3:1** (6 stops — the logo "Go to dashboard" button — at 2.79:1); **after 80 of 80 ≥ 3:1, minimum 5.82:1**. Two earlier measurement mistakes (transparent outlines counted as visible; focus ring measured 1.12:1 on the brand band) were found and fixed during the phase.

### 5.5 Responsive overflow
Page-level horizontal overflow at **320 / 390 / 768 / 1024 / 1440 px: 0 of 76 route captures in light and 0 of 76 in dark, before and after**. Wrapping/truncation of the enlarged 12px sidebar text was checked **by eye on the 1440 and 1024 px composites** (no wrap or truncation); the 320 / 390 / 768 composites are included for reviewers but were not individually inspected for this.

### 5.7 Dark-mode follow-up (requested after the first draft; token values only, all inside `.dark`)

| Token (dark) | Before → after | Measured effect |
|---|---|---|
| `--sidebar-primary` | `224.3 76.3% 48%` → `217 91% 68%` | active sidebar label 2.22:1 → 5.42:1 on the active item (6.45:1 on the sidebar) — **D1 closed** |
| `--input`, `--border-strong` | `217.2 32.6% 22%` → `217 20% 42%` | control border vs page 1.59:1 → 3.44:1; all 50 non-login dark controls now >= 3:1 — **D2 closed** |
| `--destructive`, `--destructive-foreground`, `--danger-soft` | `0 62.8% 56%` + near-white → `0 72% 62%` + dark (`222.2 84% 4.9%`) | white-on-red 4.12:1 → dark-on-red 5.56:1; `text-destructive` on page 4.63:1 → 5.56:1 — **D3 closed**. White-on-red cannot also keep red *text* >= 4.5:1, so this reuses the success/warning/info "bright fill + dark text" pattern already in `.dark`. **Visible change:** destructive buttons/badges in dark mode are a lighter red with dark text. |

Real-route + fixture re-measurement (dark; `data/metrics-dark-followup.json`; `main` → first draft → follow-up): routes 1440 **28 → 10 → 0** text-contrast failures; routes 390 **10 → 1 → 0**; fixture components **33 → 7 → 0** (D4 closed). Overflow 0 in all dark captures. Only the login page's own-styled inputs/checkbox remain below 3:1 (D5, unchanged). Added `src/test/ui-dark-token-contrast.test.ts`, which reads the real `.dark` block and asserts these pairs. Full suite 1,091 tests, `tsc` and build pass. Evidence class: A (real routes, empty/skeleton data) + B (real components, fixture props) + D (tests); **not** populated data, **not** real devices.

Rollback for the follow-up alone: revert its commit; the first-draft dark values return.

### 5.6 Light and dark regression (real routes + real components)
- **Light:** only improvements (§5.2–5.4); no layout shift observed in any composite.
- **Dark (corrected run):** routes 1440: 28 → 10 contrast failures; 390: 10 → 1; fixture components 33 → 7. No new failure appears in dark that was not already there. Status badges render as self-contained light pills in dark (readable, slightly brighter than before; a dark-specific palette would be a dark-theme decision).
- Note: the first dark run used the wrong storage key and produced light screenshots; it was discarded and redone.

## 6. Unresolved defects (all pre-existing unless stated; none introduced by Phase 1a)
| # | Defect | Measured | Why not fixed here |
|---|---|---|---|
| D1 | ~~Dark theme: active sidebar item label~~ **FIXED** in follow-up (2.22 → 5.42:1) | — | closed |
| D2 | ~~Dark theme: control boundaries~~ **FIXED** in follow-up (1.59 → 3.44:1) | — | closed |
| D3 | ~~Dark theme: white-on-destructive~~ **FIXED** in follow-up (now dark-on-red 5.56:1; visible change noted in §5.7) | — | closed |
| D4 | ~~Dark theme fixture: 7 text nodes~~ **FIXED** (0 failures after follow-up) | — | closed |
| D5 | Login/forgot/welcome glass pages: faint secondary text, own-styled inputs/checkbox (10 inputs + 1 checkbox boundary < 3:1) | contrast of text indeterminate by method | Phase 6 (auth screens) |
| D6 | ≈135 text nodes per route set remain < 12px (badges, captions, button labels) | measured | no global rewrite authorised |
| D7 | Text on **15%** tints of the new semantic colours: warning 4.27:1, success 4.35:1 | calculated | rare combination; would need a further 1–2% darkening |
| D8 | `PodReport` print/PDF with the new badge colours not checked | — | not performed |
| D9 | Populated lists/tables/dashboards of the real app never rendered | — | needs a seeded non-production backend |
| D10 | Mobile KPI labels truncate to 2–3 characters on `/control/super-admin` (and admin KPI pills) | visible in `compare-route-light-control-super-390.png`, unchanged | layout fix (design review U17/U18), later phase |
| D11 | `/control` KPI strip shows 7 tiles in a 6-column grid (orphan tile) | visible in the control-overview composites, unchanged | layout fix (U07), later phase |
| D12 | Row actions remain small text buttons; no touch-target changes | — | explicitly out of Phase 1a |

## 7. Evidence of functional preservation
1. **Diff content:** 16 files; every change is a class name, CSS declaration, colour constant or an additive Tailwind token. No hooks, props, handlers, routes, guards, queries or services touched. `package.json` and lockfile unchanged.
2. **Status mappings:** script (`vite-node` on the real module) compared before/after: status keys identical; `ACTIVE/PENDING/TERMINAL` sets identical; `ADMIN_ALLOWED_TRANSITIONS` identical; all 16 labels identical; colours changed for all 16 as intended (`data/status-before.json`, `data/status-after.json`).
3. **No control disappeared:** DOM inventory of **31 routes** (tag, role, accessible name, disabled state, href, type): **736 controls before, 736 after, every route's list identical**, and the visible text of every route is identical (`data/controls-inventory-*.json`).
4. **Test suite:** 1,075 existing tests pass unchanged (permissions, lifecycle, status transitions and inspection tests included).
5. **Fixture check:** the real `JobCard`/`AdminJobCard` render the same 16 cards with the same action buttons (View / Assign / Reassign / POD) before and after.

## 8. Before-and-after visuals
`screenshots/compare-*.png` (left = `main`, right = this branch): control overview at 320/390/768/1024/1440, jobs, control super-admin (desktop + mobile), super-admin settings, admin dashboard, new-job form (1440 and 768), driver jobs (390 and 320), admin home (390); **all 16 statuses** in `JobCard` and `AdminJobCard` (light and dark), shadcn controls (light and dark), dark control overview / jobs / super-admin settings / driver jobs.

## 9. Rollback
- **Whole phase (recommended):** close the draft PR; nothing is on `main`. After a merge, `git revert -m 1 <merge-commit>`.
- **Granular:** `git revert` or restore individual files — `src/lib/statusConfig.ts` alone restores the old badge colours; `src/index.css` + `tailwind.config.ts` restore tokens; component class edits are independent single-line reverts.
- No migrations, no data changes, no new dependencies, no feature flags to unwind.

## 10. Re-running the checks
`docs/ui-phase-1a/tools/` — `p1a-measure.cjs` (routes/fixture contrast, size, boundaries, focus, overflow), `dom-inventory.cjs`, `compare-metrics.py`, `sidebyside.py`. The fixture harness is intentionally not committed; recreate it from the description in §4 if needed. Start **one** Vite server at a time (two servers sharing `node_modules/.vite` produced a duplicate-React error during this phase), and do not override `VITE_SUPABASE_PROJECT_ID` (a build plugin rewrites a tracked file from it).

## 11. Design-skill guidance applied
`.claude/skills/ui-ux-pro-max` is installed on this branch. Guidance used (outputs in `skill-search-outputs/`): *Focus Appearance* (≥ 2px indicator, 3:1) → focus ring; *Color Only* (use text in addition to colour) → status labels kept, no colour-only change; *Color Contrast* (4.5:1) → token and badge values; *Target Size / Touch Target* → no change made (out of Phase 1a scope).
