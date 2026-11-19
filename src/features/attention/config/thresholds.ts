/** Attention Center – Configurable thresholds (minutes / counts) */

export const ATTENTION_THRESHOLDS = {
  pickupInProgressMinutes: 90,
  deliveryInProgressMinutes: 120,
  podReadyDelayMinutes: 15,
  repeatedUploadFailuresCount: 3,
  /** How many days ahead of expiry to start warning. */
  documentExpiryWarnDays: 30,
  /** Completed + priced + linked but not invoiced after this many days → medium. */
  unbilledWarnDays: 3,
  /** …and after this many days → high (cash is now genuinely late). */
  unbilledHighDays: 14,
  /**
   * Only completed jobs from this window raise billing exceptions. Older gaps
   * are an accounts clean-up task (Accounts / Link Jobs pages), not live
   * attention, and would otherwise flood the queue.
   */
  billingLookbackDays: 180,
} as const;
