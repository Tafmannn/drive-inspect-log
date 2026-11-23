# Axentra: controlled Vercel deployments

## Why

On 23 Nov 2026, repetitive commits across abort-workflow development branches created many Vercel preview deployment records, including cancelled and failed builds. Git commits are useful; unnecessary Vercel deployments are not.

## Effective Git policy

Vercel reads `vercel.json` for Git-integrated deployments:

- `main`: **deploy automatically to production**.
- `deploy-preview/<slug>`: **deploy a preview automatically when deliberately selected**.
- Every other branch, including `chatgpt/*`, `claude/*`, `fix/*`, `feature/*`, and legacy staging branches: **no automatic Git deployment**.

The `git.deploymentEnabled` rules use Vercel's documented minimatch branch patterns, with a matching `true` taking precedence over matching `false`. The catch-all `**` denies routine branches, while the two allowlisted patterns opt in.

## Normal agent development

1. Branch from up-to-date `main`. Older branches must incorporate the new `vercel.json` policy before pushing; Vercel can evaluate configuration from the pushed commit.
2. Make related source changes; run relevant tests and `npm run typecheck`/`npm run build` where feasible.
3. Push code to the normal development branch and open a PR. GitHub Actions validates it without requiring a Vercel preview.
4. Merge only when the owner authorises the production release; `main` deploys once for the merge.

## Deliberate preview

1. Use or create a branch named `deploy-preview/<slug>` based on the current `main`.
2. Apply tested changes to that branch and push when a reviewable preview is needed.
3. Review the generated Vercel preview URL. Continue normal changes off the preview branch to avoid creating unneeded builds.
4. Delete/retire the temporary preview branch when finished; changes still reach production only via an authorised merge to `main`.

## Bypasses, limitations and monitoring

- Vercel CLI/REST/deploy-hook requests are **not** inherently prevented by Git branch configuration. Agents must not call those without explicit deploy authorisation; Vercel project permissions/policies can provide separate enforcement.
- Existing branches with outdated `vercel.json` may still trigger deployments until updated from `main`; monitor their first push after rollout.
- This is not a rate limiter, GitHub commit limiter or approval-gate replacement. Repeated pushes to `main` or `deploy-preview/*` still deploy.
- Cancelling/skipping an already-created build need not refund any deployment allowance. Read actual usage/plan limits in Vercel before assuming budget is available.
- Existing GitHub Actions validation workflows stay in place, and frontend deployment does not apply Supabase migrations.

## Policy check and rollback

Run `node scripts/check-vercel-deployment-policy.mjs` before changing the rules. CI also runs this check on PRs and `main`.

To revert this **configuration change only**, remove `git.deploymentEnabled` from `vercel.json`, restore the prior CI/workflow documentation as appropriate, and redeploy `main`. That restores automatic previews on feature branches and can reintroduce quota spikes. Never change the SPA rewrite rule as part of rollback.
