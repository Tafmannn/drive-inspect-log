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
let loaded = false;

async function loadFlags(): Promise<void> {
  if (loaded) return;
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [...KNOWN_FLAGS]);

  for (const row of data ?? []) {
    cache[row.key] = row.value === true || row.value === "true";
  }
  loaded = true;
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
