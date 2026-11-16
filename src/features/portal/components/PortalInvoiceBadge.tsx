import { Badge } from "@/components/ui/badge";
import type { PortalInvoiceSummary } from "../api";

/** Paid / Cancelled / Credit note. A plain sent invoice shows no badge. */
export function PortalInvoiceBadge({ invoice }: { invoice: Pick<PortalInvoiceSummary, "status" | "document_type"> }) {
  if (invoice.document_type === "credit_note") {
    return <Badge variant="outline" className="text-[10px] font-sans">Credit note</Badge>;
  }
  if (invoice.status === "cancelled") {
    return <Badge variant="outline" className="text-[10px] font-sans text-muted-foreground">Cancelled</Badge>;
  }
  if (invoice.status === "paid") {
    return <Badge variant="outline" className="text-[10px] font-sans text-success border-success/30">Paid</Badge>;
  }
  return null;
}
