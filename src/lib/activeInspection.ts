/**
 * Remember which inspection is open, so that if Android closes the app while
 * the driver is in the camera, reopening it goes straight back to that
 * inspection instead of the home screen (the installed app always starts at
 * "/").
 *
 * The marker is set while the inspection screen is mounted and cleared when
 * it unmounts normally (submit, back, navigating away). A page that Android
 * kills never unmounts, so a marker that is still present at start-up means
 * the inspection was interrupted.
 */

const KEY = "axentra.activeInspection.v1";
/** Ignore markers older than this (the driver has clearly moved on). */
export const ACTIVE_INSPECTION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const PATH_RE = /^\/inspection\/[^/?#]+\/(pickup|delivery)$/;

interface Marker {
  path: string;
  at: number;
  /** Who was doing the inspection; another account never gets resumed into it. */
  userId: string | null;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function markActiveInspection(path: string, userId: string | null, now = Date.now()): void {
  if (!PATH_RE.test(path)) return;
  try {
    storage()?.setItem(KEY, JSON.stringify({ path, at: now, userId } satisfies Marker));
  } catch {
    /* storage full or blocked: resume just won't happen */
  }
}

/** Clear the marker; with a path, only if it is that inspection's marker. */
export function clearActiveInspection(path?: string): void {
  try {
    const s = storage();
    if (!s) return;
    if (path) {
      const current = readMarker(s);
      if (current && current.path !== path) return;
    }
    s.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function readMarker(s: Storage): Marker | null {
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Marker>;
    if (typeof parsed?.path !== "string" || typeof parsed?.at !== "number") return null;
    return { path: parsed.path, at: parsed.at, userId: typeof parsed.userId === "string" ? parsed.userId : null };
  } catch {
    return null;
  }
}

/**
 * The interrupted inspection's path, if there is a recent, valid marker left
 * by this same user.
 */
export function readInterruptedInspection(userId: string | null, now = Date.now()): string | null {
  const s = storage();
  if (!s || !userId) return null;
  const m = readMarker(s);
  if (!m || !PATH_RE.test(m.path)) return null;
  if (m.userId !== userId) return null;
  const age = now - m.at;
  if (age < 0 || age > ACTIVE_INSPECTION_MAX_AGE_MS) return null;
  return m.path;
}
