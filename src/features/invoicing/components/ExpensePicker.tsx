/**
 * ExpensePicker — choose which of the selected jobs' expenses to recharge on
 * the invoice. Grouped by job; a chip per category ticks or clears that whole
 * category. An expense with no receipt on file is flagged, because the
 * client is being asked to pay for something there is no proof of.
 */
import { useMemo } from "react";
import { AlertTriangle, Paperclip } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { chargeForExpense, fmtDmy, jobRef, type BillableExpense, type InvoiceJob } from "../lib/invoiceMath";

interface ExpensePickerProps {
  jobs: InvoiceJob[];
  expenses: BillableExpense[];
  selectedIds: Set<string>;
  vatRegistered: boolean;
  isLoading?: boolean;
  onToggle: (expenseId: string, selected: boolean) => void;
  onSetMany: (expenseIds: string[], selected: boolean) => void;
}

function gbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

export function ExpensePicker({
  jobs,
  expenses,
  selectedIds,
  vatRegistered,
  isLoading,
  onToggle,
  onSetMany,
}: ExpensePickerProps) {
  const categories = useMemo(() => {
    const map = new Map<string, BillableExpense[]>();
    for (const e of expenses) {
      const list = map.get(e.category) ?? [];
      list.push(e);
      map.set(e.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [expenses]);

  const byJob = useMemo(() => {
    const map = new Map<string, BillableExpense[]>();
    for (const e of expenses) {
      const list = map.get(e.job_id) ?? [];
      list.push(e);
      map.set(e.job_id, list);
    }
    return map;
  }, [expenses]);

  if (isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading expenses…</div>;
  }
  if (expenses.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No un-invoiced expenses on the selected jobs.
      </div>
    );
  }

  const selected = expenses.filter((e) => selectedIds.has(e.id));
  const selectedTotal = selected.reduce((s, e) => s + chargeForExpense(e, vatRegistered).charged, 0);
  const missingReceipts = selected.filter((e) => e.receipts.length === 0).length;
  const vatUnknown = vatRegistered ? selected.filter((e) => e.vat_amount == null).length : 0;

  return (
    <div className="space-y-3 p-3 sm:p-4">
      {/* Category quick filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {categories.map(([category, list]) => {
          const picked = list.filter((e) => selectedIds.has(e.id)).length;
          const all = picked === list.length;
          return (
            <Button
              key={category}
              type="button"
              size="sm"
              variant={all ? "default" : picked > 0 ? "secondary" : "outline"}
              className="h-7 px-2.5 text-xs"
              aria-pressed={all}
              onClick={() => onSetMany(list.map((e) => e.id), !all)}
            >
              {category}
              <span className="ml-1.5 tabular-nums opacity-80">
                {picked}/{list.length}
              </span>
            </Button>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onSetMany(expenses.map((e) => e.id), selected.length !== expenses.length)}
        >
          {selected.length === expenses.length ? "Clear all" : "Select all"}
        </Button>
      </div>

      {/* Expenses grouped by job */}
      <div className="divide-y divide-border rounded-lg border border-border">
        {jobs
          .filter((j) => byJob.has(j.id))
          .map((job) => (
            <div key={job.id} className="p-2.5 sm:p-3">
              <p className="mb-1.5 text-xs font-semibold text-foreground">
                {jobRef(job)}
                <span className="ml-2 font-normal text-muted-foreground">{job.vehicle_reg}</span>
              </p>
              <ul className="space-y-1">
                {(byJob.get(job.id) ?? []).map((e) => {
                  const checked = selectedIds.has(e.id);
                  const charge = chargeForExpense(e, vatRegistered);
                  const noReceipt = e.receipts.length === 0;
                  const inputId = `expense-${e.id}`;
                  return (
                    <li
                      key={e.id}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                        checked ? "bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={(v) => onToggle(e.id, v === true)}
                      />
                      <label htmlFor={inputId} className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5">
                        <span className="font-medium text-foreground">{e.category}</span>
                        <span className="text-xs text-muted-foreground">{fmtDmy(e.date)}</span>
                        {(e.supplier || e.label) && (
                          <span className="truncate text-xs text-muted-foreground">{e.supplier || e.label}</span>
                        )}
                        {noReceipt ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            No receipt
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Paperclip className="h-3.5 w-3.5" aria-hidden />
                            {e.receipts.length}
                          </span>
                        )}
                      </label>
                      <span className="shrink-0 text-right text-sm font-semibold tabular-nums">
                        {gbp(charge.charged)}
                        {vatRegistered && charge.vat > 0 && (
                          <span className="block text-[10px] font-normal text-muted-foreground">
                            {gbp(charge.gross)} inc. VAT
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {selected.length} of {expenses.length} expense{expenses.length === 1 ? "" : "s"} selected
        </span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          Recharging {gbp(selectedTotal)}
        </span>
      </div>

      {missingReceipts > 0 && (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {missingReceipts} selected expense{missingReceipts === 1 ? " has" : "s have"} no receipt on file. The
          invoice will show an empty receipt slot for {missingReceipts === 1 ? "it" : "each"} — add the receipt or
          untick {missingReceipts === 1 ? "it" : "them"} before invoicing.
        </p>
      )}
      {vatUnknown > 0 && (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/5 p-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {vatUnknown} selected expense{vatUnknown === 1 ? " has" : "s have"} no VAT amount recorded, so{" "}
          {vatUnknown === 1 ? "it is" : "they are"} recharged at the full amount paid and VAT is added on top.
          Record the VAT on the expense to recharge it net.
        </p>
      )}
    </div>
  );
}
