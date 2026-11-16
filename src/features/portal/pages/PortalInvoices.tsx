import { Link } from "react-router-dom";
import { ChevronRight, FileText, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { usePortalInvoices } from "../api";
import { PortalInvoiceBadge } from "../components/PortalInvoiceBadge";
import { fmtDate, fmtGbp } from "../lib/format";

export default function PortalInvoices() {
  const { data: invoices, isLoading, error } = usePortalInvoices();

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return <p className="text-sm text-destructive py-8 text-center">Couldn't load your invoices. Please refresh to try again.</p>;
  }

  if (!invoices || invoices.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">No invoices yet.</p>
          <p className="text-xs text-muted-foreground">Invoices appear here once they've been sent to you.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <ul className="divide-y divide-border">
        {invoices.map((inv) => (
          <li key={inv.id}>
            <Link
              to={`/portal/invoices/${inv.id}`}
              className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50 focus:outline-none focus-visible:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="font-medium font-mono flex flex-wrap items-center gap-2">
                  {inv.invoice_number}
                  <PortalInvoiceBadge invoice={inv} />
                </p>
                <p className="text-xs text-muted-foreground">
                  Issued {fmtDate(inv.issue_date)}{inv.due_date ? ` · Due ${fmtDate(inv.due_date)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-semibold tabular-nums">{fmtGbp(inv.total)}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
