import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { resolveBackTarget } from "@/lib/navigationUtils";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useExpenses, useExpenseTotals, useJobExpenses } from "@/hooks/useExpenses";
import { useJob } from "@/hooks/useJobs";
import { EXPENSE_CATEGORIES } from "@/lib/expenseApi";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { Plus, Receipt, Filter, ArrowLeft, ExternalLink, Paperclip } from "lucide-react";

const DATE_RANGES = [
  { label: "Today", value: "today" },
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "All", value: "all" },
] as const;

function getDateFrom(range: string): string | undefined {
  if (range === "all") return undefined;
  const d = new Date();
  if (range === "today") return d.toISOString().slice(0, 10);
  d.setDate(d.getDate() - Number(range));
  return d.toISOString().slice(0, 10);
}

export const Expenses = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const scopedJobId = searchParams.get("jobId") || "";
  const isScoped = Boolean(scopedJobId);

  const [dateRange, setDateRange] = useState("30");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const { data: scopedJob } = useJob(scopedJobId);
  const { data: scopedExpenses, isLoading: scopedLoading } = useJobExpenses(scopedJobId);

  const globalFilters = {
    dateFrom: getDateFrom(dateRange),
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  };
  const { data: globalExpenses, isLoading: globalLoading } = useExpenses(
    isScoped ? undefined : globalFilters
  );
  const { data: totals } = useExpenseTotals();

  const expenses = isScoped ? scopedExpenses : globalExpenses;
  const isLoading = isScoped ? scopedLoading : globalLoading;

  const fmt = (n: number) => `£${n.toFixed(2)}`;

  const jobRef = scopedJob?.external_job_number || scopedJobId.slice(0, 8);
  const pageTitle = isScoped ? `Expenses for Job ${jobRef}` : "Expenses";

  const handleBack = () => {
    if (isScoped) {
      navigate(`/jobs/${scopedJobId}`);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <AppHeader title={pageTitle} showBack onBack={handleBack} />

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Scoped mode banner */}
        {isScoped && scopedJob && (
          <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[13px] font-mono">{jobRef}</Badge>
                <span className="text-[13px] text-muted-foreground">{scopedJob.vehicle_reg}</span>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {scopedJob.pickup_city} → {scopedJob.delivery_city}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-[12px] h-7 px-2 text-muted-foreground"
                onClick={() => navigate("/expenses")}
              >
                <ExternalLink className="h-3 w-3 mr-1" /> View all expenses
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-[12px] h-7 px-2 text-muted-foreground"
                onClick={() => navigate(`/jobs/${scopedJobId}`)}
              >
                <ArrowLeft className="h-3 w-3 mr-1" /> Back to job
              </Button>
            </div>
          </div>
        )}

        {/* Totals — global mode only */}
        {!isScoped && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Today", value: totals?.today ?? 0 },
              { label: "This Week", value: totals?.thisWeek ?? 0 },
              { label: "This Month", value: totals?.thisMonth ?? 0 },
            ].map(t => (
              <div key={t.label} className="p-3 rounded-xl bg-card border border-border text-center">
                <p className="text-[13px] text-muted-foreground uppercase tracking-wide">{t.label}</p>
                <p className="text-[16px] font-semibold text-foreground">{fmt(t.value)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters — global mode only */}
        {!isScoped && (
          <>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)} className="min-h-[44px] rounded-lg">
                <Filter className="w-4 h-4 mr-1" /> Filters
              </Button>
              <div className="flex gap-2 flex-1 overflow-x-auto">
                {DATE_RANGES.map(r => (
                  <Button
                    key={r.value}
                    size="sm"
                    variant={dateRange === r.value ? "default" : "outline"}
                    onClick={() => setDateRange(r.value)}
                    className="text-[13px] min-h-[44px] rounded-lg"
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>

            {showFilters && (
              <div className="p-4 rounded-xl bg-card border border-border">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {EXPENSE_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </>
        )}

        {/* List */}
        {isLoading && <DashboardSkeleton />}

        {!isLoading && (!expenses || expenses.length === 0) && (
          <div className="text-center py-12">
            <Receipt className="w-12 h-12 mx-auto text-muted-foreground mb-3 stroke-[2]" />
            <p className="text-[14px] text-muted-foreground">
              {isScoped ? "No expenses logged for this job yet" : "No expenses found"}
            </p>
          </div>
        )}

        {/* Expense rows — ledger semantics: amount, receipt, category, date */}
        {expenses?.map(e => {
          const hasReceipts = e.receipts.length > 0;
          return (
            <div
              key={e.id}
              className="p-3 rounded-xl bg-card border border-border shadow-sm space-y-1.5 cursor-pointer active:bg-muted/50 transition-colors"
              onClick={() => navigate(`/expenses/${e.id}/edit${isScoped ? `?jobId=${scopedJobId}` : ""}`)}
            >
              {/* Row 1: Amount + receipt indicator */}
              <div className="flex items-center justify-between">
                <span className="text-[16px] font-semibold text-foreground tabular-nums">{fmt(Number(e.amount))}</span>
                <div className="flex items-center gap-1.5">
                  {hasReceipts ? (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Paperclip className="h-3 w-3" /> {e.receipts.length}
                    </span>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-warning border-warning/30 px-1.5 py-0">
                      No receipt
                    </Badge>
                  )}
                </div>
              </div>
              {/* Row 2: Category + date */}
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-[11px]">{e.category}</Badge>
                <span className="text-[12px] text-muted-foreground">{new Date(e.date).toLocaleDateString("en-GB")}</span>
              </div>
              {/* Row 3: Label if present (no internal IDs) */}
              {e.label && (
                <p className="text-[11px] text-muted-foreground truncate">{e.label}</p>
              )}
            </div>
          );
        })}

        {/* FAB */}
        <div className="fixed bottom-20 right-4 z-40">
          <Button
            size="lg"
            className="rounded-full shadow-lg h-14 w-14 p-0 min-h-[44px] min-w-[44px]"
            onClick={() => navigate(isScoped ? `/expenses/new?jobId=${scopedJobId}` : "/expenses/new")}
          >
            <Plus className="w-6 h-6 stroke-[2]" />
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};
