# Review tooling

All scripts are review-only and read-only with respect to the application.

| Script | Purpose | Run |
|---|---|---|
| `capture-current.cjs` | Re-capture current-state screenshots from a locally running dev server (backend deliberately unreachable). | see header comment |
| `layout-check.cjs` | Overflow, clipped text, text <12px, tap-target and hidden-action checks on the v2 prototypes at 320/390/768/1024/1440/1920. | `NODE_PATH=$(npm root -g) node layout-check.cjs <out.json>` |
| `contrast-check.cjs` | Rendered-DOM WCAG contrast for every text node (incl. placeholder, hover/focus/disabled/invalid states in `08-states.html`) and control-boundary contrast. | `NODE_PATH=$(npm root -g) node contrast-check.cjs <out.json>` |
| `current-ui-metrics.cjs` | Rendered font sizes + text contrast on the **current** app routes. | `node current-ui-metrics.cjs <base-url> <out.json>` |
| `font-measure.cjs` | String widths, numeral alignment and font payload for `mockups/v2/10-font-comparison.html`. | `NODE_PATH=$(npm root -g) node font-measure.cjs` |
| `shoot-v2.cjs` | Render the v2 prototypes to PNG. | `NODE_PATH=$(npm root -g) node shoot-v2.cjs` |
| `small-text-contexts.py` | Classify every `text-[8–11px]` use in `src/` by context. | `python3 -I small-text-contexts.py <repo-root> <out.json>` |
| `preservation-matrix.py` | Recompute the field/control preservation matrices from the prototype HTML. | `python3 -I preservation-matrix.py` |

Requires Node + Playwright (Chromium). Running the app's dev server **rewrites `supabase/functions/mcp/index.ts` if `VITE_SUPABASE_PROJECT_ID` is overridden** — do not override it, and check `git status` afterwards.
