import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";

export type ThemeMode = "light" | "dark" | "auto";

const MODE_KEY = "axentra-theme-mode";
// Simple local-clock day window. No geolocation/sunrise-sunset lookup (that
// would need a location permission prompt for a cosmetic feature) — this
// fixed window covers normal daytime hours well enough for a driver app.
const DAY_START_HOUR = 7; // 07:00
const DAY_END_HOUR = 19; // 19:00
const RECHECK_INTERVAL_MS = 5 * 60 * 1000;

function isDaytime(date: Date = new Date()): boolean {
  const h = date.getHours();
  return h >= DAY_START_HOUR && h < DAY_END_HOUR;
}

function readStoredMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    if (raw === "light" || raw === "dark" || raw === "auto") return raw;
  } catch {
    // Private mode / storage disabled — fall through to the default.
  }
  return "light";
}

/**
 * User-facing appearance preference (Light / Dark / Auto), layered on top of
 * next-themes.
 *
 * "Auto" does NOT follow the OS's prefers-color-scheme (next-themes' own
 * "system" mode) — per the appearance complaint this replaces, it follows
 * the LOCAL CLOCK instead: light during the day, dark in the evening/night,
 * re-checked every few minutes so it switches live without a reload.
 *
 * The chosen mode is stored separately from next-themes' own "theme" key
 * (which always ends up holding a concrete "light"/"dark" — never
 * "system" — so next-themes' own flash-prevention script keeps working
 * unchanged on reload).
 */
export function useThemeMode() {
  const { setTheme } = useTheme();
  const [mode, setModeState] = useState<ThemeMode>(readStoredMode);

  const applyAuto = useCallback(() => {
    setTheme(isDaytime() ? "light" : "dark");
  }, [setTheme]);

  useEffect(() => {
    if (mode === "auto") {
      applyAuto();
      const id = setInterval(applyAuto, RECHECK_INTERVAL_MS);
      return () => clearInterval(id);
    }
    setTheme(mode);
  }, [mode, applyAuto, setTheme]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // Private mode — preference just won't survive a reload.
    }
  }, []);

  return { mode, setMode };
}
