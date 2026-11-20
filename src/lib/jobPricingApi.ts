import { supabase } from "@/integrations/supabase/client";
import { getOrgId } from "./orgHelper";
import { JOB_PRICING_FIELDS } from "./jobPricingFields";

/**
 * Job prices live in `public.job_pricing` (admin-only, see docs/security/job-pricing-split.md).
 * Everything that shows or totals a price reads it through here, so a driver (who gets no
 * `job_pricing` rows) never sees one.
 *
 * The price columns no longer exist on `jobs` (phase 4): writes go to `job_pricing` only, via
 * `saveJobPricing`, and `omitPricingFields` keeps them out of any `jobs` payload.
 */

const SELECT_COLUMNS = ["job_id", ...JOB_PRICING_FIELDS].join(", ");
// PostgREST puts `.in()` values in the URL, so keep each request well under the length limit.
export const PRICING_CHUNK_SIZE = 100;

export type PricingRow = { job_id: string } & Record<string, unknown>;

/** The pricing fields a job carries once merged (null when it has no pricing row, e.g. for a driver). */
export type PricingFields = {
  total_price: number | null;
  rate_per_mile: number | null;
  admin_rate: number | null;
  caz_ulez_cost: number | null;
  pricing_metadata: unknown;
  pricing_suggestion_used_at: string | null;
  pricing_suggestion_used_by: string | null;
};

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
    // Fail loudly: a price that silently reads as blank could be invoiced as nothing. A driver is
    // not an error case (RLS returns zero rows, not an error).
    if (error) throw error;
    for (const row of (data ?? []) as unknown as PricingRow[]) out.set(row.job_id, row);
  }
  return out;
}

/**
 * Put each job's pricing fields onto the job. Where there is no pricing row (a driver, or a job
 * never priced) every pricing field is null, so the job has the same shape for everyone.
 */
export function mergePricing<T extends { id: string }>(
  jobs: T[],
  pricing: Map<string, PricingRow>,
): Array<T & PricingFields> {
  return jobs.map((job) => {
    const row = pricing.get(job.id);
    const merged: Record<string, unknown> = { ...job };
    for (const f of JOB_PRICING_FIELDS) merged[f] = row?.[f] ?? null;
    return merged as T & PricingFields;
  });
}

export async function withPricing<T extends { id: string }>(jobs: T[]): Promise<Array<T & PricingFields>> {
  if (jobs.length === 0) return [];
  return mergePricing(jobs, await fetchPricingByJobId(jobs.map((j) => j.id)));
}

export async function withPricingOne<T extends { id: string }>(job: T): Promise<T & PricingFields> {
  return (await withPricing([job]))[0];
}

const PRICING_FIELD_SET: ReadonlySet<string> = new Set(JOB_PRICING_FIELDS);

/** The pricing keys in a jobs payload (empty when it holds none). */
export function pickPricingFields(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (PRICING_FIELD_SET.has(k) && v !== undefined) out[k] = v;
  return out;
}

/** A jobs payload without the pricing keys (the columns are gone from `jobs`). */
export function omitPricingFields<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) if (!PRICING_FIELD_SET.has(k)) out[k] = v;
  return out as Partial<T>;
}

/**
 * Write pricing fields to `job_pricing` explicitly. This is what makes clearing a price work once the
 * `jobs` columns are sealed (NULL over NULL is no change, so the trigger would never see it).
 * Only the fields given are written; others on an existing row are left alone.
 */
export async function saveJobPricing(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const fields = pickPricingFields(patch);
  if (Object.keys(fields).length === 0) return;
  const orgId = await getOrgId();
  const { error } = await supabase
    .from("job_pricing")
    .upsert({ job_id: jobId, org_id: orgId, ...fields } as never, { onConflict: "job_id" });
  if (error) throw error;
}
