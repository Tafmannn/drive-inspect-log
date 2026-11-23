# Axentra — Claude Code notes

UK vehicle-movement app: React + Vite + TypeScript + shadcn, Supabase (Postgres + RLS + Edge
Functions in `supabase/functions`), deployed via Lovable/Vercel. Production Supabase project id is
`project_id` in `supabase/config.toml`; `axentra-staging` exists as a separate project.

## Commands
- `npm test` (vitest, ~40s) · `npm run typecheck` · `npm run build` (typecheck + vite). CI runs tests only.
- `npx eslint <files>` on files you touch — the repo has ~300 pre-existing lint errors; don't add more.

## Where things live
- Money: `src/features/invoicing` (invoices, `findAlreadyInvoicedJobs` = the duplicate-invoice guard),
  `src/features/accounts` (accountant pack, aged debtors, MTD periods), `src/features/control/hooks/useControlProfitabilityData.ts`.
- Pricing advice: `src/lib/pricingBrain.ts` (+ `app_settings.pricing_defaults`). Offer economics: `src/lib/offerEvaluator.ts`.
- Attention Center exceptions: `src/features/attention/engine/exceptionEngine.ts` (pure, tested).
- Roles/permissions: `src/lib/roleModel.ts`; RLS in `supabase/migrations`. Docs: `docs/admin-audit`, `docs/security`.

## Rules
- Production DB: read-only unless the owner approves a specific change. Migrations go through `supabase/migrations` + staging first.
- `.env` is committed on purpose (public URL + publishable key only). Never add secrets to it.
- Money logic stays pure and unit-tested; never treat an unknown cost as zero.
- No customer/platform messages, job acceptance, or payment actions without explicit owner approval.

## Project skills (`.claude/skills`)
- `axentra-offer-check` — bid/accept/counter decision for a job or chain (`scripts/offer-check.ts`).
- `axentra-weekly-numbers` — read-only weekly KPIs via Supabase MCP (`weekly.sql`).
- `prospecting` — third-party PILOT (MIT, pinned; see its PROVENANCE.md); context in `.claude/product-marketing.md`.
- `ui-ux-pro-max` — UI design guidance.
- `mobile-native`, `apple-design`, `animation-performance` — third-party (emilkowalski/skills, pinned in `skills-lock.json`): mobile web polish, Apple-style motion, animation perf.
- Design-engineering toolkit (more emilkowalski skills, Motion AI Kit `motion`, plugins `frontend-design` and `dashboard-design`): see `.claude/design-engineering.md` for which skill to use when and the Axentra visual standards. Load only the skills a task needs.

## Deployment control (important)

Follow root `AGENTS.md` for all ChatGPT/Claude coding and release decisions. In particular:
- Routine `claude/*`, `chatgpt/*`, `fix/*`, `feature/*` and other development branches do **not** automatically deploy.
- Automatic deployment is reserved for `main` and explicit `deploy-preview/<slug>` branches.
- Do not use Vercel CLI/API/redeploy hooks to bypass this without explicit user deployment authorization.
- Batch changes, validate before pushing, and do not use GitHub pushes as a test loop.
- Before touching the deployment rules run `node scripts/check-vercel-deployment-policy.mjs`.
