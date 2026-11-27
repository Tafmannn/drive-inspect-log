/**
 * Ready to bill — pure summary of un-invoiced work per client, for the panel at the
 * top of Invoice Prep. Same billable base as Invoice Prep itself:
 *   - completed / closed live jobs not on a live invoice (priced or not — an unpriced
 *     job is counted and flagged, never valued at zero);
 *   - aborted jobs whose current Abort fee is approved above zero, valued at that fee.
 * Jobs with no client link are counted separately so they can be linked.
 */
export interface BillableJobRow {
  id: string;
  client_id: string | null;
  status: string;
}

export interface AbortFeeInfo {
  finance_status: string;
  approved_amount: number | null;
  reopened_at?: string | null;
}

export interface ClientBillSummary {
  clientId: string;
  /** Un-invoiced jobs (completed + approved Aborts). */
  jobs: number;
  /** Sum of the known amounts. Jobs without a price are excluded and counted in `unpriced`. */
  value: number;
  unpriced: number;
}

export interface ReadyToBillSummary {
  clients: ClientBillSummary[];
  /** Completed, un-invoiced jobs with no client profile linked. */
  unlinked: number;
}

export function summariseReadyToBill(
  rows: BillableJobRow[],
  priceByJob: ReadonlyMap<string, number | null>,
  aborts: ReadonlyMap<string, AbortFeeInfo>,
  invoiced: ReadonlySet<string>,
): ReadyToBillSummary {
  const byClient = new Map<string, ClientBillSummary>();
  let unlinked = 0;
  for (const r of rows) {
    if (invoiced.has(r.id)) continue;
    let amount: number | null;
    if (r.status === "aborted") {
      const a = aborts.get(r.id);
      if (!a || a.reopened_at || a.finance_status !== "approved" || !(Number(a.approved_amount) > 0)) continue;
      amount = Number(a.approved_amount);
    } else if (r.status === "completed" || r.status === "closed") {
      const p = priceByJob.get(r.id);
      amount = p != null && Number(p) > 0 ? Number(p) : null;
    } else {
      continue;
    }
    if (!r.client_id) {
      unlinked++;
      continue;
    }
    const s = byClient.get(r.client_id) ?? { clientId: r.client_id, jobs: 0, value: 0, unpriced: 0 };
    s.jobs++;
    if (amount == null) s.unpriced++;
    else s.value = Math.round((s.value + amount) * 100) / 100;
    byClient.set(r.client_id, s);
  }
  const clients = [...byClient.values()].sort((a, b) => b.value - a.value || b.jobs - a.jobs);
  return { clients, unlinked };
}
