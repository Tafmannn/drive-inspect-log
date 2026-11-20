/**
 * Data hook for the Profitability Control Page.
 *
 * DATA SOURCES:
 *   - jobs table            → completed jobs: total_price, route_distance_miles, driver_id
 *   - expenses table        → summed per job_id (billable_on_pod or not, all logged cost)
 *   - invoice_expenses      → non-voided amount_charged per job_id: expenses
 *                             recharged to the client on an invoice. Counted as
 *                             revenue, because the cost side already includes
 *                             the underlying expense — omitting it understated
 *                             margin on every job with a recharged train fare etc.
 *   - driver_profiles table → pay_rate / pay_basis, joined via jobs.driver_id = driver_profiles.id
 *
 * MARGIN DERIVATION (deliberately conservative — never guesses):
 *   - cost  = sum(expenses for the job) + driverCost
 *   - driverCost is known only when pay_basis is 'per_job' (= pay_rate) or
 *     'per_mile' (= pay_rate * route_distance_miles); 'hourly' and an unset
 *     rate are surfaced as costIncomplete, never treated as zero cost.
 *   - revenue = total_price + recharged expenses; margin = revenue - cost,
 *     margin % = margin / revenue.
 *   A job with costIncomplete=true still shows its known partial cost, so
 *   the KPI totals stay honest about what's actually been logged rather
 *   than silently overstating margin.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, subMonths } from "date-fns";
import { withPricing } from "@/lib/jobPricingApi";

export type ProfitabilityPeriod = "30d" | "90d" | "12m" | "all";

export const PROFITABILITY_PERIODS: { value: ProfitabilityPeriod; label: string; short: string }[] = [
  { value: "30d", label: "Last 30 days", short: "30d" },
  { value: "90d", label: "Last 90 days", short: "90d" },
  { value: "12m", label: "Last 12 months", short: "12m" },
  { value: "all", label: "All time", short: "all time" },
];

export const DEFAULT_PROFITABILITY_PERIOD: ProfitabilityPeriod = "12m";

export function isProfitabilityPeriod(v: unknown): v is ProfitabilityPeriod {
  return v === "30d" || v === "90d" || v === "12m" || v === "all";
}

function periodSince(period: ProfitabilityPeriod, now: Date = new Date()): string | null {
  switch (period) {
    case "30d":
      return subDays(now, 30).toISOString();
    case "90d":
      return subDays(now, 90).toISOString();
    case "12m":
      return subMonths(now, 12).toISOString();
    case "all":
      return null;
  }
}

export interface ProfitabilityRow {
  /** Alias of jobId — CompactTable keys rows by `id`. */
  id: string;
  jobId: string;
  jobNumber: string | null;
  vehicleReg: string;
  clientName: string | null;
  driverName: string | null;
  completedAt: string;
  revenue: number;
  /** Of `revenue`, the part that is expenses recharged on an invoice. */
  rechargedRevenue: number;
  loggedExpenses: number;
  driverCost: number | null;
  cost: number;
  margin: number;
  marginPct: number | null;
  costIncomplete: boolean;
}

export interface ProfitabilityKpis {
  jobCount: number;
  totalRevenue: number;
  totalCost: number;
  netMargin: number;
  marginPct: number | null;
  jobsWithIncompleteCost: number;
}

/** Pure, testable: one job's revenue/cost/margin given its inputs. */
export function computeJobMargin(input: {
  totalPrice: number | null;
  routeDistanceMiles: number | null;
  loggedExpenses: number;
  /** Expenses recharged to the client on a non-voided invoice line. */
  rechargedRevenue?: number;
  driverPayRate: number | null;
  driverPayBasis: string | null;
}): {
  revenue: number;
  driverCost: number | null;
  cost: number;
  margin: number;
  marginPct: number | null;
  costIncomplete: boolean;
} {
  const revenue = (input.totalPrice ?? 0) + (input.rechargedRevenue ?? 0);
  let driverCost: number | null = null;
  let costIncomplete = false;

  if (input.driverPayBasis === "per_job" && input.driverPayRate != null) {
    driverCost = input.driverPayRate;
  } else if (
    input.driverPayBasis === "per_mile" &&
    input.driverPayRate != null &&
    input.routeDistanceMiles != null
  ) {
    driverCost = input.driverPayRate * input.routeDistanceMiles;
  } else {
    // No pay rate set, basis is 'hourly' (not yet computable per-job), or a
    // per_mile job with no recorded distance — cost is genuinely unknown,
    // not zero.
    costIncomplete = true;
  }

  const cost = input.loggedExpenses + (driverCost ?? 0);
  const margin = revenue - cost;
  const marginPct = revenue > 0 ? (margin / revenue) * 100 : null;

  return { revenue, driverCost, cost, margin, marginPct, costIncomplete };
}

export function useProfitabilityData(period: ProfitabilityPeriod) {
  return useQuery({
    queryKey: ["control-profitability", period],
    queryFn: async () => {
      const since = periodSince(period);

      let jobsQ = supabase
        .from("jobs")
        .select("id, external_job_number, vehicle_reg, client_name, client_company, driver_id, driver_name, route_distance_miles, completed_at")
        .eq("status", "completed")
        .eq("is_hidden", false)
        .not("completed_at", "is", null);
      if (since) jobsQ = jobsQ.gte("completed_at", since);
      const { data: jobsRaw, error: jobsErr } = await jobsQ;
      if (jobsErr) throw jobsErr;
      const jobs = await withPricing(jobsRaw ?? []);

      const jobIds = (jobs ?? []).map((j) => j.id);
      const driverIds = Array.from(new Set((jobs ?? []).map((j) => j.driver_id).filter((id): id is string => !!id)));

      const [expensesRes, driversRes, rechargesRes] = await Promise.all([
        jobIds.length > 0
          ? supabase.from("expenses").select("job_id, amount").eq("is_hidden", false).in("job_id", jobIds)
          : Promise.resolve({ data: [], error: null }),
        driverIds.length > 0
          ? (supabase.from("driver_profiles") as any).select("id, pay_rate, pay_basis").in("id", driverIds)
          : Promise.resolve({ data: [], error: null }),
        jobIds.length > 0
          ? supabase.from("invoice_expenses").select("job_id, amount_charged").eq("voided", false).in("job_id", jobIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (expensesRes.error) throw expensesRes.error;
      if (rechargesRes.error) throw rechargesRes.error;
      const rechargedByJob = new Map<string, number>();
      for (const r of (rechargesRes.data ?? []) as { job_id: string | null; amount_charged: number }[]) {
        if (!r.job_id) continue;
        rechargedByJob.set(r.job_id, (rechargedByJob.get(r.job_id) ?? 0) + (Number(r.amount_charged) || 0));
      }
      if (driversRes.error) throw driversRes.error;

      const expensesByJob = new Map<string, number>();
      for (const e of expensesRes.data ?? []) {
        expensesByJob.set(e.job_id, (expensesByJob.get(e.job_id) ?? 0) + (Number(e.amount) || 0));
      }
      const driverById = new Map<string, { pay_rate: number | null; pay_basis: string | null }>();
      for (const d of (driversRes.data ?? []) as { id: string; pay_rate: number | null; pay_basis: string | null }[]) {
        driverById.set(d.id, { pay_rate: d.pay_rate, pay_basis: d.pay_basis });
      }

      const rows: ProfitabilityRow[] = (jobs ?? []).map((j) => {
        const driver = j.driver_id ? driverById.get(j.driver_id) : undefined;
        const loggedExpenses = expensesByJob.get(j.id) ?? 0;
        const computed = computeJobMargin({
          totalPrice: j.total_price,
          routeDistanceMiles: j.route_distance_miles,
          loggedExpenses,
          rechargedRevenue: rechargedByJob.get(j.id) ?? 0,
          driverPayRate: driver?.pay_rate ?? null,
          driverPayBasis: driver?.pay_basis ?? null,
        });
        return {
          id: j.id,
          jobId: j.id,
          jobNumber: j.external_job_number,
          vehicleReg: j.vehicle_reg,
          clientName: j.client_company || j.client_name,
          driverName: j.driver_name,
          completedAt: j.completed_at as string,
          revenue: computed.revenue,
          rechargedRevenue: rechargedByJob.get(j.id) ?? 0,
          loggedExpenses,
          driverCost: computed.driverCost,
          cost: computed.cost,
          margin: computed.margin,
          marginPct: computed.marginPct,
          costIncomplete: computed.costIncomplete,
        };
      });

      rows.sort((a, b) => a.margin - b.margin);

      const kpis: ProfitabilityKpis = {
        jobCount: rows.length,
        totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
        totalCost: rows.reduce((s, r) => s + r.cost, 0),
        netMargin: rows.reduce((s, r) => s + r.margin, 0),
        marginPct: null,
        jobsWithIncompleteCost: rows.filter((r) => r.costIncomplete).length,
      };
      kpis.marginPct = kpis.totalRevenue > 0 ? (kpis.netMargin / kpis.totalRevenue) * 100 : null;

      return { rows, kpis };
    },
    staleTime: 30_000,
  });
}
