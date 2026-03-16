/**
 * Data hook for the Finance Control Page.
 * Uses existing expenseApi queries and Supabase counts.
 *
 * DATA SOURCES:
 *   - expenses table       → all expense rows (amount, category, date, job_id)
 *   - expense_receipts     → joined via listExpenses to determine receipt presence
 *   - jobs table           → joined via listExpenses for job_reg / job_number
 *
 * KPI DERIVATION:
 *   - totalExpenses        → count of expense rows (is_hidden = false implied by default query)
 *   - totalSpend           → sum of all amounts
 *   - spendToday           → sum where date >= today
 *   - spendThisWeek        → sum where date >= 7 days ago
 *   - withReceipt          → count where receipts.length > 0
 *   - withoutReceipt       → count where receipts.length === 0
 */
import { useQuery } from "@tanstack/react-query";
import { listExpenses, type ExpenseWithJob } from "@/lib/expenseApi";

export type FinanceRow = ExpenseWithJob & {
  hasReceipt: boolean;
};

export interface FinanceFilter {
  search: string;
  receipt: "all" | "with" | "without";
}

export interface FinanceKpis {
  totalExpenses: number;
  totalSpend: number;
  spendToday: number;
  spendThisWeek: number;
  withReceipt: number;
  withoutReceipt: number;
}

export function useControlFinanceData(filter: FinanceFilter) {
  return useQuery({
    queryKey: ["control-finance", filter],
    queryFn: async () => {
      const expenses = await listExpenses();
      let rows: FinanceRow[] = expenses.map((e) => ({
        ...e,
        hasReceipt: e.receipts.length > 0,
      }));

      // Receipt filter
      if (filter.receipt === "with") rows = rows.filter((r) => r.hasReceipt);
      if (filter.receipt === "without") rows = rows.filter((r) => !r.hasReceipt);

      // Search
      if (filter.search.trim()) {
        const s = filter.search.toLowerCase();
        rows = rows.filter(
          (r) =>
            r.job_number?.toLowerCase().includes(s) ||
            r.job_reg?.toLowerCase().includes(s) ||
            r.category?.toLowerCase().includes(s) ||
            r.label?.toLowerCase().includes(s) ||
            r.notes?.toLowerCase().includes(s)
        );
      }

      return rows;
    },
    staleTime: 20_000,
  });
}

export function useFinanceKpis() {
  return useQuery({
    queryKey: ["control-finance-kpis"],
    queryFn: async () => {
      const expenses = await listExpenses();

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekStr = weekAgo.toISOString().slice(0, 10);

      let totalSpend = 0;
      let spendToday = 0;
      let spendThisWeek = 0;
      let withReceipt = 0;
      let withoutReceipt = 0;

      for (const e of expenses) {
        const amt = Number(e.amount) || 0;
        totalSpend += amt;
        if (e.date >= todayStr) spendToday += amt;
        if (e.date >= weekStr) spendThisWeek += amt;
        if (e.receipts.length > 0) withReceipt++;
        else withoutReceipt++;
      }

      return {
        totalExpenses: expenses.length,
        totalSpend,
        spendToday,
        spendThisWeek,
        withReceipt,
        withoutReceipt,
      } satisfies FinanceKpis;
    },
    staleTime: 30_000,
  });
}
