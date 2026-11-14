/**
 * InvoiceList — every invoice and credit note, with its status and the
 * actions that status allows.
 */
import { Download, Loader2, MoreHorizontal } from "lucide-react";
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
    <Badge variant="outline" className={cn("text-[9px]", s.className)}>
      {s.label}
    </Badge>
  );
}

interface InvoiceListProps {
  invoices: InvoiceRecord[] | undefined;
  isLoading: boolean;
  actions: InvoiceActions;
  isBusy: (inv: InvoiceRecord, kind?: InvoiceActionKind) => boolean;
}

function gbp(n: number): string {
  const abs = `£${Math.abs(n).toFixed(2)}`;
  return n < 0 ? `-${abs}` : abs;
}

export function InvoiceList({ invoices, isLoading, actions, isBusy }: InvoiceListProps) {
  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading invoices…</div>;
  }
  if (!invoices || invoices.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">No invoices created yet.</div>;
  }

  const head = "text-[11px] font-medium uppercase tracking-wider";
  return (
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
          {invoices.map((inv) => {
            const isCredit = inv.document_type === "credit_note";
            const status = displayStatus(inv);
            const working = isBusy(inv);
            return (
              <TableRow key={inv.id} className={status === "cancelled" ? "opacity-70" : undefined}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{inv.invoice_number}</span>
                    <InvoiceStatusBadge invoice={inv} />
                  </div>
                  {inv.client_ref && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">PO {inv.client_ref}</p>
                  )}
                  {status === "paid" && inv.paid_at && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Paid {fmtDmy(inv.paid_at)}</p>
                  )}
                  {status === "cancelled" && inv.cancel_reason && (
                    <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground" title={inv.cancel_reason}>
                      {inv.cancel_reason}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-foreground">{inv.client_company || inv.client_name}</span>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {fmtDmy(inv.issue_date || inv.created_at)}
                    {inv.due_date && !isCredit ? ` / ${fmtDmy(inv.due_date)}` : ""}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    {inv.total != null ? gbp(Number(inv.total)) : "—"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => actions.downloadPdf(inv)}
                      disabled={working}
                      className="h-7 gap-1.5 text-xs"
                      aria-label={`Download ${inv.invoice_number}`}
                    >
                      {isBusy(inv, "pdf") ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      PDF
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-7 p-0"
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
                        {!isCredit && (
                          <DropdownMenuItem onSelect={() => actions.downloadPack(inv)}>
                            Download pack (PDF + receipt files)
                          </DropdownMenuItem>
                        )}
                        {status !== "cancelled" && (
                          <DropdownMenuItem onSelect={() => actions.email(inv)}>
                            Email to client
                          </DropdownMenuItem>
                        )}
                        {!isCredit && status === "draft" && (
                          <DropdownMenuItem onSelect={() => actions.markSent(inv)}>
                            Mark as sent
                          </DropdownMenuItem>
                        )}
                        {!isCredit && (status === "sent" || status === "overdue") && (
                          <DropdownMenuItem onSelect={() => actions.recordPayment(inv)}>
                            Record payment
                          </DropdownMenuItem>
                        )}
                        {!isCredit && status === "paid" && (
                          <DropdownMenuItem onSelect={() => actions.undoPayment(inv)}>
                            Undo payment
                          </DropdownMenuItem>
                        )}
                        {!isCredit && status !== "cancelled" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={() => actions.cancel(inv)}
                            >
                              Cancel invoice…
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
