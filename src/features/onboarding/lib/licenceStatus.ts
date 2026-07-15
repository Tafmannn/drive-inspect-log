export type LicenceStatus = "valid" | "expiring" | "expired" | "unknown";

const EXPIRING_SOON_DAYS = 30;

/** Classifies a licence expiry date for the digital ID / compliance UI. */
export function licenceStatus(expiry: string | null | undefined, now: Date = new Date()): LicenceStatus {
  if (!expiry) return "unknown";
  const expiryDate = new Date(expiry + "T00:00:00");
  if (isNaN(expiryDate.getTime())) return "unknown";

  // Compare whole calendar days, not exact timestamps — otherwise a licence
  // expiring "today" reads as already expired the moment the clock passes
  // midnight, rather than staying valid for the rest of that day.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilExpiry = Math.round((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= EXPIRING_SOON_DAYS) return "expiring";
  return "valid";
}
