import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronRight, Download, FileText, ReceiptPoundSterling } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalContext, usePortalInvoices } from "../api";
import { PortalInvoiceBadge } from "../components/PortalInvoiceBadge";
import { fmtDate, fmtGbp } from "../lib/format";
import { invoiceBalance, invoicePaymentLabel, invoicePaymentState, isUnpaid } from "../lib/invoiceStatus";
import { downloadCsv, toCsv } from "../lib/csv";
import { usePortalTitle } from "../lib/usePortalTitle";
import { CardListSkeleton, EmptyState, ErrorState, MetricCard, PortalHero, SegmentedTabs, portalCard } from "../components/PortalUi";

type Filter = "all" | "unpaid" | "paid";

export default function PortalInvoices() {
  const { data: invoices, isLoading, error, refetch } = usePortalInvoices();
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

  const state = isLoading ? "loading" : error ? "error" : "ready";
  const overdue = balance.overdueCount > 0;
  const count = (n: number) => `${n} invoice${n === 1 ? "" : "s"}`;
  let outstandingHint = "Nothing to pay";
  if (balance.outstandingCount)
    outstandingHint = `${count(balance.outstandingCount)}${balance.nextDue ? ` · next due ${fmtDate(balance.nextDue)}` : ""}`;

  let content: React.ReactNode;
  if (isLoading) content = <CardListSkeleton label="Loading your invoices" />;
  else if (error) content = <ErrorState message="We couldn't load your invoices." onRetry={() => void refetch()} />;
  else if (!invoices || invoices.length === 0)
    content = (
      <EmptyState
        art={
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
            <FileText className="h-6 w-6" aria-hidden />
          </span>
        }
        title="No invoices yet"
        body="Invoices appear here once they've been sent to you."
      />
    );
  else if (list.length === 0)
    content = (
      <EmptyState
        title={filter === "unpaid" ? "Nothing to pay. You're all up to date." : "No paid invoices yet."}
        art={filter === "unpaid" ? <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden /> : undefined}
      />
    );
  else
    content = (
      <div className={cn(portalCard, "overflow-hidden")}>
        <div
          aria-hidden
          className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_7.5rem_1rem] gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500 md:grid dark:border-border dark:bg-muted/40"
        >
          <span>Invoice</span>
          <span>Issued</span>
          <span>Due / paid</span>
          <span>Status</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-border">
          {list.map((inv) => {
            const struck = inv.status === "cancelled" || inv.document_type === "credit_note";
            return (
              <li key={inv.id}>
                <Link
                  to={`/portal/invoices/${inv.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3.5 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:bg-slate-50 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_7.5rem_1rem] md:gap-4 md:px-5 dark:hover:bg-muted/40"
                >
                  <p className="min-w-0 truncate font-mono text-[15px] font-semibold text-slate-900 dark:text-foreground">
                    {inv.invoice_number}
                  </p>
                  <span
                    className={cn(
                      "row-span-2 self-center text-right text-[15px] font-semibold tabular-nums text-slate-900 md:order-5 md:row-span-1 dark:text-foreground",
                      struck && "text-slate-400 line-through decoration-1 dark:text-muted-foreground",
                    )}
                  >
                    {fmtGbp(inv.total)}
                  </span>
                  <p className="text-[13px] text-slate-500 md:contents dark:text-muted-foreground">
                    <span className="md:order-2 md:self-center">
                      <span className="md:hidden">Issued </span>
                      {fmtDate(inv.issue_date)}
                    </span>
                    <span className="md:order-3 md:self-center">
                      <span className="md:hidden">{inv.paid_at || inv.due_date ? " · " : ""}</span>
                      {inv.paid_at ? `Paid ${fmtDate(inv.paid_at)}` : inv.due_date ? (
                        <>
                          <span className="md:hidden">Due </span>
                          {fmtDate(inv.due_date)}
                        </>
                      ) : (
                        <span className="hidden md:inline">—</span>
                      )}
                    </span>
                  </p>
                  <div className="col-span-2 md:order-4 md:col-span-1">
                    <PortalInvoiceBadge invoice={inv} />
                  </div>
                  <ChevronRight className="hidden h-4 w-4 text-slate-400 md:order-6 md:block" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );

  const hasInvoices = !isLoading && !error && (invoices?.length ?? 0) > 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PortalHero
        eyebrow={ctx?.client.name}
        title="Invoices"
        subtitle="Everything we've invoiced you, what's paid and what's still due."
      />

      <section aria-label="Invoice summary" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard
          className="col-span-2 lg:col-span-1"
          icon={ReceiptPoundSterling}
          tone="violet"
          label="Outstanding"
          value={fmtGbp(balance.outstanding)}
          state={state}
          hint={outstandingHint}
        />
        <MetricCard
          icon={AlertTriangle}
          tone={overdue ? "red" : "blue"}
          label="Overdue"
          value={fmtGbp(balance.overdue)}
          state={state}
          hint={overdue ? `${count(balance.overdueCount)} past due` : "Nothing overdue"}
        />
        <MetricCard icon={CheckCircle2} tone="green" label="Paid" value={fmtGbp(paidTotal)} state={state} hint="Across all invoices here" />
      </section>

      {hasInvoices && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SegmentedTabs
            label="Filter invoices"
            value={filter}
            onChange={setFilter}
            className="w-full sm:w-auto"
            options={[
              { value: "all", label: "All", count: invoices!.length },
              { value: "unpaid", label: "Unpaid", count: balance.outstandingCount },
              { value: "paid", label: "Paid" },
            ]}
          />
          <button
            type="button"
            onClick={exportCsv}
            disabled={list.length === 0}
            className="ml-auto inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-[#1E4FA8] hover:bg-blue-50 disabled:pointer-events-none disabled:opacity-40 dark:text-primary dark:hover:bg-primary/10"
          >
            <Download className="h-4 w-4" aria-hidden /> Download CSV
          </button>
        </div>
      )}

      {content}
    </div>
  );
}
