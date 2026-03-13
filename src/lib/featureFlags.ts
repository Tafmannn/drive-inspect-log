// Feature flags — read from app_settings table, cached in memory
import { supabase } from "@/integrations/supabase/client";

const KNOWN_FLAGS = [
  "MAPS_ENABLED",
  "CLOUD_STORAGE_ENABLED",
  "VISION_AI_ENABLED",
  "AUTO_SHEET_SYNC_ON_JOB_UPDATE",
] as const;

type FeatureFlagKey = (typeof KNOWN_FLAGS)[number];

const cache: Record<string, boolean> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let loadedAt: number | null = null;

async function loadFlags(): Promise<void> {
  if (loadedAt && Date.now() - loadedAt < CACHE_TTL_MS) return;

  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [...KNOWN_FLAGS]);

  for (const row of data ?? []) {
    cache[row.key] = row.value === true || row.value === "true";
  }
  loadedAt = Date.now();
}

export async function isFeatureEnabled(flag: FeatureFlagKey | string): Promise<boolean> {
  await loadFlags();
  return cache[flag] ?? false;
}

/** Synchronous check — returns false if flags haven't loaded yet */
export function isFeatureEnabledSync(flag: FeatureFlagKey | string): boolean {
  return cache[flag] ?? false;
}

/** Pre-load flags at app startup */
export function preloadFlags(): void {
  loadFlags().catch(() => {});
}
