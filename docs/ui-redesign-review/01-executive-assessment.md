# A. Executive UI assessment (evidence-closed)

**Verdict.** Axentra is a competent product with a strong desktop operations shell and a weak, inconsistent surround. Visual maturity **≈5.5 / 10** (judgement, medium confidence; `02-ui-audit.md`). It does not look amateur; it looks like several products sharing a logo — and its accessibility is worse than first thought.

## What changed since the first assessment
The first pass reviewed 10 of 88 screenshots. **All 88 have now been reviewed** and the current app's text was **measured in the rendered DOM**. The score fell from 5.7 to 5.5 and several claims were corrected: no typeface is declared (the first pass wrongly credited Inter — this container's default font masked it), ≈25% of rendered desktop text fails contrast, and the prototypes had omitted or invented real controls (all fixed; `05-…`).

## Biggest weaknesses (all evidenced)
1. **Accessibility is concentrated and cheap to fix:** Control sidebar group labels 2.61:1, "⌘K" 2.32:1, role label 3.43:1; status badges 2.20–4.02:1 (white on iOS system colours); light semantic fills 2.14–3.76:1. **25.3% of rendered desktop text fails AA** (measured on 25 routes).
2. **Small text:** 383 uses of 8–11px; 25.7% of rendered desktop text and 25.8% of mobile text is under 12px.
3. **Inconsistency:** ops roles get a stretched mobile shell on desktop, two different mobile shells, two different super-admin dashboards, a shell-less `/admin/users`, and a dark-glass login.
4. **Mobile defects seen:** KPI labels truncated to 2–3 characters on the control super-admin page, invoice header actions clipped, filter chips clipped, ≈24% of the viewport taken by chrome.
5. **No typeface declared** — type differs per device.

## What is already good
The Control sidebar shell, calm skeletons, 44px bottom nav with safe areas, labelled icon buttons, `UKPlate`, documented dark-mode fixes, no horizontal overflow anywhere.

## Highest-value opportunities
Token and status-badge contrast (one change, every screen); moving ops-role pages into the existing Control shell; a small additive design system (Concept A) with a stricter text-size and target-size floor.

## What the new evidence supports
Concept A v2 was drawn for all six requested screens plus three super-admin pages and tested with hard fictional data (long names, 60-row tables, 16 photo slots, five validation errors): after fixing the defects the tests exposed, **0 AA text failures over 2,274 text nodes, 0 layout findings across 76 checks, 0 missing source elements**. See `10-…`, `11-…`, `12-…`.

## Honest limits
No populated current-app screen was ever seen; the portal was unreachable; real iOS/Windows fonts, dark theme and real component contents were not tested. This is a visually demonstrated and measured concept, **not a validated production design** (`07-…`).

**Recommendation:** approve Phase 1a (tokens, status badges, contrast, focus ring, `tabular-nums`) and decide the font question separately (`08-…`).
