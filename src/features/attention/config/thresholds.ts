/** Attention Center – Configurable thresholds (minutes / counts) */

export const ATTENTION_THRESHOLDS = {
  readyForPickupNoStartMinutes: 30,
  pickupInProgressMinutes: 90,
  deliveryInProgressMinutes: 120,
  podReadyDelayMinutes: 15,
  repeatedUploadFailuresCount: 3,
  /** How many days ahead of expiry to start warning. */
  documentExpiryWarnDays: 30,
} as const;
