// Feature flags — read from app_settings table, cached in memory
import { supabase } from "@/integrations/supabase/client";

const cache: Record<string, boolean> = {};
let loaded = false;

async function loadFlags(): Promise<void> {
  if (loaded) return;
  const keys = ["MAPS_ENABLED", "CLOUD_STORAGE_ENABLED", "VISION_AI_ENABLED"];
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", keys);

  for (const row of data ?? []) {
    cache[row.key] = row.value === true || row.value === "true";
  }
  loaded = true;
}

export async function isFeatureEnabled(flag: string): Promise<boolean> {
  await loadFlags();
  return cache[flag] ?? false;
}

/** Synchronous check — returns false if flags haven't loaded yet */
export function isFeatureEnabledSync(flag: string): boolean {
  return cache[flag] ?? false;
}

/** Pre-load flags at app startup */
export function preloadFlags(): void {
  loadFlags().catch(() => {});
}
