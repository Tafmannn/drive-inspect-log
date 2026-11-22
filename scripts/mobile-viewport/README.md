# Mobile viewport / rotation checks

Playwright scripts used to reproduce and verify the iPhone rotation and scrolling
fixes. They run against a local dev server pointed at a **fake Supabase host**.
`mock.cjs` answers every request with fixtures (25 jobs, including one with a very
long reference and address), so no staging or production data is touched.

Rotation is simulated by resizing the **same mounted page** (no reload) between
portrait and landscape at least twice.

```bash
# 1. Dev server with auth bypassed and the fake backend (port 8080)
VITE_ENABLE_AUTH=false VITE_SUPABASE_URL=http://fake-supabase.test \
VITE_SUPABASE_PUBLISHABLE_KEY=fake-key npx vite --host 127.0.0.1 --port 8080

# (portal.cjs only) a second server with auth on, port 8081
VITE_SUPABASE_URL=http://fake-supabase.test VITE_SUPABASE_PUBLISHABLE_KEY=fake-key \
npx vite --host 127.0.0.1 --port 8081

# 2. Run a script (Playwright is resolved from the global install)
cd scripts/mobile-viewport
NODE_PATH=$(npm root -g) node acceptance.cjs   # driver acceptance flow
NODE_PATH=$(npm root -g) node sweep.cjs        # every layout, 2x rotation, overflow with #root's clip lifted
DEVICE="iPhone SE" PW=320 PH=460 NODE_PATH=$(npm root -g) node sweep.cjs
NODE_PATH=$(npm root -g) node repro.cjs        # pull-to-refresh, fonts, step scroll, signature, Command Center scroll
```

| Script | What it checks |
| --- | --- |
| `acceptance.cjs` | Jobs halfway → job → inspection note → photo viewer rotated → close → signature rotated → Back to Jobs |
| `sweep.cjs` | Driver/admin/super-admin/Command Center routes: layout width vs viewport, offenders hidden by `#root`'s clip, which element scrolls |
| `repro.cjs` | PTR diagonal/pinch/cancel, input font size by orientation, new-step scroll, landscape→portrait signature, Command Center scroll on push/Back |
| `remount.cjs` | Re-opening an inspection in the same tab keeps the note and step |
| `sigreload.cjs` | Signatures survive a same-tab reload and Next/Previous; Clear forgets them |
| `verify.cjs` | Reduced motion, offline draft + rotation, desktop Command Center |
| `damage.cjs` | Damage editor bottom sheet (V2) in a 340px-high landscape and portrait, rotated twice: Save reachable; page scrolls after close. Exits non-zero on failure |
| `portal.cjs` | Customer portal routes and its photo viewer (auth-enabled server) |

Screenshots go to `shots/` (git-ignored).

**Limits.** This is Chromium with iPhone emulation, so WebKit-only behaviour isn't
reproduced here: Safari's collapsing toolbar (`vh` vs `dvh`), zoom on focusing an
input, safe-area insets, rubber-band overscroll, and the software keyboard. The
scripts check the CSS that controls those cases (font sizes, `dvh`, `env()` padding),
but the behaviour itself needs a real iPhone.
