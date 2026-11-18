# Axentra UI redesign review — evidence-closed package

**Planning and design evidence only. No application source file was modified.** Concept A — Refined Enterprise is provisionally approved as a *direction*; no production implementation, token change or dependency is authorised.

## Read in this order
| File | Content |
|---|---|
| `08-executive-decision-brief.md` | **Decision brief**: direction, first phase, approvals needed, risks, where to look |
| `01-executive-assessment.md` | A. Executive assessment |
| `02-ui-audit.md` | B. **Final evidence-based audit**: evidence base, revised scores (5.5/10), verified findings V01–V14, measured defects, issue register U01–U28, 46-route inventory |
| `09-screen-coverage-matrix.md` | **Complete coverage matrix**: all 88 screenshots classified (14 fully / 44 partially / 26 loading-empty-error / 4 unavailable) |
| `03-design-directions.md` | C. Three directions, comparison, recommendation (re-validated) |
| `04-design-system.md` | D. **Verified design system** (tokens, components, mapping to existing code) |
| `05-concept-pack-and-comparisons.md` | E+F. **Concept A v2 screens and current-vs-proposed comparisons**; disclosure of first-pass errors |
| `10-populated-layout-assessment.md` | Populated-layout stress tests (fictional data) and the defects they exposed |
| `11-preservation-matrices.md` | **Field/control preservation matrices** for the six screens (computed) |
| `12-contrast-and-text-verification.md` | Rendered contrast, non-text contrast, small-text contexts |
| `13-typography-and-font-evaluation.md` | System fonts vs self-hosted Inter (nothing installed) |
| `06-prioritisation-and-roadmap.md` | G. **Prioritised UI-only roadmap** (P0/P1/P2, quick wins, 7 phases) |
| `14-traceability.md` | Every recommendation → observed issue or objective |
| `07-quality-risk-assessment.md` | H. Outstanding uncertainties and risks |
| `00-skill-usage-log.md` | `ui-ux-pro-max` searches run and how they were used |

## Viewable assets
- **Interactive prototypes** (open in a browser, no server): `mockups/v2/*.html` — start with `01-command-center.html`. `mockups/07-directions-style-tiles.html` (three directions). `mockups/v1-first-pass/` is superseded and kept only for traceability.
- **Screenshots:** `screenshots/proposed-v2/` (Concept A v2, populated stress tests, responsive widths, font comparison), `screenshots/proposed-v1/` (superseded), `screenshots/current/` (**26 current-state screenshots selected for comparison**; all 88 were reviewed, see the coverage matrix).
- **Raw evidence:** `screenshots/*.json` (capture log, layout, contrast, current-UI metrics, small-text contexts, font measurements, coverage classification), `skill-search-outputs/`.
- **Tooling:** `tools/` (re-runnable scripts; see `tools/README.md`).

## How the "current" screenshots were produced
`npm ci --ignore-scripts`; Vite dev server with `VITE_ENABLE_AUTH=false` and `VITE_SUPABASE_URL=http://127.0.0.1:9` (unreachable) so **nothing contacted a real backend**; roles via the dev-only `?admin=1` / `?super=1`. Env vars on the command line only; no `.env` change. Result: data screens show skeleton/empty/error states — **no populated current-app screen exists** in this evidence. This container resolves `system-ui` to Inter, so current screenshots render in Inter, not the devices' fonts.

## Audited version
Audit and screenshots reflect the repository at commit `dd6beea` (`main` at `cc2dbdd`). `main` has since advanced to `b1c0784` with PDF/email navy-banner changes (`podPdf*.ts`, `podEmail.ts`) and new brand assets (`public/brand/axentra-logo-on-dark.png`, `public/email/axentra-logo-email-dark.png`). Those changes do not touch the React screens audited here and were **not** re-audited; the new reversed (on-dark) logo is relevant to Concept A's navy mobile band and should be reused.

## Sensitivity check (before commit)
Text/JSON/HTML/scripts were scanned for the app's own `.env` values, JWTs, API-key patterns, private keys, emails, phone numbers, cloud hostnames, non-local IPs and environment paths: **none found** (the only 'phone' hits were all-zero fake job IDs). Every screenshot was looked at; current-state captures show only skeletons, empty states and static copy (placeholder `you@example.com`), and all populated content is fictional. Vehicle plates, postcodes, names and addresses in the prototypes are **made-up patterns** labelled "(sample)"; any resemblance to real ones is coincidental.

## Integrity
- Running the dev server with `VITE_SUPABASE_PROJECT_ID` overridden **rewrites `supabase/functions/mcp/index.ts`** (build plugin). That happened once in the first pass (restored with `git checkout`); in the evidence-closure pass the variable was **not** overridden. `git diff --name-only` was empty before the commit; the commit adds only `docs/ui-redesign-review/`.
- Prototype fonts load from the Google Fonts CDN at view time; no font was installed in the app.
- Everything visual is fictional sample data.

## Continuation checklist
- [ ] Populated screens on a seeded **non-production** backend or fixtures; re-score dimensions 9–10 (`R31`).
- [ ] Customer portal screens with a portal test account.
- [ ] Real-device check (iPhone/Android) for fonts, inspection flow, offline behaviour.
- [ ] Derive and validate a dark theme for Concept A (`R30`).
- [ ] Per-component check of the 8 placeholders and 14 "not drawn" items (`11-…`).
- [ ] Decide font Option S vs I (`13-…`); approve Phase 1a scope (`08-…`).
