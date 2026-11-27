/**
 * "Ready to bill" — un-invoiced work grouped by client, so invoicing starts from the
 * work rather than from a client name. Tapping a client opens their jobs below.
 * A job filed under the wrong client shows up here under that client.
 */
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronRight, Link2 } from "lucide-react";
import { useClients } from "@/hooks/useClients";
import { cn } from "@/lib/utils";
import { useReadyToBill } from "../hooks/useReadyToBill";

function gbp(n: number): string {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  selectedClientId: string | null;
  onSelect: (clientId: string) => void;
}

export function ReadyToBillPanel({ selectedClientId, onSelect }: Props) {
  const { data, isLoading, error } = useReadyToBill();
  const { data: clients } = useClients();
  const nameOf = (id: string) => {
    const c = clients?.find((x) => x.id === id);
    return c ? (c.company || c.name).trim() : "Archived / unknown client";
  };

  if (isLoading) return <p className="text-xs text-muted-foreground">Checking what's ready to bill…</p>;
  if (error) {
    return (
      <p className="text-xs text-destructive" role="alert">
        Could not work out what's ready to bill: {(error as Error).message}
      </p>
    );
  }
  if (!data || (data.clients.length === 0 && data.unlinked === 0)) {
    return <p className="text-xs text-muted-foreground">Nothing waiting to be invoiced.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Ready to bill</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {data.clients.map((c) => (
          <li key={c.clientId}>
            <button
              type="button"
              onClick={() => onSelect(c.clientId)}
              aria-pressed={selectedClientId === c.clientId}
              className={cn(
                "w-full min-h-[56px] rounded-lg border px-3 py-2 text-left transition-colors",
                "flex items-center justify-between gap-3 hover:bg-muted/50 active:bg-muted",
                selectedClientId === c.clientId ? "border-primary bg-primary/5" : "border-border",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{nameOf(c.clientId)}</span>
                <span className="block text-xs text-muted-foreground">
                  {c.jobs} job{c.jobs === 1 ? "" : "s"} · {gbp(c.value)}
                  {c.unpriced > 0 && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-warning">
                      <AlertTriangle className="h-3 w-3" aria-hidden />
                      {c.unpriced} unpriced
                    </span>
                  )}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {data.unlinked > 0 && (
        <Link
          to="/control/clients/link-jobs"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-warning hover:underline"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          {data.unlinked} completed job{data.unlinked === 1 ? " has" : "s have"} no client linked — link {data.unlinked === 1 ? "it" : "them"} to bill
        </Link>
      )}
    </div>
  );
}
