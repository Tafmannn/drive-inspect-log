import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useExpenses, useExpenseTotals } from "@/hooks/useExpenses";
import { EXPENSE_CATEGORIES } from "@/lib/expenseApi";
import { Loader2, Plus, Receipt, Filter } from "lucide-react";

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
  const [dateRange, setDateRange] = useState("30");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  const filters = {
    dateFrom: getDateFrom(dateRange),
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  };

  const { data: expenses, isLoading } = useExpenses(filters);
  const { data: totals } = useExpenseTotals();

  const fmt = (n: number) => `£${n.toFixed(2)}`;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Expenses" showBack onBack={() => navigate("/")} />

      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Totals */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Today", value: totals?.today ?? 0 },
            { label: "This Week", value: totals?.thisWeek ?? 0 },
            { label: "This Month", value: totals?.thisMonth ?? 0 },
          ].map(t => (
            <Card key={t.label} className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t.label}</p>
              <p className="text-lg font-bold text-foreground">{fmt(t.value)}</p>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)}>
            <Filter className="h-4 w-4 mr-1" /> Filters
          </Button>
          <div className="flex gap-1 flex-1 overflow-x-auto">
            {DATE_RANGES.map(r => (
              <Button
                key={r.value}
                size="sm"
                variant={dateRange === r.value ? "default" : "outline"}
                onClick={() => setDateRange(r.value)}
                className="text-xs"
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {showFilters && (
          <Card className="p-3">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {EXPENSE_CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Card>
        )}

        {/* List */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {!isLoading && expenses?.length === 0 && (
          <div className="text-center py-12">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No expenses found</p>
          </div>
        )}

        {expenses?.map(e => (
          <Card key={e.id} className="p-4 space-y-1 cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/expenses/${e.id}`)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-mono">
                  {e.job_number || e.job_id.slice(0, 6)}
                </Badge>
                <span className="text-xs text-muted-foreground">{e.job_reg}</span>
              </div>
              <span className="font-bold text-foreground">{fmt(Number(e.amount))}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{e.category}</Badge>
                {e.label && <span className="text-xs text-muted-foreground truncate max-w-[140px]">{e.label}</span>}
              </div>
              <span className="text-xs text-muted-foreground">{new Date(e.date).toLocaleDateString("en-GB")}</span>
            </div>
            {e.receipts.length > 0 && (
              <p className="text-[10px] text-muted-foreground">{e.receipts.length} receipt{e.receipts.length !== 1 ? "s" : ""}</p>
            )}
          </Card>
        ))}

        {/* FAB */}
        <div className="fixed bottom-6 right-6">
          <Button size="lg" className="rounded-full shadow-lg h-14 w-14 p-0" onClick={() => navigate("/expenses/new")}>
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
};
