// Feature flags — read from app_settings table, cached in memory
import { supabase } from "@/integrations/supabase/client";

/**
 * Every flag the app reads, with the wording the owner sees in
 * Super Admin → Settings. `risky` flags change where data goes or how it is
 * captured, so flipping them asks for confirmation first.
 */
export const FEATURE_FLAGS = [
  {
    key: "MAPS_ENABLED",
    label: "Maps and distance",
    description: "Address autocomplete, route distance and driver-assignment distances.",
    risky: false,
  },
  {
    key: "VISION_AI_ENABLED",
    label: "Photo reading (OCR)",
    description: "Reads odometer and registration from photos to pre-fill fields.",
    risky: false,
  },
  {
    key: "CLOUD_STORAGE_ENABLED",
    label: "Google Cloud photo storage",
    description: "Where new photos and signatures are uploaded. Switching it moves new uploads only.",
    risky: true,
  },
  // Evidence v2 capture path (capture-time save + background upload).
  // Default OFF; an absent row reads as false. Gates CAPTURE only — the
  // evidence upload queue always drains, so a flag flip never strands items.
  {
    key: "EVIDENCE_V2_ENABLED",
    label: "Evidence v2 capture",
    description: "Saves each photo at capture and uploads in the background. Experimental.",
    risky: true,
  },
] as const;

const KNOWN_FLAGS = FEATURE_FLAGS.map((f) => f.key);

export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number]["key"];

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
    cache[row.key] = flagValueIsOn(row.value);
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

/** A stored flag value as a boolean (rows hold `true` or, historically, `"true"`). */
export function flagValueIsOn(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Forget the in-memory flag cache so the next read goes to the database.
 * Other users' devices refresh within CACHE_TTL_MS or on their next app open.
 */
export function resetFeatureFlagCache(): void {
  loadedAt = null;
  for (const k of Object.keys(cache)) delete cache[k];
}

/** Fresh (uncached) read of every known flag. */
export async function fetchFeatureFlags(): Promise<Record<FeatureFlagKey, boolean>> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [...KNOWN_FLAGS]);
  if (error) throw new Error(error.message);
  const out = Object.fromEntries(KNOWN_FLAGS.map((k) => [k, false])) as Record<FeatureFlagKey, boolean>;
  for (const row of data ?? []) {
    if ((KNOWN_FLAGS as readonly string[]).includes(row.key)) out[row.key as FeatureFlagKey] = flagValueIsOn(row.value);
  }
  return out;
}

/**
 * Set a flag. Only a super admin can write app_settings (RLS), so for anyone
 * else this fails with a permission error rather than silently doing nothing.
 */
export async function setFeatureFlag(key: FeatureFlagKey, enabled: boolean): Promise<void> {
  if (!(KNOWN_FLAGS as readonly string[]).includes(key)) throw new Error(`Unknown flag ${key}`);
  const { data, error } = await supabase
    .from("app_settings")
    .upsert({ key, value: enabled, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("key");
  if (error) throw new Error(error.message);
  // RLS can filter a write to zero rows without an error; treat that as failure.
  if (!data || data.length === 0) throw new Error("You don't have permission to change this setting.");
  resetFeatureFlagCache();
}
