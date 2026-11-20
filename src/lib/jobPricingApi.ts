import { supabase } from "@/integrations/supabase/client";
import { JOB_PRICING_FIELDS } from "./jobPricingFields";

/**
 * Job prices live in `public.job_pricing` (admin-only, see docs/security/job-pricing-split.md).
 * Everything that shows or totals a price reads it through here, so a driver (who gets no
 * `job_pricing` rows) never sees one.
 *
 * Writes still go to `jobs`; a database trigger copies them into `job_pricing` (phase 1) and,
 * after the seal (phase 3), forwards them there and blanks the `jobs` columns.
 */

const SELECT_COLUMNS = ["job_id", ...JOB_PRICING_FIELDS].join(", ");
// PostgREST puts `.in()` values in the URL, so keep each request well under the length limit.
export const PRICING_CHUNK_SIZE = 100;

export type PricingRow = { job_id: string } & Record<string, unknown>;

/** Fetch the pricing rows for these jobs, keyed by job id. A non-admin gets an empty map. */
export async function fetchPricingByJobId(jobIds: string[]): Promise<Map<string, PricingRow>> {
  const unique = Array.from(new Set(jobIds.filter(Boolean)));
  const out = new Map<string, PricingRow>();
  for (let i = 0; i < unique.length; i += PRICING_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + PRICING_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("job_pricing")
      .select(SELECT_COLUMNS)
      .in("job_id", chunk);
    if (error) {
      // Soft-fail: the job's own columns still hold the values until the seal, so a missing
      // table (deployed before the migration) or a network blip must not break the whole screen.
      console.warn("[jobPricing] could not load pricing", error.message);
      return out;
    }
    for (const row of (data ?? []) as unknown as PricingRow[]) out.set(row.job_id, row);
  }
  return out;
}

/**
 * Put each job's pricing fields onto the job. Where there is no pricing row (a driver, or a job
 * never priced) the job's own values are left as they are, which after the seal means null.
 */
export function mergePricing<T extends { id: string }>(
  jobs: T[],
  pricing: Map<string, PricingRow>,
): T[] {
  return jobs.map((job) => {
    const row = pricing.get(job.id);
    if (!row) return job;
    const merged: Record<string, unknown> = { ...job };
    for (const f of JOB_PRICING_FIELDS) merged[f] = row[f] ?? null;
    return merged as T;
  });
}

export async function withPricing<T extends { id: string }>(jobs: T[]): Promise<T[]> {
  if (jobs.length === 0) return jobs;
  return mergePricing(jobs, await fetchPricingByJobId(jobs.map((j) => j.id)));
}

export async function withPricingOne<T extends { id: string }>(job: T): Promise<T> {
  return (await withPricing([job]))[0];
}
