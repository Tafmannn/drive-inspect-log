## Root cause

The preview crashes with `ReferenceError: Cannot access 'c' before initialization` originating in the `logger` chunk. Tracing the imports:

- `src/components/DevRoleBanner.tsx` line 2 imports `isE2ETestMode` **from `@/lib/logger`**.
- `src/lib/logger.ts` does not export `isE2ETestMode`. That symbol lives in `src/lib/runtimeMode.ts` (logger only re-imports `E2E_TEST_MODE` from there).

In the production bundle Rollup/minifier ends up wiring a hoisted binding that is read before its initializer runs, producing the TDZ error at module load. The whole app fails to mount, hence the white screen.

## Fix

Change the import in `src/components/DevRoleBanner.tsx` from:

```ts
import { isE2ETestMode } from "@/lib/logger";
```

to:

```ts
import { isE2ETestMode } from "@/lib/runtimeMode";
```

No behavior change — `runtimeMode.ts` is the actual source of that helper.

## Verification

1. Reload the preview at `/` — app should render (login/dashboard) instead of a white screen.
2. Confirm no `Cannot access 'c' before initialization` in console.
3. `rg "from \"@/lib/logger\"" src` — remaining imports (`logClientEvent`, `installGlobalErrorHandlers`) are all valid exports of `logger.ts`.
