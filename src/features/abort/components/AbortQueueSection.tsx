/**
 * Admin Aborts view on the Jobs screen (/control/jobs?view=aborts).
 *
 * Four groups, in the order they need attention:
 *   1. Driver requests waiting for a decision (the job is still active);
 *   2. Aborts whose fee is waiting for review;
 *   3. Approved fees ready to invoice;
 *   4. Settled: rejected, nil, invoiced and paid.
 * Rows open the job, where the Abort panel does the work.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAbortQueue } from "../hooks/useAbort";
import type { AbortQueueRow } from "../api/abortApi";
import { groupAbortQueue } from "../lib/abortQueue";
import {
  ABORT_STAGE_LABEL, abortErrorMessage, abortQueueStage, formatAbortConfirmedAt, type AbortQueueStage,
} from "../lib/abortRules";

const money = (n: number | null | undefined) => (n == null ? "—" : `£${Number(n).toFixed(2)}`);

function matches(r: AbortQueueRow, term: string) {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return [r.jobRef, r.vehicleReg, r.client].some((v) => !!v && v.toLowerCase().includes(t));
}

export function AbortQueueSection({ search }: { search: string }) {
  const q = useAbortQueue();
  const navigate = useNavigate();
  const groups = useMemo(() => groupAbortQueue((q.data ?? []).filter((r) => matches(r, search))), [q.data, search]);

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading Aborts…
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="rounded-lg border bg-card p-4 text-center">
        <p className="mb-2 text-sm text-destructive">{abortErrorMessage(q.error)}</p>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}>Retry</Button>
      </div>
    );
  }

  const open = (r: AbortQueueRow) => navigate(`/jobs/${r.jobId}?from=${encodeURIComponent("/control/jobs?view=aborts")}`);
  const total = groups.requests.length + groups.review.length + groups.ready.length + groups.settled.length;
  if (total === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        No Abort requests or Aborts{search.trim() ? " match your search" : ""}.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Group title="Driver requests" hint="Still active until you confirm or dismiss" rows={groups.requests} onOpen={open} />
      <Group title="Fee to review" hint="Aborted — approve or reject the fee" rows={groups.review} onOpen={open} />
      <Group title="Ready to invoice" hint="Approved Abort fees, not yet invoiced" rows={groups.ready} onOpen={open} />
      <Group title="Settled" hint="Rejected, nil, invoiced or paid" rows={groups.settled} onOpen={open} />
    </div>
  );
}

function Group({ title, hint, rows, onOpen }: {
  title: string; hint: string; rows: AbortQueueRow[]; onOpen: (r: AbortQueueRow) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="rounded-lg border bg-card" aria-label={title}>
      <header className="flex items-baseline justify-between gap-2 border-b px-3 py-2.5">
        <h3 className="text-sm font-semibold text-foreground">{title} <span className="text-muted-foreground">({rows.length})</span></h3>
        <p className="hidden text-xs text-muted-foreground sm:block">{hint}</p>
      </header>
      <ul className="divide-y">
        {rows.map((r) => <QueueRow key={`${r.kind}-${r.request?.id ?? r.abort?.id}`} row={r} onOpen={onOpen} />)}
      </ul>
    </section>
  );
}

function QueueRow({ row, onOpen }: { row: AbortQueueRow; onOpen: (r: AbortQueueRow) => void }) {
  const stage: AbortQueueStage | null = row.abort ? abortQueueStage(row.abort, { invoiced: row.invoiced, paid: row.paid }) : null;
  const fee = row.abort
    ? row.abort.finance_status === "approved" ? money(row.abort.approved_amount) : money(row.abort.proposed_amount)
    : null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="flex w-full min-h-[56px] items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none [touch-action:manipulation]"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm">
            <span className="font-mono font-semibold tracking-wide text-foreground">{row.vehicleReg || "—"}</span>
            <span className="truncate text-muted-foreground">{row.jobRef}{row.client ? ` · ${row.client}` : ""}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {row.kind === "request"
              ? `Requested ${formatAbortConfirmedAt(row.at)}`
              : `Abort confirmed at ${formatAbortConfirmedAt(row.at)}${row.abort?.no_name_exception ? " · no-name exception" : ""}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {fee && <p className="text-sm font-semibold tabular-nums text-foreground">{fee}</p>}
          <p className="text-[11px] text-muted-foreground">{stage ? ABORT_STAGE_LABEL[stage] : "Awaiting decision"}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    </li>
  );
}
