import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronRight, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePortalContext, usePortalInvoices } from "../api";
import { PortalInvoiceBadge } from "../components/PortalInvoiceBadge";
import { fmtDate, fmtGbp } from "../lib/format";
import { invoiceBalance, invoicePaymentLabel, invoicePaymentState, isUnpaid } from "../lib/invoiceStatus";
import { downloadCsv, toCsv } from "../lib/csv";
import { usePortalTitle } from "../lib/usePortalTitle";

type Filter = "all" | "unpaid" | "paid";

export default function PortalInvoices() {
  const { data: invoices, isLoading, error } = usePortalInvoices();
  const { data: ctx } = usePortalContext();
  const [params, setParams] = useSearchParams();
  const f = params.get("show");
  const filter: Filter = f === "unpaid" || f === "paid" ? f : "all";
  usePortalTitle("Invoices", ctx?.operator.name);

  const balance = useMemo(() => invoiceBalance(invoices ?? []), [invoices]);
  const paidTotal = useMemo(
    () => (invoices ?? []).filter((i) => invoicePaymentState(i) === "paid").reduce((s, i) => s + (i.total ?? 0), 0),
    [invoices],
  );
  const list = useMemo(() => {
    const all = invoices ?? [];
    if (filter === "unpaid") return all.filter((i) => isUnpaid(invoicePaymentState(i)));
    if (filter === "paid") return all.filter((i) => invoicePaymentState(i) === "paid");
    return all;
  }, [invoices, filter]);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return <p className="text-sm text-destructive py-8 text-center">Couldn't load your invoices. Please refresh to try again.</p>;
  }

  if (!invoices || invoices.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">No invoices yet.</p>
          <p className="text-xs text-muted-foreground">Invoices appear here once they've been sent to you.</p>
        </CardContent>
      </Card>
    );
  }

  const exportCsv = () => {
    const rows = list.map((i) => [
      i.invoice_number,
      i.document_type === "credit_note" ? "Credit note" : "Invoice",
      i.issue_date ?? "",
      i.due_date ?? "",
      i.subtotal ?? "",
      i.vat_amount ?? "",
      i.total ?? "",
      invoicePaymentLabel(i),
      i.paid_at ? i.paid_at.slice(0, 10) : "",
    ]);
    downloadCsv(
      `invoices-${filter}-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(["Number", "Type", "Issued", "Due", "Net", "VAT", "Total", "Status", "Paid on"], rows),
    );
  };

  const setFilter = (v: Filter) => {
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("show");
    else next.set("show", v);
    setParams(next, { replace: true });
  };
  const chip = (v: Filter, label: string) => (
    <button
      role="tab"
      aria-selected={filter === v}
      onClick={() => setFilter(v)}
      className={cn(
        "px-3 py-1.5 text-sm rounded-md font-medium",
        filter === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Invoices</h1>
        <p className="text-sm text-muted-foreground">Everything we've invoiced you, what's paid and what's still due.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-semibold tabular-nums">{fmtGbp(balance.outstanding)}</p>
            <p className="text-xs text-muted-foreground">
              {balance.outstandingCount
                ? `${balance.outstandingCount} invoice${balance.outstandingCount === 1 ? "" : "s"}${balance.nextDue ? ` · next due ${fmtDate(balance.nextDue)}` : ""}`
                : "Nothing to pay"}
            </p>
          </CardContent>
        </Card>
        <Card className={cn(balance.overdueCount > 0 && "border-destructive/40")}>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {balance.overdueCount > 0 && <AlertTriangle className="w-3.5 h-3.5 text-destructive" />} Overdue
            </p>
            <p className={cn("text-lg font-semibold tabular-nums", balance.overdueCount > 0 && "text-destructive")}>{fmtGbp(balance.overdue)}</p>
            <p className="text-xs text-muted-foreground">
              {balance.overdueCount ? `${balance.overdueCount} invoice${balance.overdueCount === 1 ? "" : "s"} past due` : "Nothing overdue"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">Paid</p>
            <p className="text-lg font-semibold tabular-nums">{fmtGbp(paidTotal)}</p>
            <p className="text-xs text-muted-foreground">Across all invoices shown here</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Filter invoices">
          {chip("all", `All (${invoices.length})`)}
          {chip("unpaid", `Unpaid (${balance.outstandingCount})`)}
          {chip("paid", "Paid")}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={list.length === 0}>
          <Download className="w-4 h-4 mr-1.5" /> Download CSV
        </Button>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm font-medium">{filter === "unpaid" ? "Nothing to pay. You're all up to date." : "No paid invoices yet."}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {list.map((inv) => (
              <li key={inv.id}>
                <Link
                  to={`/portal/invoices/${inv.id}`}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="font-medium font-mono flex flex-wrap items-center gap-2">
                      {inv.invoice_number}
                      <PortalInvoiceBadge invoice={inv} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Issued {fmtDate(inv.issue_date)}
                      {inv.paid_at ? ` · Paid ${fmtDate(inv.paid_at)}` : inv.due_date ? ` · Due ${fmtDate(inv.due_date)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        (inv.status === "cancelled" || inv.document_type === "credit_note") && "text-muted-foreground line-through decoration-1",
                      )}
                    >
                      {fmtGbp(inv.total)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
