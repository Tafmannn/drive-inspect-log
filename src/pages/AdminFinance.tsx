/**
 * Phase 9 — Admin Finance Overview (/admin/finance)
 * Mobile-first expense dashboard with KPIs, grouped expense list, and CSV export.
 *
 * KPI Band: Today Spend, Week Spend, Receipt Compliance, Pending (no receipt)
 * Grouped List: Expenses with receipt status badges, category, amount
 * Actions: CSV Export, Add Expense, filter by receipt status
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useControlFinanceData,
  useFinanceKpis,
  type FinanceRow,
  type FinanceFilter,
} from "@/features/control/hooks/useControlFinanceData";
import { exportExpensesCsv } from "@/lib/expenseApi";
import { toast } from "@/hooks/use-toast";
import {
  Search, Receipt, FileDown, Plus, DollarSign,
  CalendarDays, ShieldCheck, AlertTriangle, ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ReceiptFilter = "all" | "with" | "without";

const RECEIPT_FILTERS: { value: ReceiptFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "without", label: "No Receipt" },
  { value: "with", label: "Has Receipt" },
];

/* ─── KPI Pill ─────────────────────────────────────────────────── */

function KpiPill({
  label, value, icon: Icon, variant = "default", loading,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: "default" | "info" | "warning" | "destructive" | "success";
  loading?: boolean;
}) {
  const colors = {
    default: "bg-card border-border text-foreground",
    info: "bg-primary/5 border-primary/30 text-primary",
    warning: "bg-warning/5 border-warning/30 text-warning",
    destructive: "bg-destructive/5 border-destructive/30 text-destructive",
    success: "bg-primary/5 border-primary/30 text-primary",
  };

  return (
    <div className={cn("flex flex-col items-center gap-0.5 rounded-xl border p-2.5", colors[variant])}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {loading ? (
        <Skeleton className="h-5 w-10" />
      ) : (
        <span className="text-base font-semibold tabular-nums leading-tight">{value}</span>
      )}
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground truncate w-full text-center">
        {label}
      </span>
    </div>
  );
}

/* ─── Expense Card ─────────────────────────────────────────────── */

function ExpenseCard({ row, navigate }: { row: FinanceRow; navigate: (p: string) => void }) {
  const fmt = (n: number) => `£${n.toFixed(2)}`;

  return (
    <Card
      className="p-0 border border-border overflow-hidden cursor-pointer active:bg-muted/50 transition-colors"
      onClick={() => navigate(`/expenses/${row.id}/edit`)}
    >
      <div className="px-3 pt-3 pb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant="outline" className="text-[11px] font-mono shrink-0">
            {row.job_number || row.job_id.slice(0, 6)}
          </Badge>
          {row.job_reg && (
            <span className="text-[11px] text-muted-foreground">{row.job_reg}</span>
          )}
        </div>
        <span className="text-sm font-semibold text-foreground tabular-nums">{fmt(Number(row.amount))}</span>
      </div>

      <div className="px-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">{row.category}</Badge>
          {row.label && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{row.label}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {row.hasReceipt ? (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-primary">
              <Receipt className="h-2.5 w-2.5" /> Receipt
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-warning">
              <ImageOff className="h-2.5 w-2.5" /> No receipt
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {new Date(row.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </span>
        </div>
      </div>
    </Card>
  );
}

/* ─── Main Page ────────────────────────────────────────────────── */

export function AdminFinance() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>("all");
  const [exporting, setExporting] = useState(false);

  const filter: FinanceFilter = { search, receipt: receiptFilter };
  const { data: rows, isLoading } = useControlFinanceData(filter);
  const { data: kpis, isLoading: kpisLoading } = useFinanceKpis();

  const fmt = (n: number) => `£${n.toFixed(2)}`;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportExpensesCsv();
      toast({ title: "Expenses exported as CSV" });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const compliancePct = kpis
    ? kpis.totalExpenses > 0
      ? Math.round((kpis.withReceipt / kpis.totalExpenses) * 100)
      : 100
    : 0;

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title="Finance" showBack onBack={() => navigate("/admin")} />

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* ── KPI STRIP ── */}
        <div className="grid grid-cols-4 gap-2">
          <KpiPill
            label="Today"
            value={fmt(kpis?.spendToday ?? 0)}
            icon={DollarSign}
            loading={kpisLoading}
          />
          <KpiPill
            label="This Week"
            value={fmt(kpis?.spendThisWeek ?? 0)}
            icon={CalendarDays}
            variant="info"
            loading={kpisLoading}
          />
          <KpiPill
            label="Compliance"
            value={`${compliancePct}%`}
            icon={ShieldCheck}
            variant={compliancePct < 80 ? "warning" : "success"}
            loading={kpisLoading}
          />
          <KpiPill
            label="No Receipt"
            value={kpis?.withoutReceipt ?? 0}
            icon={AlertTriangle}
            variant={(kpis?.withoutReceipt ?? 0) > 0 ? "destructive" : "default"}
            loading={kpisLoading}
          />
        </div>

        {/* ── SEARCH + FILTERS + ACTIONS ── */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search job, reg, category…"
                className="pl-9 min-h-[44px] rounded-lg"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="min-h-[44px] rounded-lg"
              onClick={handleExport}
              disabled={exporting}
            >
              <FileDown className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {RECEIPT_FILTERS.map((f) => (
              <Button
                key={f.value}
                variant={receiptFilter === f.value ? "default" : "outline"}
                size="sm"
                className="min-h-[36px] text-xs shrink-0 rounded-lg"
                onClick={() => setReceiptFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* ── LOADING ── */}
        {isLoading && <DashboardSkeleton />}

        {/* ── EMPTY ── */}
        {!isLoading && rows?.length === 0 && (
          <div className="text-center py-12">
            <Receipt className="w-12 h-12 mx-auto text-muted-foreground mb-3 stroke-[2]" />
            <p className="text-sm text-muted-foreground">No expenses found</p>
          </div>
        )}

        {/* ── EXPENSE LIST ── */}
        {rows && !isLoading && (
          <div className="space-y-2">
            {rows.map((row) => (
              <ExpenseCard key={row.id} row={row} navigate={navigate} />
            ))}
          </div>
        )}

        {/* FAB — Add Expense */}
        <div className="fixed bottom-20 right-4 z-40">
          <Button
            size="lg"
            className="rounded-full shadow-lg h-14 w-14 p-0 min-h-[44px] min-w-[44px]"
            onClick={() => navigate("/expenses/new")}
          >
            <Plus className="w-6 h-6 stroke-[2]" />
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
