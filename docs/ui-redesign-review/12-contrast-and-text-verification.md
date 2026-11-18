# Technical visual verification: contrast and text size

All numbers here were produced by scripts in `tools/` (re-runnable) from rendered pages or source, not estimated. Outputs: `screenshots/contrast-check.json`, `current-ui-metrics.json`, `current-ui-metrics-summary.json`, `small-text-contexts.json`, `layout-check.json`.

## 1. Current UI, measured in the rendered app
Method: Playwright + Chromium against the local dev server with the backend unreachable; every visible text node on 27 routes × 2 viewports; effective background found by walking ancestors (alpha blending, gradients sampled at their stops); WCAG 2.x thresholds (4.5:1, or 3:1 for large text).

**Excluded:** `/login` and `/forgot-password` — their glass/gradient/blur backgrounds are not reliably resolvable by this method (the script returned implausible 1.0–1.5:1 values), so their contrast is **indeterminate here**; visually the tagline, subtitle and footer text are faint, but no ratio is claimed.

| Viewport | Routes | Text nodes | Below 12px | Fail contrast |
|---|---|---|---|---|
| Desktop 1440 | 25 | 863 | **222 (25.7%)** | **218 (25.3%)** |
| Mobile 390 | 25 | 600 | **155 (25.8%)** | 26 (4.3%) |

Caveats: skeleton/empty states mean list rows and badges (the likeliest sub-12px, low-contrast items) are under-represented; this container resolves `system-ui` to Inter, which can slightly change rendered widths but not colours.

**Where the real contrast failures are (desktop):** almost entirely the Control sidebar and top bar:
| Text | Worst ratio | Notes |
|---|---|---|
| Sidebar group labels ("Overview", "Operations", "Fleet & Drivers", "Compliance & Audit", "Finance", "Administration") | **2.61** | 10px uppercase, muted colour |
| Sidebar subtitle "Command Center", "Back to App" | 3.30 | |
| Search hint "⌘K" | 2.32 | 11px |
| Sidebar item labels (Jobs, Drivers, Invoice Prep…) | 4.26 | just under 4.5 |
| Role label in the brand band ("Admin", "Super Admin", "Driver App") | 3.43 | `text-white/60`, 11px |

**Mobile:** role label 3.43; "Needs Action" red section label 3.76; toast text 3.16–3.60; theme labels ("Dark", "Auto") 4.40.

Combined with the token-level findings in `02-ui-audit.md` (status badges 2.20–4.02, light `--warning/--success/--destructive` with white text 2.14–3.76), accessibility is the single biggest weakness, and it is concentrated and cheap to fix.

## 2. Where the small text actually is (before any global typography change)
`tools/small-text-contexts.py` classifies each of the 383 `text-[8–11px]` uses by the element's context. **Do not apply one global rule; handle by context.**

| Context | Uses | Sizes | Typical example | Recommended treatment |
|---|---|---|---|---|
| Caption / helper text under or beside content | 100 | 11px ×56, 10px ×39, 9px ×5 | `PhotoViewer`, `LauncherCard` captions | → 12px (`text-xs`); this is secondary information users still need |
| Uppercase tracked micro-labels (KPI labels, section labels) | 70 | 10px ×43, 11px ×23, 9px ×4 | sidebar group labels, `JobCard` step labels | → 12px; keep tracking only for sidebar group labels, otherwise sentence case |
| Badges / status pills | 63 | 10px ×33, 11px ×20, 9px ×9, 8px ×1 | `UserStatusBadge`, `Badge text-[10px]` | → 12px/600 with dot (matches the status-badge spec) |
| Form labels / helper under inputs | 28 | 11px ×27 | | → 12px minimum; labels 13px |
| Button labels (xs buttons) | 28 | 10px ×22, 11px ×6 | row action buttons `h-6 text-[10px]` | → 12px with 28px height on desktop, **44px on touch** |
| Other / unclassified (overlays, photo captions, links) | 81 | 11px ×35, 10px ×30, 9px ×15, 8px ×1 | `PhotoViewer` caption over image | review individually; image captions need 12px + a scrim |
| Numeric / counts / mono | 7 | | | → 12px, `tabular-nums` |
| Table header / cell | 5 | | | → 12px header, 13px body |
| Nav / tab label | 1 | | | → 12px |

Top files (uses): `UserDetailEditor.tsx` 30, `AdminDashboard.tsx` 25, `ControlDrivers.tsx` 13, `ControlCompliance.tsx` 12, `ControlFinance.tsx` 12, `DriverIdCard.tsx` 12, `DriverJobCard.tsx` 11, `PermissionEditor.tsx` 11, `InvoicePrepScreen.tsx` 11, `JobsColumns.tsx` 11.

Honest framing: WCAG 2.2 AA has **no minimum font size**. The 12px floor is a legibility rule adopted from the skill's guidance and standard practice, justified here by outdoor phone use. It is a design decision, not a compliance requirement. Changing sizes can cause wrapping/truncation; roll out by context and hotspot with screenshot diffs.

## 3. Proposed Concept A v2: rendered verification
`tools/contrast-check.cjs` over 16 prototype pages (including `08-states.html` with hover, focus, disabled, invalid, placeholder, alert and toast states):

| Check | Result |
|---|---|
| Visible text nodes tested | **2,274** |
| Failing WCAG AA text contrast | **0** |
| Lowest text ratio | **5.30:1** (`--text-3` secondary text on the page background) |
| Disabled controls | 5 text nodes exempt (WCAG exempts inactive components) |
| Placeholders | measured with the other text; pass |
| Text under 12px | **0** (layout check) |

**Non-text contrast (WCAG 1.4.11, ≥ 3:1 against the surface they sit on):**
| Element | Instances | Failing | Lowest |
|---|---|---|---|
| Input / select border | 19 | 0 | 3.20 |
| Outline button border | 94 | 0 | 3.20 |
| Radio card border / radio circle | 40 / 59 | 0 | 3.20 / 3.47 |
| Segmented control border | 1 | 0 | 3.20 |
| Empty photo slot border | 12 | 0 | 3.20 |
| Switch track off / on | 5 / 9 | 0 | 3.47 / 7.67 |
| Checkbox border | 1 | 0 | 3.47 |

**Correction found by this check:** the first v2 token `--border-strong #8795A8` was 3.05 on white but only 2.81 on the page background and failed on tinted surfaces. It is now `#7C8BA0` (3.47 on white, 3.20 on `#F4F6F9`, 3.08 on `#EEF2F6`). Buttons placed on tinted alert/photo fills use `--text-3` for their border.

**Focus indicator:** now a solid double ring (2px white gap + 2px `#1E4FA8`): 7.67 on white, 7.08 on page, 6.82 on chip fill, 6.68 on `primary-soft`. The earlier 35%-opacity ring measured ≈1.8:1 and was replaced.

**Not verified:** dark theme (not designed); text over photographs (real images not used); forced-colours / high-contrast mode; contrast under display calibration or sunlight (physical conditions); the current app's login pages (indeterminate).

## 4. Other measured conformance checks on v2
Target size: all controls ≥ 24px (WCAG 2.5.8 AA); ≥ 44px at ≤ 768px. Desktop icon buttons are 32px with ≥ 4px spacing (meets 2.5.8). Reflow: no horizontal page scroll at 320px (WCAG 1.4.10). See `10-populated-layout-assessment.md`.
