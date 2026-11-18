# H. Final quality and risk assessment — outstanding uncertainties and risks

**A polished concept is not a validated production design.** This document separates what was *demonstrated and measured* from what is still *assumed*.

## 1. Quality gates (re-assessed with evidence)
| Gate | Status | Evidence | What is still open |
|---|---|---|---|
| Preserve functionality and permission boundaries | **Design-level only** | No application file changed (verified, `git diff` empty before commit); phases name guards/wrappers to leave untouched | Not testable until implemented |
| Preserve required operational information | **Strong for the six screens** | Computed matrices: **151 preserved, 8 labelled placeholders, 14 documented as not drawn, 0 missing** (`11-…`) | 8 placeholders and 14 "not drawn" items (e.g. `JobPriceEditor`, `FeatureFlagsCard` flags, `RunOrderModal`, `AssignDriverModal`, `QrDisplayModal`, delivery-flow variant, storage-failure/resume cards) are **unverified** and need a per-component check |
| Works on desktop and mobile viewports | **Demonstrated on prototypes** | 76 checks at 320/390/768/1024/1440/1920: 0 overflow, 0 clipped text, 0 hidden actions (`10-…`) | Only static prototypes; real components, tablets in landscape, 200% zoom untested |
| WCAG 2.2 AA visual | **Colour and target size verified on prototypes** | 2,274 rendered text nodes, 0 failures (min 5.30:1); 240 control boundaries ≥3.08:1; focus ring ≥6.68:1; targets ≥24px, ≥44px at ≤768px (`12-…`) | Dark theme; text over real photos; forced-colours; keyboard order and focus-not-obscured on real pages; screen-reader behaviour; the current login pages |
| Avoid unnecessary animation/gradients/effects | **Met in Concept A** | one shadow, no gradients, reduced-motion respected; only the skeleton shimmer animates | motion on the real app unaudited beyond 4 reduced-motion sites |
| Reusable components | **Specified** | mapping in `04-…` §7 | not built |
| Practical touch | **Demonstrated** | 0 targets <44px at ≤768px | real-device testing |
| Visual performance overhead | **Not measured** | design has no gradients, one shadow | font payload (~47 KB if Inter) and CLS unmeasured |
| Legible in dense screens | **Demonstrated on stress pages** | `09a`, `09b` | **never seen on the real app populated** |
| Cohesive across roles | **Demonstrated** | one shell for driver/admin/super-admin in v2 | needs the shell change implemented |

## 2. Outstanding uncertainties
1. **No populated current-app screens.** All 88 captures are skeleton/empty/error or static; 70 of them show no data at all. Dashboard and density scores are provisional (±1.5). *Needed:* a seeded non-production backend or fixtures.
2. **Customer portal never rendered** (redirects for non-portal users). *Needed:* a portal test account.
3. **Real fonts:** screenshots render in Inter (container default); SF Pro/Segoe UI could not be tested. Prototypes are ≈7% pessimistic for Android/Windows widths.
4. **Dark theme** for Concept A not designed or validated; the existing `.dark` tokens must be re-checked after any token change.
5. **Contrast of current login pages** is indeterminate (gradient/blur); only judged visually.
6. **Real component contents** unreviewed: `EvidenceStatusBadges`, `EvidenceHealthBanner`, `JobPriceEditor`, `PricingSuggestionPanel`, `PricingAuditTimeline`, `JobAdminControls` options, `FeatureFlagsCard` flags, `AttentionQueue` rows, `AssignDriverModal`, `RunOrderModal`, `QrDisplayModal`, `StorageFailureCard`, `ResumeInterruptedInspection`.
7. **Icon-only row actions** and a **visible inline validation summary** are *visible changes* needing product sign-off (R17, R24).
8. **Status labels:** four statuses share "IN PROGRESS" and three share "COMPLETED"; whether to distinguish them is an operational decision, **out of scope**.
9. **Two super-admin dashboards:** presented consistently but not merged (functional decision, out of scope).
10. **Performance at scale** (thousands of rows), keyboard and screen-reader behaviour on real pages: untested.

## 3. Self-audit: defects in my own earlier work (all corrected)
| Defect | Effect | Status |
|---|---|---|
| First-pass audit claimed "Inter is a good choice [V]" | Inter is not declared; the container font masked this | corrected; `13-…` |
| First-pass prototypes used wrong KPIs, invented Management items, chip counts; omitted shortcuts, Quick Actions, Feature switches, bottom nav, card actions | silent loss/invention of functional elements | corrected; 104 first-pass gaps documented |
| First-pass scores rested on 10 of 88 screenshots | over-confident | rescored (5.7 → 5.5) |
| v2 first render: hidden table actions, ambiguous truncation, unbroken-word overflow, 11px text, sub-44 targets, weak border/focus contrast | would have shipped defects | found by populated tests and rendered checks; fixed |
| Layout checker initially exempted scroll containers and ignored text overflow | missed P2 and P4 | check strengthened; found by eye first |

## 4. Residual risks for implementation
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Inspection flow regression (focus loss, signature canvas remount, draft restore) | Medium | High | do last; keep inline renderers; real-device and offline tests |
| Shell change near route guards | Medium | High | render-only wrapper; role-matrix test (driver/admin/super-admin) |
| Table density/truncation with real data differs from prototypes | Medium | Medium | populated snapshot diffs at 5 widths before Phases 3–4 |
| 12px floor causes wrapping in 100+ files | High | Medium | hotspot-by-hotspot, `layout-check`, screenshot diffs |
| Font change (if Option I) alters widths ≈7% | Medium | Medium | separate approval; measure CLS and wrapping |
| Token change affects dark mode | Medium | Medium | validate `.dark` after each token PR |
| Icon-only actions slow users | Low–Med | Medium | tooltips + `aria-label`; user check; fall back to labelled buttons |

## 5. Strongest final recommendation
Adopt **Concept A**. Start with **Phase 1a** (tokens, status-badge contrast, focus ring, sidebar/role-label contrast, `tabular-nums`, 12px floor in tokens) — it fixes the largest measured defects with no dependency and a one-PR rollback. Decide Inter separately (**1b**). Capture populated non-production screens before touching tables and dashboards (Phases 3–4), and treat the inspection flow (Phase 5) as the highest-risk phase.
