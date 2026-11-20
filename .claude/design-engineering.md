# Axentra — design-engineering guide

Read this before UI, motion or mobile work. It routes tasks to skills and records the visual bar.
Preparation only: nothing here has been implemented in the app yet.

## Skill routing — pick only what the task needs

Load the one or two skills that match the task. Never invoke every skill on every request;
most UI tasks need one skill, a few need two.

| Area | Preferred skills |
|---|---|
| Visual design | `frontend-design` (plugin), `ui-ux-pro-max` |
| Apple styling | `apple-design`, `emil-design-eng` |
| Mobile behaviour (PWA, safe areas, 100vh, tap/zoom) | `mobile-native` |
| Gestures (drag, swipe, sheets, pull-to-refresh) | `gestures` |
| Animation implementation | `animate`, `choreograph` (multi-element), `motion` (Motion library API/docs) |
| Animation review | `improve-animations` (codebase audit, read-only), `review-animations` (a diff/component) |
| Performance / jank | `animation-performance` |
| Dashboard quality | `dashboard-design` (plugin) |
| Visual experiments | `prototype` |
| Edge cases / worst-case data | `break-ui` |
| Continuous improvement | `learn-taste` (turn corrections into rules) |
| Too much motion | `remove-animations`; missing motion: `find-animation-opportunities` |

Notes
- `prototype`, `learn-taste` and `review-animations` are user-invoked only (upstream sets
  `disable-model-invocation`): run them as `/prototype`, `/learn-taste`, `/review-animations`.
- `motion` is the Motion AI Kit skill. Its docs MCP server (`motion`, https://mcp.motion.dev, free,
  no key) is declared in `.mcp.json`. Motion+ (paid, `motion-plus`) is deliberately NOT configured.
- `motion` / `framer-motion` are not dependencies yet. Prefer CSS transitions; add Motion only when
  a task genuinely needs springs/gestures/layout animation, and get the dependency approved first.
- Axentra is React web/PWA — ignore React Native/Expo/Swift guidance (`animate-expo`, SwiftUI notes).
- Third-party skills run with full agent permissions; pinned revisions are in `skills-lock.json`
  and `.claude/settings.json`. Re-inspect before updating them.

## Axentra visual standards

- Preserve the approved Axentra visual reference and use the supplied original Axentra branding.
- Premium, light-first SaaS look: refined white and neutral surfaces; navy and cobalt-blue accents.
- Apple system typography on supported devices (`-apple-system, BlinkMacSystemFont, "SF Pro…"`
  stack with sensible fallbacks).
- Controlled, soft shadows; translucent materials (backdrop blur) used sparingly, with a solid fallback.
- Consistent spacing scale, border radii and one icon set — extend existing tokens, never fork them.
- Smooth, responsive touch: immediate press feedback, no 300ms lag, no tap-highlight flash, no sticky hover.
- Subtle, interruptible spring animations; transform/opacity only; nothing that blocks input.
- iPhone safe areas (`env(safe-area-inset-*)`, `viewport-fit=cover`), dynamic viewport units (`dvh`).
- Native browser momentum scrolling — no scroll-jacking or custom scroll physics.
- Responsive mobile dashboard layouts (phone first, then tablet/desktop).
- Honour `prefers-reduced-motion` (gentler, not necessarily zero).
- No unnecessary animation or visual gimmicks; motion must have a purpose.

## Guardrails (from CLAUDE.md)

Design work must not touch Supabase/RLS, auth/roles, job/inspection/evidence/invoicing logic,
production env vars or Vercel config.
