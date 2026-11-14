/**
 * Expenses that can be recharged on an invoice for a set of jobs: visible,
 * and not already on another (non-cancelled) invoice. Each carries its
 * receipt file URLs so the picker can flag an expense with no receipt.
 */
import { supabase } from "@/integrations/supabase/client";
import type { BillableExpense, ReceiptRef } from "../lib/invoiceMath";
import { findAlreadyInvoicedExpenses } from "./createInvoice";

export async function fetchBillableExpenses(jobIds: string[]): Promise<BillableExpense[]> {
  if (jobIds.length === 0) return [];

  const { data: expenses, error } = await supabase
    .from("expenses")
    .select("id, job_id, date, category, label, amount, supplier, vat_amount")
    .in("job_id", jobIds)
    .eq("is_hidden", false)
    .order("date", { ascending: true });
  if (error) throw new Error(`Could not load expenses: ${error.message}`);
  if (!expenses?.length) return [];

  const ids = expenses.map((e) => e.id);
  const [receiptsResult, invoiced] = await Promise.all([
    supabase.from("expense_receipts").select("expense_id, url, backend, backend_ref, created_at").in("expense_id", ids).order("created_at", { ascending: true }),
    findAlreadyInvoicedExpenses(ids),
  ]);
  if (receiptsResult.error) {
    throw new Error(`Could not load receipts: ${receiptsResult.error.message}`);
  }

  const urls = new Map<string, ReceiptRef[]>();
  for (const r of receiptsResult.data ?? []) {
    if (!r.url) continue;
    const list = urls.get(r.expense_id) ?? [];
    list.push({ url: r.url, backend: r.backend, backend_ref: r.backend_ref });
    urls.set(r.expense_id, list);
  }

  return expenses
    .filter((e) => !invoiced.has(e.id))
    .map((e) => ({
      id: e.id,
      job_id: e.job_id,
      date: e.date,
      category: e.category,
      supplier: e.supplier,
      label: e.label,
      amount: Number(e.amount),
      vat_amount: e.vat_amount == null ? null : Number(e.vat_amount),
      receipts: urls.get(e.id) ?? [],
    }));
}

/** Categories ticked by default in the picker. */
export const DEFAULT_RECHARGE_CATEGORIES = ["Fuel"];
