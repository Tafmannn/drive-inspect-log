# I. Executive decision brief

*Concept A — Refined Enterprise is provisionally approved as the **direction**. Nothing is authorised for production, no tokens or dependencies have changed, no application file has been modified.*

| Question | Answer |
|---|---|
| **Recommended direction** | **Concept A — Refined Enterprise**: one light shell for every role, brand navy + action blue, tinted dark-on-light status pills, UK plate as the vehicle anchor, one soft shadow, restrained "route spine" motif. Scored 66/70 vs 51 (B) and 47 (C) on Axentra's own requirements; only A was built out and tested. |
| **Where the product stands** | ≈**5.5 / 10** (was 5.7 before full evidence). Biggest measured problems are **accessibility and consistency**, not lack of flair: ≈25% of rendered desktop text fails contrast (Control sidebar labels 2.61:1), ≈26% of text is under 12px, status badges fail AA (2.2–4.0:1), ops-role pages use a stretched mobile shell, and two different mobile shells and two super-admin dashboards exist. |
| **Highest-value transformation** | (1) Contrast and size fixes in tokens + status badges (reaches every screen); (2) put ops-role pages in the existing Control shell. |
| **First implementation phase** | **Phase 1a — tokens and foundations:** `index.css` tokens, `statusConfig.ts` colours, control borders, focus ring, sidebar/role-label contrast, `tabular-nums`, 12px floor in tokens. **No new dependency.** One PR, easy rollback. |
| **What the evidence now shows** | All 88 screenshots reviewed (14 fully, 44 partially, 26 skeleton/empty only, 4 unavailable). Concept A v2: 6 screens + 3 super-admin pages drawn with every source control restored (**151 preserved, 8 labelled placeholders, 14 documented not drawn, 0 missing**); rendered checks: 0 AA text failures over 2,274 nodes (min 5.30:1), 240 control boundaries ≥3.08:1, 76 layout checks at 6 widths with 0 findings after fixes. |
| **Must remain untouched** | auth and role logic; `ProtectedRoute`/`AdminRoute`/`SuperAdminRoute` and nav `requiredRoles`; job statuses, labels and `ADMIN_TRANSITIONS`; inspection steps, validation rules and required evidence; pricing/invoicing logic; Supabase config and RLS; API calls; offline queue and draft behaviour; both super-admin dashboards' content (they are not merged). |
| **Approvals needed next** | (a) Approve **Phase 1a** scope. (b) **Font:** stay on the system font (recommended for now) or approve self-hosted Inter as a separate Phase 1b. (c) Sign-offs inside later phases: icon-only row actions, inline validation summary beside the toast, visible status cues, mobile-shell unification. (d) Provide a **non-production dataset** (or fixtures) and a **customer-portal test account** so populated screens and `/portal` can be captured before Phases 3–4. (e) Decide the **dark-theme** approach. |
| **Outstanding risks** | No populated current-app screens were ever seen; portal never seen; real-device fonts and inspection flow untested; dark theme undesigned; 8 placeholders and 14 not-drawn components unverified; inspection-flow regression risk is the highest of any phase (`07-quality-risk-assessment.md`). |
| **Status of the proposal** | **Visually demonstrated and measured on static prototypes; not validated as production-ready.** |

## Where to look
- **GitHub (branch `claude/eager-lovelace-xnjrk1`, folder `docs/ui-redesign-review/`):** reports `00–14`, screenshots (`screenshots/proposed-v2/*.png` render directly on GitHub), curated current screenshots (`screenshots/current/`).
- **Interactive prototypes:** GitHub does not render HTML. Clone/pull the branch and open `docs/ui-redesign-review/mockups/v2/01-command-center.html` (and the others listed in `05-concept-pack-and-comparisons.md`) in a browser; no server needed.
- **Start with:** `01-executive-assessment.md` → `05-concept-pack-and-comparisons.md` → `07-quality-risk-assessment.md`.
