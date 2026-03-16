/**
 * Finance Control Page — /control/finance
 * Operational expense surface tied to real job workflows.
 *
 * ACTION MAPPINGS:
 *   - "View Expense"  → /expenses/:id/edit  (existing edit route doubles as view)
 *   - "Add Expense"   → /expenses/new
 *   - "Open Job"      → /jobs/:jobId        (linked job detail)
 *   - "Export CSV"     → triggers CSV download via expenseApi
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ControlShell, ControlHeader, ControlSection } from "../components/shared/ControlShell";
import { KpiStrip } from "../components/shared/KpiStrip";
import { CompactTable, type CompactColumn } from "../components/shared/CompactTable";
import { StatusChip } from "../components/shared/StatusChip";
import { FilterBar } from "../components/shared/FilterBar";
import {
  useControlFinanceData,
  useFinanceKpis,
  type FinanceRow,
  type FinanceFilter,
} from "../hooks/useControlFinanceData";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import {
  Search, Plus, PoundSterling, Calendar, CalendarDays,
  ImageIcon, ImageOff, Eye, ExternalLink, Download,
} from "lucide-react";

type ReceiptFilter = FinanceFilter["receipt"];

const RECEIPT_OPTIONS: { label: string; value: ReceiptFilter }[] = [
  { label: "All", value: "all" },
  { label: "With Receipt", value: "with" },
  { label: "No Receipt", value: "without" },
];

function formatGbp(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function ControlFinance() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>("all");
  const [exporting, setExporting] = useState(false);

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

  const kpiItems = [
    { label: "Total Expenses", value: kpis?.totalExpenses, icon: PoundSterling, variant: "default" as const, loading: kpisLoading },
    { label: "Spend Today", value: kpis ? formatGbp(kpis.spendToday) : undefined, icon: Calendar, variant: "info" as const, loading: kpisLoading },
    { label: "Spend This Week", value: kpis ? formatGbp(kpis.spendThisWeek) : undefined, icon: CalendarDays, variant: "info" as const, loading: kpisLoading },
    { label: "With Receipt", value: kpis?.withReceipt, icon: ImageIcon, variant: "success" as const, loading: kpisLoading },
    {
      label: "No Receipt",
      value: kpis?.withoutReceipt,
      icon: ImageOff,
      variant: kpis?.withoutReceipt ? "warning" as const : "default" as const,
      loading: kpisLoading,
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
            onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${r.job_id}`); }}
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
            onClick={(e) => { e.stopPropagation(); navigate(`/expenses/${r.id}/edit?from=control-finance`); }}
          >
            <Eye className="h-3 w-3 mr-0.5" /> View
          </Button>
          {(r.job_number || r.job_reg) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${r.job_id}?from=control-finance`); }}
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
              className="gap-1.5"
              onClick={handleExport}
              disabled={exporting}
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => navigate("/expenses/new?from=control-finance")}>
              <Plus className="h-3.5 w-3.5" /> New Expense
            </Button>
          </div>
        }
      />

      <KpiStrip items={kpiItems} className="grid-cols-2 lg:grid-cols-5" />

      <FilterBar>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search job, category, label…"
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {RECEIPT_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={receiptFilter === opt.value ? "default" : "outline"}
            size="sm"
            className="text-xs h-8"
            onClick={() => setReceiptFilter(opt.value)}
          >
            {opt.label}
          </Button>
        ))}
      </FilterBar>

      <ControlSection
        title="Expenses"
        description={`${rows?.length ?? 0} expenses matching current filters`}
        flush
      >
        <CompactTable
          columns={columns}
          data={rows ?? []}
          loading={isLoading}
          emptyMessage="No expenses found."
          onRowClick={(row) => navigate(`/expenses/${row.id}/edit`)}
        />
      </ControlSection>
    </ControlShell>
  );
}
