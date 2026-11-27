/**
 * Record a self-billing client's own paid invoice against the ticked jobs.
 *
 * The amount per job starts at our agreed price (or approved Abort fee) and can be
 * changed to exactly what the client paid; the difference from our prices is shown so a
 * short payment is noticed, never silently accepted.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileCheck2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { invalidateForEvent } from "@/lib/mutationEvents";
import type { Client } from "@/lib/clientApi";
import type { EligibleJob } from "../hooks/useInvoicePrepData";
import { recordSelfBilledInvoice, validateSelfBill } from "../api/selfBilledInvoice";
import { jobRef } from "../lib/invoiceMath";

function gbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Our expected amount for a job: the approved Abort fee for an abort, else the agreed price. */
export function expectedAmount(job: Pick<EligibleJob, "status" | "abort_fee" | "total_price">): number | null {
  const v = job.status === "aborted" ? job.abort_fee : job.total_price;
  return v != null && Number(v) > 0 ? Number(v) : null;
}

interface Props {
  client: Client;
  jobs: EligibleJob[];
  orgId: string;
  onRecorded: (invoiceNumber: string) => void;
}

export function RecordSelfBillPanel({ client, jobs, orgId, onRecorded }: Props) {
  const queryClient = useQueryClient();
  const clientLabel = (client.company || client.name).trim();
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [paidAt, setPaidAt] = useState(todayIso());
  const [reference, setReference] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // New jobs ticked start at our price; amounts already typed are kept.
  useEffect(() => {
    setAmounts((prev) => {
      const next: Record<string, string> = {};
      for (const j of jobs) next[j.id] = prev[j.id] ?? (expectedAmount(j)?.toFixed(2) ?? "");
      return next;
    });
  }, [jobs]);

  const lines = jobs.map((j) => ({ jobId: j.id, amount: Number(amounts[j.id]) }));
  const total = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
  const expectedTotal = jobs.reduce((s, j) => s + (expectedAmount(j) ?? 0), 0);
  const unpricedCount = jobs.filter((j) => expectedAmount(j) == null).length;
  const difference = Math.round((total - expectedTotal) * 100) / 100;

  const errors = useMemo(
    () => validateSelfBill({ clientId: client.id, invoiceNumber, issueDate, paidAt, lines, pdf, paymentReference: reference }, todayIso()),
    // lines is derived from jobs + amounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client.id, invoiceNumber, issueDate, paidAt, jobs, amounts, pdf, reference],
  );

  const save = async () => {
    setShowErrors(true);
    if (errors.length || saving) return;
    setSaving(true);
    try {
      await recordSelfBilledInvoice({
        orgId, clientId: client.id, invoiceNumber, issueDate, paidAt, lines, pdf, paymentReference: reference,
      });
      invalidateForEvent(queryClient, "invoice_created");
      toast({
        title: "Their invoice is recorded",
        description: `${invoiceNumber.trim()} from ${clientLabel} — ${jobs.length} job${jobs.length === 1 ? "" : "s"}, ${gbp(total)}, paid.`,
      });
      onRecorded(invoiceNumber.trim());
    } catch (e) {
      toast({ title: "Could not record their invoice", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border">
        <ul className="divide-y divide-border">
          {jobs.map((j) => {
            const expected = expectedAmount(j);
            return (
              <li key={j.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{jobRef(j)} <span className="font-normal text-muted-foreground">{j.vehicle_reg}</span></p>
                  <p className="text-xs text-muted-foreground">
                    {expected != null ? `Our price ${gbp(expected)}` : "No price on the job"}
                    {j.status === "aborted" ? " · Abort fee" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">£</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={amounts[j.id] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [j.id]: e.target.value }))}
                    aria-label={`Amount they paid for ${jobRef(j)}`}
                    className="h-10 w-28 text-right text-base sm:h-9 sm:text-sm"
                    disabled={saving}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Their invoice total</span>
          <span className="font-semibold tabular-nums">{gbp(total)}</span>
        </div>
      </div>
      {difference !== 0 && expectedTotal > 0 && (
        <p className="text-xs text-warning" role="status">
          {difference < 0 ? `${gbp(-difference)} less` : `${gbp(difference)} more`} than your prices for these jobs
          ({gbp(expectedTotal)}){unpricedCount ? `, and ${unpricedCount} job${unpricedCount === 1 ? " has" : "s have"} no price` : ""}.
          Check it matches what they paid.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sb-number">Their invoice number</Label>
          <Input id="sb-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={60}
            placeholder="As printed on their invoice" className="h-10 text-base sm:h-9 sm:text-sm" disabled={saving} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sb-reference">Payment reference (optional)</Label>
          <Input id="sb-reference" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80}
            placeholder="e.g. bank reference" className="h-10 text-base sm:h-9 sm:text-sm" disabled={saving} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sb-issue">Date on their invoice</Label>
          <Input id="sb-issue" type="date" value={issueDate} max={todayIso()} onChange={(e) => setIssueDate(e.target.value)}
            className="h-10 text-base sm:h-9 sm:text-sm" disabled={saving} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sb-paid">Date you were paid</Label>
          <Input id="sb-paid" type="date" value={paidAt} max={todayIso()} onChange={(e) => setPaidAt(e.target.value)}
            className="h-10 text-base sm:h-9 sm:text-sm" disabled={saving} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="sb-pdf">Their invoice (PDF)</Label>
          <Input id="sb-pdf" type="file" accept="application/pdf,.pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
            className="h-auto py-2 text-sm" disabled={saving} />
        </div>
      </div>

      {showErrors && errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-destructive" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving || jobs.length === 0} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
          Record paid invoice
        </Button>
      </div>
    </div>
  );
}
