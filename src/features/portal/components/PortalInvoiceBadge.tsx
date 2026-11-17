import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PortalInvoiceSummary } from "../api";
import { invoicePaymentLabel, invoicePaymentState, type InvoicePaymentState } from "../lib/invoiceStatus";

const TONE: Record<InvoicePaymentState, string> = {
  credit_note: "",
  cancelled: "text-muted-foreground",
  paid: "text-success border-success/30 bg-success/10",
  overdue: "text-destructive border-destructive/30 bg-destructive/10",
  due_today: "text-warning border-warning/40 bg-warning/10",
  due: "text-foreground",
  issued: "text-foreground",
};

/**
 * Payment status of an invoice: Paid, Overdue · N days, Due today, Due in N
 * days, Awaiting payment, Cancelled or Credit note. Every invoice now carries
 * a status, so a client can see at a glance what still needs paying.
 */
export function PortalInvoiceBadge({
  invoice,
  today,
  className,
}: {
  invoice: Pick<PortalInvoiceSummary, "status" | "document_type" | "due_date" | "total">;
  today?: Date;
  className?: string;
}) {
  const state = invoicePaymentState(invoice, today);
  return (
    <Badge variant="outline" className={cn("text-[10px] font-sans font-medium whitespace-nowrap", TONE[state], className)}>
      {invoicePaymentLabel(invoice, today)}
    </Badge>
  );
}
