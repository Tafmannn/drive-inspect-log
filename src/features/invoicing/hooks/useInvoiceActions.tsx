/**
 * useInvoiceActions — everything that can be done to an existing invoice
 * (download, download pack, email, mark sent, record / undo payment,
 * cancel), with the confirm dialogs those actions need.
 *
 * Returned as { actions, busy, dialogs } so one set of dialogs serves both
 * the "invoice created" card and every row of the invoice list.
 */
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PodEmailConfirmDialog } from "@/components/PodEmailConfirmDialog";
import { toast } from "@/hooks/use-toast";
import { invalidateForEvent } from "@/lib/mutationEvents";
import { invoicePdfFileName } from "@/lib/invoicePdf";
import type { InvoiceRecord } from "./useInvoices";
import { buildInvoiceDocument, type OrgInvoiceSettings } from "../api/invoiceDocument";
import { emailInvoice } from "../api/emailInvoice";
import {
  cancelInvoice,
  getInvoicePdf,
  markInvoicePaid,
  markInvoiceSent,
  markInvoiceUnpaid,
  PAYMENT_METHODS,
} from "../api/invoiceLifecycle";
import { buildInvoicePack, downloadBlob } from "../api/receiptExport";

export type InvoiceActionKind = "pdf" | "pack" | "email" | "sent" | "paid" | "unpaid" | "cancel";

export interface InvoiceActions {
  downloadPdf: (inv: InvoiceRecord) => Promise<void>;
  downloadPack: (inv: InvoiceRecord) => Promise<void>;
  email: (inv: InvoiceRecord) => void;
  markSent: (inv: InvoiceRecord) => Promise<void>;
  recordPayment: (inv: InvoiceRecord) => void;
  undoPayment: (inv: InvoiceRecord) => Promise<void>;
  cancel: (inv: InvoiceRecord) => void;
}

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function message(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Something went wrong.";
}

export function useInvoiceActions(
  settings: (OrgInvoiceSettings & { orgId: string }) | null | undefined,
  opts: { onChanged?: (invoiceId: string) => void } = {},
): {
  actions: InvoiceActions;
  /** `${invoiceId}:${kind}` of the action in flight, or null. */
  busy: string | null;
  isBusy: (inv: InvoiceRecord, kind?: InvoiceActionKind) => boolean;
  dialogs: ReactNode;
} {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [emailTarget, setEmailTarget] = useState<InvoiceRecord | null>(null);
  const [payTarget, setPayTarget] = useState<InvoiceRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InvoiceRecord | null>(null);

  const [paidAt, setPaidAt] = useState(todayIso());
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0].value);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  const refresh = (invoiceId: string) => {
    // Cancelling releases jobs and expenses, so the prep lists refresh too.
    invalidateForEvent(queryClient, "invoice_created");
    opts.onChanged?.(invoiceId);
  };

  const run = async (inv: InvoiceRecord, kind: InvoiceActionKind, fn: () => Promise<void>, failTitle: string) => {
    setBusy(`${inv.id}:${kind}`);
    try {
      await fn();
    } catch (err) {
      toast({ title: failTitle, description: message(err), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const actions: InvoiceActions = {
    downloadPdf: (inv) =>
      run(inv, "pdf", async () => {
        downloadBlob(await getInvoicePdf(inv, settings), invoicePdfFileName(inv.invoice_number));
        toast({ title: "Invoice PDF downloaded", description: inv.invoice_number });
      }, "Download failed"),

    downloadPack: (inv) =>
      run(inv, "pack", async () => {
        const pack = await buildInvoicePack(inv, settings);
        downloadBlob(pack.blob, pack.fileName);
        if (pack.failed.length > 0) {
          toast({
            title: `Pack downloaded — ${pack.failed.length} receipt${pack.failed.length === 1 ? "" : "s"} missing`,
            description: pack.failed.slice(0, 4).join(", "),
            variant: "destructive",
          });
        } else {
          toast({
            title: "Invoice pack downloaded",
            description: `PDF + ${pack.succeeded} receipt file${pack.succeeded === 1 ? "" : "s"}`,
          });
        }
      }, "Pack download failed"),

    email: (inv) => setEmailTarget(inv),

    markSent: (inv) =>
      run(inv, "sent", async () => {
        if (!settings) throw new Error("Organisation settings are still loading. Try again in a moment.");
        await markInvoiceSent(inv, settings.orgId, settings);
        refresh(inv.id);
        toast({
          title: "Marked as sent",
          description: `${inv.invoice_number} is now issued and locked.`,
        });
      }, "Could not mark as sent"),

    recordPayment: (inv) => {
      setPaidAt(todayIso());
      setMethod(PAYMENT_METHODS[0].value);
      setReference("");
      setPayTarget(inv);
    },

    undoPayment: (inv) =>
      run(inv, "unpaid", async () => {
        await markInvoiceUnpaid(inv.id);
        refresh(inv.id);
        toast({ title: "Payment removed", description: `${inv.invoice_number} is back to sent.` });
      }, "Could not undo the payment"),

    cancel: (inv) => {
      setReason("");
      setCancelTarget(inv);
    },
  };

  const confirmEmail = async (to: string) => {
    const inv = emailTarget;
    if (!inv) return;
    await run(inv, "email", async () => {
      if (!settings) throw new Error("Organisation settings are still loading. Try again in a moment.");
      // Once issued, the stored PDF is what gets emailed — never a re-render.
      const storedPdfPath = inv.status !== "draft" ? inv.pdf_url : null;
      const pdfData = storedPdfPath
        ? await buildInvoiceDocument(inv, { settings, withReceipts: false })
        : await buildInvoiceDocument(inv, { settings, withReceipts: true });
      const { recipient } = await emailInvoice({
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        orgId: settings.orgId,
        pdfData,
        to,
        storedPdfPath,
      });
      setEmailTarget(null);
      refresh(inv.id);
      toast({ title: "Invoice emailed", description: `${inv.invoice_number} sent to ${recipient}.` });
    }, "Invoice email failed");
  };

  const confirmPayment = async () => {
    const inv = payTarget;
    if (!inv) return;
    await run(inv, "paid", async () => {
      await markInvoicePaid(inv.id, { paidAt, method, reference });
      setPayTarget(null);
      refresh(inv.id);
      toast({ title: "Payment recorded", description: `${inv.invoice_number} marked as paid.` });
    }, "Could not record the payment");
  };

  const confirmCancel = async () => {
    const inv = cancelTarget;
    if (!inv) return;
    await run(inv, "cancel", async () => {
      const creditNoteId = await cancelInvoice(inv.id, reason);
      setCancelTarget(null);
      refresh(inv.id);
      toast({
        title: creditNoteId ? "Invoice cancelled — credit note raised" : "Draft invoice cancelled",
        description: `${inv.invoice_number}: its jobs and expenses can be invoiced again.`,
      });
    }, "Could not cancel the invoice");
  };

  const emailing = !!emailTarget && busy === `${emailTarget.id}:email`;
  const paying = !!payTarget && busy === `${payTarget.id}:paid`;
  const cancelling = !!cancelTarget && busy === `${cancelTarget.id}:cancel`;
  const cancelIssued = !!cancelTarget && cancelTarget.status !== "draft";

  const dialogs = (
    <>
      <PodEmailConfirmDialog
        open={!!emailTarget}
        onOpenChange={(open) => {
          if (!open && !emailing) setEmailTarget(null);
        }}
        defaultEmail={emailTarget?.client_email ?? ""}
        documentLabel={`Invoice ${emailTarget?.invoice_number ?? ""}`}
        sending={emailing}
        onConfirm={confirmEmail}
      />

      <Dialog open={!!payTarget} onOpenChange={(open) => { if (!open && !paying) setPayTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              {payTarget?.invoice_number} · £{Number(payTarget?.total ?? 0).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invoice-paid-at">Date received</Label>
              <Input
                id="invoice-paid-at"
                type="date"
                value={paidAt}
                max={todayIso()}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-payment-method">Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger id="invoice-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-payment-ref">Reference (optional)</Label>
              <Input
                id="invoice-payment-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="As shown on your bank statement"
                maxLength={120}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayTarget(null)} disabled={paying}>
              Back
            </Button>
            <Button onClick={confirmPayment} disabled={paying || !paidAt}>
              {paying && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open && !cancelling) setCancelTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel invoice {cancelTarget?.invoice_number}</DialogTitle>
            <DialogDescription>
              {cancelIssued
                ? "This invoice has been issued, so it is cancelled with a credit note for the full amount. Both stay on record. Send the credit note to the client."
                : "This draft was never issued, so it is cancelled without a credit note. Its number is not reused."}{" "}
              Its jobs and expenses become available to invoice again. This cannot be undone.
              {cancelTarget?.status === "paid" && " The invoice is marked as paid — refund the client separately."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="invoice-cancel-reason">Reason</Label>
            <Textarea
              id="invoice-cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong PO number"
              rows={3}
              maxLength={300}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Keep invoice
            </Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelling || !reason.trim()}>
              {cancelling && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {cancelIssued ? "Cancel and raise credit note" : "Cancel draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    actions,
    busy,
    isBusy: (inv, kind) => (kind ? busy === `${inv.id}:${kind}` : !!busy && busy.startsWith(`${inv.id}:`)),
    dialogs,
  };
}
