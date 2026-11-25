/** Guided correction of an already-invoiced Abort fee.
 * A Super Admin explicitly approves a full invoice credit, then the existing
 * invoice preparation screen creates a new, correctly priced invoice.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2, ReceiptText } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import type { JobAbort } from "../api/abortApi";
import { useAbortInvoiceDetails, useCorrectInvoicedAbortFee } from "../hooks/useAbort";
import { abortErrorMessage, approvalAmountProblem, formatAbortConfirmedAt } from "../lib/abortRules";

const pounds = (value: number | null | undefined) =>
  value == null ? "—" : "£" + value.toFixed(2);

export function AbortInvoiceCorrection({
  jobId, clientId, abort,
}: Readonly<{ jobId: string; clientId: string | null; abort: JobAbort }>) {
  const { isSuperAdmin } = useAuth();
  const details = useAbortInvoiceDetails(jobId, true);
  const correct = useCorrectInvoicedAbortFee(jobId);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [clientConfirmed, setClientConfirmed] = useState(false);
  const [multiAcknowledged, setMultiAcknowledged] = useState(false);
  const [paidAcknowledged, setPaidAcknowledged] = useState(false);
  const [authoriseCredit, setAuthoriseCredit] = useState(false);

  if (details.isLoading) return <p className="text-xs text-muted-foreground">Loading invoice history…</p>;
  if (details.isError) {
    return <p role="alert" className="text-xs text-destructive">
      Invoice history unavailable. {abortErrorMessage(details.error)}. Do not attempt a correction until this loads.
    </p>;
  }

  const activeInvoice = details.data?.activeInvoice ?? null;
  const corrections = details.data?.corrections ?? [];
  const latestCorrection = corrections[0] ?? null;
  const problem = approvalAmountProblem(amount, abort.agreed_price);
  const canSubmit = !!activeInvoice && clientConfirmed && reason.trim().length >= 15
    && reason.trim().length <= 500 && !problem && amount.trim() !== ""
    && Number(amount) !== abort.approved_amount && !correct.isPending
    && (activeInvoice.otherJobCount === 0 || multiAcknowledged)
    && (activeInvoice.status !== "paid" || paidAcknowledged)
    && (activeInvoice.status === "draft" || authoriseCredit);

  const openCorrection = () => {
    setAmount(abort.approved_amount?.toFixed(2) ?? "");
    setReason("");
    setClientConfirmed(false);
    setMultiAcknowledged(false);
    setPaidAcknowledged(false);
    setAuthoriseCredit(false);
    setOpen(true);
  };

  const submit = async () => {
    if (!activeInvoice || !canSubmit || abort.approved_amount == null) return;
    try {
      const result = await correct.mutateAsync({
        abortId: abort.id,
        originalInvoiceId: activeInvoice.id,
        newAmount: Number(amount),
        expectedAmount: abort.approved_amount,
        reason: reason.trim(),
        clientConfirmed,
        multiJobAcknowledged: multiAcknowledged,
        paidAcknowledged,
        authoriseCredit: activeInvoice.status !== "draft" && authoriseCredit,
      });
      setOpen(false);
      toast({
        title: result.creditNoteId ? "Full credit note created" : "Draft invoice cancelled",
        description: "Revised Abort fee " + pounds(result.approvedAmount) +
          ". Prepare a new invoice and send the corrected documents to the client.",
      });
    } catch (error) {
      toast({ title: "Correction not saved", description: abortErrorMessage(error), variant: "destructive" });
    }
  };

  const invoicePrepUrl = clientId
    ? "/control/invoice-prep?clientId=" + encodeURIComponent(clientId) +
      "&abortCorrectionJob=" + encodeURIComponent(jobId)
    : "/control/invoice-prep";

  return (
    <section className="space-y-2 rounded-lg border border-border p-3" aria-label="Abort invoice correction">
      <div className="flex items-center gap-2">
        <ReceiptText className="h-4 w-4 text-muted-foreground" />
        <p className="text-[13px] font-medium">Invoice correction history</p>
      </div>
      {activeInvoice && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Live invoice <strong className="text-foreground">{activeInvoice.invoice_number}</strong>
            {" · "}{pounds(activeInvoice.total)} total · {activeInvoice.status}
          </p>
          {isSuperAdmin && abort.finance_status === "approved" && (
            <Button variant="outline" className="min-h-11" onClick={openCorrection}>
              Correct invoiced Abort fee
            </Button>
          )}
          {!isSuperAdmin && (
            <p className="text-xs text-muted-foreground">Only a Super Admin can correct an invoiced Abort fee.</p>
          )}
        </div>
      )}

      {corrections.map((entry) => (
        <div key={entry.id} className="space-y-1 rounded-lg bg-muted/30 p-2 text-xs">
          <p className="font-medium">
            {entry.original_invoice_number} — full credit
            {entry.credit_note_id ? " issued" : " not required (draft)"}
          </p>
          <p className="text-muted-foreground">
            {pounds(entry.previous_fee)} → {pounds(entry.revised_fee)}
            {" · "}{formatAbortConfirmedAt(entry.created_at)}
          </p>
          <p className="text-muted-foreground">
            {entry.replacement_invoice_id ? "Replacement invoice linked" : "Replacement invoice outstanding"}
            {entry.other_jobs_on_invoice > 0
              ? " · " + entry.other_jobs_on_invoice + " other job(s) released for re-invoicing"
              : ""}
            {entry.original_was_paid ? " · Reconcile original payment/refund" : ""}
          </p>
        </div>
      ))}

      {!activeInvoice && latestCorrection && !latestCorrection.replacement_invoice_id && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {Number(abort.approved_amount ?? 0) > 0
              ? "Next: create a revised invoice at the current approved Abort fee. Do not change the original invoice."
              : "The revised fee is £0. No replacement invoice is required."}
          </p>
          {Number(abort.approved_amount ?? 0) > 0 && clientId && (
            <Button asChild variant="outline" className="min-h-11">
              <Link to={invoicePrepUrl}>Prepare revised invoice</Link>
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Send the full credit note and the replacement invoice to the customer using existing invoice actions.
          </p>
        </div>
      )}

      <Dialog open={open} onOpenChange={(value) => { if (!correct.isPending) setOpen(value); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Correct invoiced Abort fee</DialogTitle>
            <DialogDescription>
              This creates a FULL credit for the original invoice, updates the approved fee,
              and retains all financial history. The replacement invoice is created separately.
            </DialogDescription>
          </DialogHeader>
          {activeInvoice && (
            <div className="space-y-3 py-1">
              <div className="text-sm">
                <p>Original invoice: <strong>{activeInvoice.invoice_number}</strong></p>
                <p>Full invoice total: <strong>{pounds(activeInvoice.total)}</strong></p>
                <p>Current Abort fee: <strong>{pounds(abort.approved_amount)}</strong></p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="abort-corrected-invoice-fee">Client-confirmed revised Abort fee (£)</Label>
                <Input id="abort-corrected-invoice-fee" inputMode="decimal"
                  value={amount} disabled={correct.isPending}
                  onChange={(event) => setAmount(event.target.value)} />
                {problem && <p role="alert" className="text-xs text-destructive">{problem}</p>}
                {abort.agreed_price != null && Number(amount) > abort.agreed_price && (
                  <p className="text-xs text-amber-600">This fee exceeds the original job price. Client confirmation is required.</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="abort-invoice-correction-reason">Reason for correction</Label>
                <Textarea id="abort-invoice-correction-reason" value={reason}
                  maxLength={500} disabled={correct.isPending}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain the revised amount confirmed by the client (at least 15 characters)" />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={clientConfirmed} disabled={correct.isPending}
                  onCheckedChange={(value) => setClientConfirmed(value === true)} />
                <span>I confirm the client has agreed to this revised Abort fee.</span>
              </label>
              {activeInvoice.status !== "draft" && (
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={authoriseCredit} disabled={correct.isPending}
                    onCheckedChange={(value) => setAuthoriseCredit(value === true)} />
                  <span>I authorise creation of a full credit note for the original invoice.</span>
                </label>
              )}
              {activeInvoice.otherJobCount > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-500/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4" /> Multi-job invoice
                  </p>
                  <p className="text-xs">
                    {activeInvoice.otherJobCount} other job(s) are on this invoice.
                    A full credit releases ALL of them; they must be re-invoiced as appropriate.
                  </p>
                  <label className="flex gap-2 text-sm">
                    <Checkbox checked={multiAcknowledged} disabled={correct.isPending}
                      onCheckedChange={(value) => setMultiAcknowledged(value === true)} />
                    <span>I understand the whole invoice will be credited.</span>
                  </label>
                </div>
              )}
              {activeInvoice.status === "paid" && (
                <div className="space-y-2 rounded-lg border border-amber-400/40 p-3">
                  <p className="text-xs">This invoice is marked paid. A full credit does not automatically refund the client or reconcile the payment.</p>
                  <label className="flex gap-2 text-sm">
                    <Checkbox checked={paidAcknowledged} disabled={correct.isPending}
                      onCheckedChange={(value) => setPaidAcknowledged(value === true)} />
                    <span>I will reconcile the original payment/refund separately.</span>
                  </label>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={correct.isPending} onClick={() => setOpen(false)}>Keep original</Button>
            <Button disabled={!canSubmit} onClick={() => void submit()}>
              {correct.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {activeInvoice?.status === "draft" ? "Cancel draft & update fee" : "Issue full credit & update fee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
