/**
 * InvoiceList — every invoice and credit note, with its status and the
 * actions that status allows.
 */
import { useMemo, useState } from "react";
import { Download, Loader2, MoreHorizontal, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { InvoiceRecord } from "../hooks/useInvoices";
import type { InvoiceActionKind, InvoiceActions } from "../hooks/useInvoiceActions";
import { displayStatus, fmtDmy, type InvoiceDisplayStatus } from "../lib/invoiceMath";

const STATUS_STYLE: Record<InvoiceDisplayStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "text-muted-foreground border-muted-foreground/30 bg-muted/40" },
  sent: { label: "Sent", className: "text-primary border-primary/30 bg-primary/5" },
  overdue: { label: "Overdue", className: "text-destructive border-destructive/30 bg-destructive/5" },
  paid: { label: "Paid", className: "text-success border-success/30 bg-success/5" },
  cancelled: { label: "Cancelled", className: "text-muted-foreground border-muted-foreground/30 bg-muted/40 line-through" },
};

export function InvoiceStatusBadge({ invoice }: { invoice: InvoiceRecord }) {
  if (invoice.document_type === "credit_note") {
    return (
      <Badge variant="outline" className="text-[9px] text-warning border-warning/30 bg-warning/5">
        Credit note
      </Badge>
    );
  }
  const s = STATUS_STYLE[displayStatus(invoice)] ?? STATUS_STYLE.draft;
  return (
    <>
      <Badge variant="outline" className={cn("text-[9px]", s.className)}>
        {s.label}
      </Badge>
      {invoice.self_billed && (
        <Badge
          variant="outline"
          className="text-[9px] text-muted-foreground border-muted-foreground/30"
          title="The client's own invoice (self-billing), recorded as paid"
        >
          Self-billed
        </Badge>
      )}
    </>
  );
}

interface InvoiceListProps {
  invoices: InvoiceRecord[] | undefined;
  isLoading: boolean;
  actions: InvoiceActions;
  isBusy: (inv: InvoiceRecord, kind?: InvoiceActionKind) => boolean;
  /** Cancelled invoices: start a new invoice for the same client with the same jobs. */
  onReinvoice?: (inv: InvoiceRecord) => void;
}

function gbp(n: number): string {
  const abs = `£${Math.abs(n).toFixed(2)}`;
  return n < 0 ? `-${abs}` : abs;
}

export type InvoiceStatusFilter = "all" | "unpaid" | "draft" | "sent" | "overdue" | "paid" | "cancelled" | "credit";

const STATUS_FILTERS: { value: InvoiceStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "unpaid", label: "Unpaid (draft, sent, overdue)" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
  { value: "credit", label: "Credit notes" },
];

const clientLabel = (inv: InvoiceRecord) => (inv.client_company || inv.client_name || "").trim();

/** Pure: the invoices matching a search (number, client, PO), status and client. */
export function filterInvoices(
  invoices: InvoiceRecord[],
  f: { search?: string; status?: InvoiceStatusFilter; client?: string },
  today?: string,
): InvoiceRecord[] {
  const q = (f.search ?? "").trim().toLowerCase();
  const status = f.status ?? "all";
  const client = f.client ?? "all";
  return invoices.filter((inv) => {
    const isCredit = inv.document_type === "credit_note";
    const s = displayStatus(inv, today);
    if (status === "credit" && !isCredit) return false;
    if (status !== "all" && status !== "credit") {
      if (isCredit) return false;
      if (status === "unpaid" ? !(s === "draft" || s === "sent" || s === "overdue") : s !== status) return false;
    }
    if (client !== "all" && clientLabel(inv) !== client) return false;
    if (q) {
      const hay = [inv.invoice_number, inv.client_company, inv.client_name, inv.client_ref]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function RowActions({ inv, actions, isBusy, onReinvoice }: { inv: InvoiceRecord } & Pick<InvoiceListProps, "actions" | "isBusy" | "onReinvoice">) {
  const isCredit = inv.document_type === "credit_note";
  // A self-billed record is the client's own paid invoice: there is nothing to email,
  // pack, or take payment for — only their PDF to download, or the record to cancel.
  const selfBilled = !!inv.self_billed;
  const status = displayStatus(inv);
  const working = isBusy(inv);
  return (
    <div className="flex justify-end gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={() => actions.downloadPdf(inv)}
        disabled={working}
        className="h-8 gap-1.5 text-xs"
        aria-label={`Download ${inv.invoice_number}`}
      >
        {isBusy(inv, "pdf") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        PDF
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={working}
            aria-label={`More actions for ${inv.invoice_number}`}
          >
            {working && !isBusy(inv, "pdf") ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isCredit && !selfBilled && (
            <DropdownMenuItem onSelect={() => actions.downloadPack(inv)}>
              Download pack (PDF + receipt files)
            </DropdownMenuItem>
          )}
          {!isCredit && !selfBilled && status === "cancelled" && onReinvoice && (
            <DropdownMenuItem onSelect={() => onReinvoice(inv)}>Re-invoice these jobs</DropdownMenuItem>
          )}
          {status !== "cancelled" && !selfBilled && (
            <DropdownMenuItem onSelect={() => actions.email(inv)}>Email to client</DropdownMenuItem>
          )}
          {!isCredit && status === "draft" && (
            <DropdownMenuItem onSelect={() => actions.markSent(inv)}>Mark as sent</DropdownMenuItem>
          )}
          {!isCredit && (status === "sent" || status === "overdue") && (
            <DropdownMenuItem onSelect={() => actions.recordPayment(inv)}>Record payment</DropdownMenuItem>
          )}
          {!isCredit && !selfBilled && status === "paid" && (
            <DropdownMenuItem onSelect={() => actions.undoPayment(inv)}>Undo payment</DropdownMenuItem>
          )}
          {!isCredit && status !== "cancelled" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.cancel(inv)}>
                {selfBilled ? "Cancel this record…" : "Cancel invoice…"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function InvoiceDetailLines({ inv }: { inv: InvoiceRecord }) {
  const status = displayStatus(inv);
  return (
    <>
      {!!inv.client_ref && <p className="mt-0.5 text-[11px] text-muted-foreground">PO {inv.client_ref}</p>}
      {status === "paid" && !!inv.paid_at && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">Paid {fmtDmy(inv.paid_at)}</p>
      )}
      {status === "cancelled" && !!inv.cancel_reason && (
        <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground" title={inv.cancel_reason}>
          {inv.cancel_reason}
        </p>
      )}
    </>
  );
}

function issuedDue(inv: InvoiceRecord): string {
  const isCredit = inv.document_type === "credit_note";
  return `${fmtDmy(inv.issue_date || inv.created_at)}${inv.due_date && !isCredit ? ` / ${fmtDmy(inv.due_date)}` : ""}`;
}

export function InvoiceList({ invoices, isLoading, actions, isBusy, onReinvoice }: InvoiceListProps) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InvoiceStatusFilter>("all");
  const [client, setClient] = useState("all");

  const clientOptions = useMemo(
    () => [...new Set((invoices ?? []).map(clientLabel).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [invoices],
  );
  const shown = useMemo(
    () => filterInvoices(invoices ?? [], { search, status, client }),
    [invoices, search, status, client],
  );

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading invoices…</div>;
  }
  if (!invoices || invoices.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">No invoices created yet.</div>;
  }

  const filtering = !!search.trim() || status !== "all" || client !== "all";
  const head = "text-[11px] font-medium uppercase tracking-wider";
  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search number, client or PO"
            aria-label="Search invoices"
            className="h-10 pl-8 text-base sm:h-9 sm:text-sm"
          />
        </div>
        <div className="flex gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatusFilter)}>
            <SelectTrigger className="h-10 flex-1 text-sm sm:h-9 sm:w-[190px] sm:flex-none" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {clientOptions.length > 1 && (
            <Select value={client} onValueChange={setClient}>
              <SelectTrigger className="h-10 flex-1 text-sm sm:h-9 sm:w-[180px] sm:flex-none" aria-label="Filter by client">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clients</SelectItem>
                {clientOptions.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {filtering && (
          <span className="text-xs text-muted-foreground sm:ml-auto">
            {shown.length} of {invoices.length}
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No invoices match these filters.</div>
      ) : isMobile ? (
        <ul className="divide-y divide-border">
          {shown.map((inv) => (
            <li key={inv.id} className={cn("px-4 py-3", displayStatus(inv) === "cancelled" && "opacity-70")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{inv.invoice_number}</span>
                    <InvoiceStatusBadge invoice={inv} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-foreground">{clientLabel(inv)}</p>
                  <p className="text-[11px] text-muted-foreground">{issuedDue(inv)}</p>
                  <InvoiceDetailLines inv={inv} />
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                  {inv.total != null ? gbp(Number(inv.total)) : "—"}
                </span>
              </div>
              <div className="mt-2">
                <RowActions inv={inv} actions={actions} isBusy={isBusy} onReinvoice={onReinvoice} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={head}>Invoice</TableHead>
                <TableHead className={head}>Client</TableHead>
                <TableHead className={head}>Issued / Due</TableHead>
                <TableHead className={cn(head, "text-right")}>Total</TableHead>
                <TableHead className={cn(head, "text-right")}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((inv) => (
                <TableRow key={inv.id} className={displayStatus(inv) === "cancelled" ? "opacity-70" : undefined}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium text-foreground">{inv.invoice_number}</span>
                      <InvoiceStatusBadge invoice={inv} />
                    </div>
                    <InvoiceDetailLines inv={inv} />
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-foreground">{inv.client_company || inv.client_name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{issuedDue(inv)}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {inv.total != null ? gbp(Number(inv.total)) : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions inv={inv} actions={actions} isBusy={isBusy} onReinvoice={onReinvoice} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
