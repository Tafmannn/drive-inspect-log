# Axentra coding-agent instructions

These rules apply to ChatGPT, Codex, Claude Code, and any other coding agent changing this repository.

## Deployment budget and release discipline

- Work on a task-specific development branch, e.g. `chatgpt/<task>`, `claude/<task>`, or `fix/<task>`. These branches must **not** create routine Vercel deployments.
- Commit as necessary for safe version control, but bundle related changes and run local checks before pushing. Do not push trivial incremental fixes solely to trigger a rebuild.
- Before opening or merging a PR, run relevant tests, type checking, and the Vite production build; report failures honestly. Existing GitHub Actions release validation remains in effect.
- Automatic Vercel Git deployments are allowed on **main** (production) and `deploy-preview/<slug>` (explicit preview) only. Do not rename a routine development branch to `deploy-preview/` unless a preview was deliberately requested.
- To request a preview, create or update `deploy-preview/<slug>` using code that includes the current deployment policy from `main`, validate the changes, then push once per reviewable iteration. A preview is not a production release.
- Do not bypass branch rules by calling Vercel deploy/redeploy tools, CLI, REST APIs, deployment hooks or integrations without an explicit request to deploy. A coding or testing request is not automatically deployment authorization.
- Never auto-deploy from an agent retry loop. On build failure, inspect logs and fix locally rather than repeatedly pushing speculative changes.
- Merge to `main` only as part of an explicitly authorized production release; keep its Git integration enabled. Do not force-push `main`.
- Preserve Supabase staging/production separation and require explicit approval for production DB changes. A green front-end build is not proof that migrations were safely applied.
- Before any release, consider the remaining deployment quota. Do not claim a skipped/cancelled deployment restores quota.
- Changes to `vercel.json` deployment rules must preserve `main` production and deliberate previews, pass `node scripts/check-vercel-deployment-policy.mjs`, and state any rollout effects.

See `docs/deployment-control.md` for the runbook and rollback.
