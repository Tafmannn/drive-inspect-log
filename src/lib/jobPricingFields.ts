/**
 * The seven price-related fields that live in `public.job_pricing` (admin-only), not on `jobs`.
 * A driver can read their own jobs but gets no `job_pricing` rows, so none of these reach a driver.
 * See docs/security/job-pricing-split.md. Keep in sync with the migration
 * (src/test/job-pricing-table.test.ts checks this).
 */
export const JOB_PRICING_FIELDS = [
  "total_price",
  "rate_per_mile",
  "admin_rate",
  "caz_ulez_cost",
  "pricing_metadata",
  "pricing_suggestion_used_at",
  "pricing_suggestion_used_by",
] as const;

export type JobPricingField = (typeof JOB_PRICING_FIELDS)[number];
