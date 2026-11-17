/**
 * Finance — /control/finance
 * The one expense screen for admins and the owner, on every screen size.
 * Merges the old mobile page (/admin/finance: expense cards, receipt
 * compliance %) with the desktop table (breakdown charts, job links, labels).
 * Cards below 1024px, a table above; the receipt filter and search live in
 * the URL.
 *
 * ACTION MAPPINGS:
 *   - "View Expense"  → /expenses/:id/edit  (existing edit route doubles as view)
 *   - "Add Expense"   → /expenses/new
 *   - "Open Job"      → /jobs/:jobId        (linked job detail)
 *   - "Export CSV"     → triggers CSV download via expenseApi
 */
import { useState, useMemo, useCallback, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { ViewChips } from "../components/shared/ViewChips";
import type { CompactColumn } from "../components/shared/CompactTable";
import { ResponsiveList } from "../components/shared/ResponsiveList";
import { StatusChip } from "../components/shared/StatusChip";

// recharts (~100KB gzip) is only needed once a KPI card is actually
// clicked — lazy-loaded so every driver on the mobile app isn't paying for
// an admin-only chart library in the shared bundle.
const ExpenseBreakdownDialog = lazy(() =>
  import("../components/ExpenseBreakdownDialog").then((m) => ({ default: m.ExpenseBreakdownDialog })),
);
import {
  useControlFinanceData,
  useFinanceKpis,
  type FinanceRow,
  type FinanceFilter,
} from "../hooks/useControlFinanceData";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { formatGbp, receiptCompliancePct } from "../lib/financeBreakdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Search, Plus, PoundSterling, Calendar, CalendarDays,
  ImageIcon, ImageOff, Eye, ExternalLink, Download, ShieldCheck, Receipt,
} from "lucide-react";

type ReceiptFilter = FinanceFilter["receipt"];

const RECEIPT_OPTIONS: { label: string; value: ReceiptFilter }[] = [
  { label: "All", value: "all" },
  { label: "No receipt", value: "without" },
  { label: "With receipt", value: "with" },
];

const FROM = encodeURIComponent("/control/finance");

function receiptParam(v: string | null): ReceiptFilter {
  return v === "with" || v === "without" ? v : "all";
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function ControlFinance() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const receiptFilter = receiptParam(searchParams.get("receipt"));
  const writeParams = useCallback(
    (receipt: ReceiptFilter, term: string, replace = false) => {
      const p = new URLSearchParams();
      if (receipt !== "all") p.set("receipt", receipt);
      if (term.trim()) p.set("search", term);
      setSearchParams(p, { replace });
    },
    [setSearchParams],
  );
  const setSearch = (term: string) => writeParams(receiptFilter, term, true);
  const setReceiptFilter = (r: ReceiptFilter) => writeParams(r, search);
  const [exporting, setExporting] = useState(false);
  const [breakdown, setBreakdown] = useState<{
    title: string;
    measure: "amount" | "count";
    rows: { category: string; amount: number }[];
  } | null>(null);
  // Stays true after the first open so the dialog (and its lazy-loaded
  // recharts chunk) doesn't unmount mid-close-animation on later closes.
  const [breakdownEverOpened, setBreakdownEverOpened] = useState(false);

  const openBreakdown = (payload: typeof breakdown) => {
    setBreakdownEverOpened(true);
    setBreakdown(payload);
  };

  const filter: FinanceFilter = useMemo(() => ({ search, receipt: receiptFilter }), [search, receiptFilter]);
  const { data: rows, isLoading } = useControlFinanceData(filter);
  const { data: kpis, isLoading: kpisLoading } = useFinanceKpis();

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportExpensesCsv();
      toast({ title: "Exported", description: "Expenses CSV downloaded." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const compliance = kpis ? receiptCompliancePct(kpis.withReceipt, kpis.totalExpenses) : undefined;

  const kpiItems = [
    {
      label: "Total Expenses", value: kpis?.totalExpenses, icon: PoundSterling, variant: "default" as const, loading: kpisLoading,
      onClick: kpis ? () => openBreakdown({ title: "Total Expenses", measure: "count", rows: kpis.breakdownRows.totalExpenses }) : undefined,
    },
    {
      label: "Spend Today", value: kpis ? formatGbp(kpis.spendToday) : undefined, icon: Calendar, variant: "info" as const, loading: kpisLoading,
      onClick: kpis ? () => openBreakdown({ title: "Spend Today", measure: "amount", rows: kpis.breakdownRows.spendToday }) : undefined,
    },
    {
      label: "Spend This Week", value: kpis ? formatGbp(kpis.spendThisWeek) : undefined, icon: CalendarDays, variant: "info" as const, loading: kpisLoading,
      onClick: kpis ? () => openBreakdown({ title: "Spend This Week", measure: "amount", rows: kpis.breakdownRows.spendThisWeek }) : undefined,
    },
    {
      label: "Receipt compliance",
      value: compliance === undefined ? undefined : `${compliance}%`,
      icon: ShieldCheck,
      variant: compliance !== undefined && compliance < 80 ? ("warning" as const) : ("success" as const),
      loading: kpisLoading,
      onClick: () => setReceiptFilter("without"),
      ariaLabel: compliance === undefined ? undefined : `Receipt compliance ${compliance}%. Show expenses without a receipt`,
    },
    {
      label: "With Receipt", value: kpis?.withReceipt, icon: ImageIcon, variant: "success" as const, loading: kpisLoading,
      onClick: kpis ? () => openBreakdown({ title: "With Receipt", measure: "count", rows: kpis.breakdownRows.withReceipt }) : undefined,
    },
    {
      label: "No Receipt",
      value: kpis?.withoutReceipt,
      icon: ImageOff,
      variant: kpis?.withoutReceipt ? "warning" as const : "default" as const,
      loading: kpisLoading,
      onClick: kpis ? () => openBreakdown({ title: "No Receipt", measure: "count", rows: kpis.breakdownRows.withoutReceipt }) : undefined,
    },
  ];

  const columns: CompactColumn<FinanceRow>[] = [
    {
      key: "date",
      header: "Date",
      className: "w-[75px]",
      render: (r) => <span className="text-xs text-foreground">{shortDate(r.date)}</span>,
    },
    {
      key: "category",
      header: "Category",
      className: "w-[120px]",
      render: (r) => <span className="text-xs text-foreground truncate block max-w-[120px]">{r.category}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      className: "w-[85px] text-right",
      render: (r) => (
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {formatGbp(Number(r.amount))}
        </span>
      ),
    },
    {
      key: "job",
      header: "Job",
      className: "w-[110px]",
      render: (r) =>
        r.job_number || r.job_reg ? (
          <button
            className="text-xs text-primary hover:underline truncate block max-w-[110px]"
            onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${r.job_id}?from=${FROM}`); }}
          >
            {r.job_number || r.job_reg}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "label",
      header: "Label",
      render: (r) => (
        <span className="text-xs text-muted-foreground truncate block max-w-[140px]">
          {r.label || r.notes?.slice(0, 40) || "—"}
        </span>
      ),
    },
    {
      key: "receipt",
      header: "Receipt",
      className: "w-[80px]",
      render: (r) =>
        r.hasReceipt ? (
          <StatusChip label="Attached" variant="success" className="text-[9px]" />
        ) : (
          <StatusChip label="None" variant="muted" className="text-[9px]" />
        ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[130px] text-right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={(e) => { e.stopPropagation(); navigate(`/expenses/${r.id}/edit?from=${FROM}`); }}
          >
            <Eye className="h-3 w-3 mr-0.5" /> View
          </Button>
          {(r.job_number || r.job_reg) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${r.job_id}?from=${FROM}`); }}
            >
              <ExternalLink className="h-3 w-3 mr-0.5" /> Job
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <ControlShell>
      <ControlHeader
        title="Finance"
        subtitle="Expense tracking and receipt oversight linked to job workflows"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 min-h-[40px] lg:min-h-0"
              onClick={handleExport}
              disabled={exporting}
              aria-label="Export CSV"
            >
              <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Export CSV</span>
            </Button>
            <Button size="sm" className="gap-1.5 min-h-[40px] lg:min-h-0" onClick={() => navigate(`/expenses/new?from=${FROM}`)}>
              <Plus className="h-3.5 w-3.5" /> New Expense
            </Button>
          </div>
        }
      />

      <KpiStrip items={kpiItems} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" />

      <div className="rounded-lg border bg-card px-3 py-2.5 space-y-2 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-2">
        <div className="relative lg:flex-1 lg:min-w-[200px] lg:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 lg:h-3.5 lg:w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search job, reg, category, label…"
            className="pl-9 lg:pl-8 h-11 lg:h-8 text-sm lg:text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search expenses"
          />
        </div>
        <ViewChips options={RECEIPT_OPTIONS} value={receiptFilter} onChange={setReceiptFilter} ariaLabel="Receipt filter" />
      </div>

      <ControlSection
        title="Expenses"
        description={`${rows?.length ?? 0} expenses matching current filters`}
        flush
      >
        <ResponsiveList<FinanceRow>
          rows={rows ?? []}
          columns={columns}
          loading={isLoading}
          emptyMessage="No expenses found."
          onRowClick={(row) => navigate(`/expenses/${row.id}/edit?from=${FROM}`)}
          renderCard={(row) => (
            <ExpenseCard
              row={row}
              onOpen={() => navigate(`/expenses/${row.id}/edit?from=${FROM}`)}
              onJob={row.job_number || row.job_reg ? () => navigate(`/jobs/${row.job_id}?from=${FROM}`) : undefined}
            />
          )}
        />
      </ControlSection>

      {breakdownEverOpened && (
        <Suspense fallback={null}>
          <ExpenseBreakdownDialog
            open={!!breakdown}
            onOpenChange={(open) => !open && setBreakdown(null)}
            title={breakdown?.title ?? ""}
            measure={breakdown?.measure ?? "amount"}
            rows={breakdown?.rows ?? []}
          />
        </Suspense>
      )}
    </ControlShell>
  );
}

/* ─── Expense card (phones and tablets) ─────────────────────────── */

function ExpenseCard({ row, onOpen, onJob }: { row: FinanceRow; onOpen: () => void; onJob?: () => void }) {
  return (
    <Card
      className="p-0 border border-border overflow-hidden cursor-pointer active:bg-muted/50 transition-colors"
      onClick={onOpen}
    >
      <div className="px-3 pt-3 pb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onJob ? (
            <button
              type="button"
              className="min-h-[32px] inline-flex items-center"
              onClick={(e) => { e.stopPropagation(); onJob(); }}
              aria-label={`Open job ${row.job_number || row.job_reg}`}
            >
              <Badge variant="outline" className="text-[11px] font-mono text-primary">
                {row.job_number || row.job_reg}
              </Badge>
            </button>
          ) : (
            <Badge variant="outline" className="text-[11px] font-mono">—</Badge>
          )}
          {row.job_number && row.job_reg && <span className="text-[11px] text-muted-foreground">{row.job_reg}</span>}
        </div>
        <span className="text-sm font-semibold text-foreground tabular-nums">{formatGbp(Number(row.amount))}</span>
      </div>
      <div className="px-3 pb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge variant="secondary" className="text-[10px] shrink-0">{row.category}</Badge>
          {(row.label || row.notes) && (
            <span className="text-[11px] text-muted-foreground truncate">{row.label || row.notes?.slice(0, 40)}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {row.hasReceipt ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-success">
              <Receipt className="h-3 w-3" /> Receipt
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-warning">
              <ImageOff className="h-3 w-3" /> No receipt
            </span>
          )}
          <span className="text-[11px] text-muted-foreground">{shortDate(row.date)}</span>
        </div>
      </div>
    </Card>
  );
}
