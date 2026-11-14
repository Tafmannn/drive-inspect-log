import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { invoiceRecordToPdfData } from "@/features/invoicing/hooks/useInvoices";
import { usePortalInvoice, type PortalInvoiceDetail } from "../api";
import { PortalInvoiceBadge } from "../components/PortalInvoiceBadge";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtGbp } from "../lib/format";

/**
 * Fallback for invoices issued before PDFs were stored: the same mapper the
 * operator's own "Download PDF" uses, fed from the same stored invoice row.
 * (Invoices issued since are served as the exact stored file — see
 * handleDownload — which also carries the receipt copies.)
 */
function toPdfData(inv: PortalInvoiceDetail) {
  const base = invoiceRecordToPdfData({
    id: inv.id,
    invoice_number: inv.invoice_number,
    client_name: inv.client_name,
    client_company: inv.client_company,
    client_email: inv.client_email,
    client_address: inv.client_address,
    issue_date: inv.issue_date,
    due_date: inv.due_date,
    payment_terms: inv.payment_terms,
    line_items: inv.line_items,
    subtotal: inv.subtotal,
    vat_rate: inv.vat_rate,
    vat_amount: inv.vat_amount,
    total: inv.total,
    notes: inv.notes,
    status: inv.status ?? null,
    created_at: inv.issue_date ?? inv.sent_at,
    client_ref: inv.client_ref ?? null,
    vat_registered: inv.vat_registered ?? null,
    document_type: inv.document_type ?? null,
  });
  return {
    ...base,
    business: {
      name: inv.operator.legal_name || inv.operator.name,
      address: inv.operator.registered_address,
      companyNumber: inv.operator.company_number,
      vatNumber: inv.vat_registered ? inv.operator.vat_number : null,
    },
  };
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function PortalInvoiceDetailPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const { data: inv, isLoading, error } = usePortalInvoice(invoiceId);
  const [downloading, setDownloading] = useState(false);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !inv) {
    return (
      <div className="py-12 text-center space-y-3">
        <p className="text-sm font-medium">This invoice couldn't be found.</p>
        <Button variant="outline" asChild><Link to="/portal/invoices">Back to invoices</Link></Button>
      </div>
    );
  }

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { downloadInvoicePdf, invoicePdfFileName } = await import("@/lib/invoicePdf");
      // The file frozen when the invoice was issued, when there is one.
      if (inv.pdf_path) {
        const { data, error: dlError } = await supabase.storage.from("invoice-pdfs").download(inv.pdf_path);
        if (!dlError && data) {
          saveBlob(data, invoicePdfFileName(inv.invoice_number));
          return;
        }
      }
      await downloadInvoicePdf(toPdfData(inv));
    } catch {
      toast({ title: "Download failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const isCredit = inv.document_type === "credit_note";

  return (
    <div className="space-y-4">
      {inv.status === "cancelled" && (
        <p className="rounded-md border border-border bg-muted/50 p-3 text-sm">
          This invoice has been cancelled and is not payable. A credit note has been issued for it.
        </p>
      )}
      {isCredit && inv.credits_invoice_number && (
        <p className="rounded-md border border-border bg-muted/50 p-3 text-sm">
          This credit note cancels invoice <span className="font-mono">{inv.credits_invoice_number}</span>.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/portal/invoices"><ArrowLeft className="w-4 h-4 mr-1" /> All invoices</Link>
        </Button>
        <Button size="sm" onClick={handleDownload} disabled={downloading}>
          {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
          Download PDF
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {isCredit ? "Credit note" : "Invoice"}
              </p>
              <h1 className="text-xl font-semibold font-mono flex flex-wrap items-center gap-2">
                {inv.invoice_number}
                <PortalInvoiceBadge invoice={inv} />
              </h1>
              <p className="text-sm text-muted-foreground">
                Issued {fmtDate(inv.issue_date)}{inv.due_date ? ` · Due ${fmtDate(inv.due_date)}` : ""}
              </p>
              {inv.payment_terms && !isCredit && <p className="text-xs text-muted-foreground">Terms: {inv.payment_terms}</p>}
              {inv.client_ref && <p className="text-xs text-muted-foreground">Your ref: {inv.client_ref}</p>}
            </div>
            <div className="sm:text-right text-sm">
              <p className="font-medium">{inv.operator.legal_name || inv.operator.name}</p>
              {inv.operator.registered_address && (
                <p className="text-xs text-muted-foreground whitespace-pre-line">{inv.operator.registered_address}</p>
              )}
              {inv.operator.vat_number && <p className="text-xs text-muted-foreground">VAT {inv.operator.vat_number}</p>}
              {inv.operator.company_number && <p className="text-xs text-muted-foreground">Company {inv.operator.company_number}</p>}
            </div>
          </div>

          <div className="text-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Billed to</p>
            <p className="font-medium">{inv.client_company || inv.client_name}</p>
            {inv.client_company && inv.client_name && <p className="text-muted-foreground">{inv.client_name}</p>}
            {inv.client_address && <p className="text-muted-foreground whitespace-pre-line">{inv.client_address}</p>}
            {(inv.job_ref || inv.vehicle_reg) && (
              <p className="text-xs text-muted-foreground mt-1">
                {[inv.job_ref && `Ref ${inv.job_ref}`, inv.vehicle_reg].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          {inv.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left font-medium py-2">Description</th>
                    <th className="text-right font-medium py-2 w-14">Qty</th>
                    <th className="text-right font-medium py-2 w-24">Unit</th>
                    <th className="text-right font-medium py-2 w-24">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((it, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-2 pr-2">{it.description}</td>
                      <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                      <td className="py-2 text-right tabular-nums">{fmtGbp(it.unit_price)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtGbp(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <dl className="ml-auto w-full sm:w-64 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{fmtGbp(inv.subtotal)}</dd></div>
            {inv.vat_registered !== false && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">VAT{inv.vat_rate != null ? ` (${inv.vat_rate}%)` : ""}</dt>
                <dd className="tabular-nums">{fmtGbp(inv.vat_amount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1 font-semibold">
              <dt>Total</dt><dd className="tabular-nums">{fmtGbp(inv.total)}</dd>
            </div>
          </dl>

          {inv.notes && <p className="text-xs text-muted-foreground whitespace-pre-wrap border-t border-border pt-3">{inv.notes}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
