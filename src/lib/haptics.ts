/**
 * navigator.vibrate is Android Chrome only (iOS Safari has no haptics API
 * for web content) and some browsers reject calls made outside a recent
 * user-gesture window — feature-detect and swallow errors so this is
 * always a safe no-op rather than a source of crashes.
 */
const canVibrate = typeof navigator !== "undefined" && "vibrate" in navigator;

function vibrate(pattern: number | number[]) {
  if (!canVibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // ignore — haptics are a nice-to-have, never worth surfacing an error
  }
}

export function hapticSuccess() {
  vibrate(15);
}

export function hapticError() {
  vibrate([40, 30, 40]);
}

export function hapticTick() {
  vibrate(10);
}
