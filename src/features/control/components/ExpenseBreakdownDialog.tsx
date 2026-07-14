import { Cell, Pie, PieChart } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { buildCategorySlices, capSlices, formatGbp } from "../lib/financeBreakdown";

interface ExpenseBreakdownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  measure: "amount" | "count";
  rows: { category: string; amount: number }[];
}

export function ExpenseBreakdownDialog({
  open,
  onOpenChange,
  title,
  measure,
  rows,
}: ExpenseBreakdownDialogProps) {
  const slices = capSlices(buildCategorySlices(rows));
  const total = slices.reduce((sum, s) => sum + (measure === "amount" ? s.amount : s.count), 0);

  const formatValue = (v: number) => (measure === "amount" ? formatGbp(v) : v.toLocaleString());

  const chartConfig: ChartConfig = Object.fromEntries(
    slices.map((s) => [s.category, { label: s.category, color: s.color }]),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            Breakdown by category
          </DialogDescription>
        </DialogHeader>

        {slices.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            No expenses in this period.
          </p>
        ) : (
          <>
            <div className="relative mx-auto w-full max-w-[220px]">
              <ChartContainer config={chartConfig} className="aspect-square mx-auto max-h-[220px]">
                <PieChart>
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const slice = payload[0].payload as (typeof slices)[number];
                      const value = measure === "amount" ? slice.amount : slice.count;
                      return (
                        <div className="grid gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                              style={{ backgroundColor: slice.color }}
                            />
                            <span className="text-muted-foreground">{slice.category}</span>
                          </div>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {formatValue(value)}
                          </span>
                        </div>
                      );
                    }}
                  />
                  <Pie
                    data={slices}
                    dataKey={measure}
                    nameKey="category"
                    innerRadius="60%"
                    outerRadius="100%"
                    strokeWidth={2}
                    stroke="hsl(var(--card))"
                  >
                    {slices.map((s) => (
                      <Cell key={s.category} fill={s.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-lg font-semibold tabular-nums text-foreground">
                  {formatValue(total)}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {measure === "amount" ? "total" : "expenses"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 pt-1">
              {slices.map((s) => {
                const value = measure === "amount" ? s.amount : s.count;
                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                return (
                  <div key={s.category} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="flex-1 truncate text-foreground">{s.category}</span>
                    <span className="text-muted-foreground tabular-nums w-9 text-right">{pct}%</span>
                    <span className="font-semibold tabular-nums text-foreground w-16 text-right">
                      {formatValue(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
