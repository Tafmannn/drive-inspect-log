/**
 * pricingDefaults — load pricing defaults from `app_settings.pricing_defaults`,
 * with safe fallback to the hardcoded constants in pricingBrain.
 *
 * Pure read; never writes. Returns the same shape as PRICING_DEFAULTS so it
 * is a drop-in replacement at call sites that previously imported the
 * constant directly.
 */
import { supabase } from "@/integrations/supabase/client";
import { PRICING_DEFAULTS } from "@/lib/pricingBrain";

export type PricingDefaults = typeof PRICING_DEFAULTS;

let cached: { value: PricingDefaults; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

function coerceNumber(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function mergeDefaults(raw: unknown): PricingDefaults {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const um = (r.URGENCY_MULTIPLIERS && typeof r.URGENCY_MULTIPLIERS === "object"
    ? r.URGENCY_MULTIPLIERS
    : {}) as Record<string, unknown>;
  return {
    MIN_CHARGE: coerceNumber(r.MIN_CHARGE, PRICING_DEFAULTS.MIN_CHARGE),
    MIN_RATE_PER_MILE: coerceNumber(r.MIN_RATE_PER_MILE, PRICING_DEFAULTS.MIN_RATE_PER_MILE),
    WAITING_RATE_PER_HOUR: coerceNumber(r.WAITING_RATE_PER_HOUR, PRICING_DEFAULTS.WAITING_RATE_PER_HOUR),
    WAITING_FREE_MINUTES: coerceNumber(r.WAITING_FREE_MINUTES, PRICING_DEFAULTS.WAITING_FREE_MINUTES),
    URGENCY_MULTIPLIERS: {
      standard: coerceNumber(um.standard, PRICING_DEFAULTS.URGENCY_MULTIPLIERS.standard),
      same_day: coerceNumber(um.same_day, PRICING_DEFAULTS.URGENCY_MULTIPLIERS.same_day),
      urgent: coerceNumber(um.urgent, PRICING_DEFAULTS.URGENCY_MULTIPLIERS.urgent),
    },
    SHORT_BAND_MAX: coerceNumber(r.SHORT_BAND_MAX, PRICING_DEFAULTS.SHORT_BAND_MAX),
    LONG_BAND_MIN: coerceNumber(r.LONG_BAND_MIN, PRICING_DEFAULTS.LONG_BAND_MIN),
    MIN_MARGIN_FRACTION: coerceNumber(r.MIN_MARGIN_FRACTION, PRICING_DEFAULTS.MIN_MARGIN_FRACTION),
  } as PricingDefaults;
}

export async function loadPricingDefaults(force = false): Promise<PricingDefaults> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "pricing_defaults")
      .maybeSingle();
    if (error) throw error;
    const merged = mergeDefaults(data?.value ?? null);
    cached = { value: merged, at: Date.now() };
    return merged;
  } catch {
    cached = { value: PRICING_DEFAULTS, at: Date.now() };
    return PRICING_DEFAULTS;
  }
}

export function _resetPricingDefaultsCache() {
  cached = null;
}
