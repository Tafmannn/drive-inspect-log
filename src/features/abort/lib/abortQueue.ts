/** Groups the Aborts view: requests, fees to review, ready to invoice, settled. Pure. */
import type { AbortQueueRow } from "../api/abortApi";
import { abortQueueStage } from "./abortRules";

export function groupAbortQueue(rows: AbortQueueRow[]) {
  const requests: AbortQueueRow[] = [];
  const review: AbortQueueRow[] = [];
  const ready: AbortQueueRow[] = [];
  const settled: AbortQueueRow[] = [];
  for (const r of rows) {
    if (r.kind === "request") { requests.push(r); continue; }
    const stage = abortQueueStage(r.abort!, { invoiced: r.invoiced, paid: r.paid });
    if (stage === "awaiting_review") review.push(r);
    else if (stage === "ready_to_invoice") ready.push(r);
    else settled.push(r);
  }
  return { requests, review, ready, settled };
}
