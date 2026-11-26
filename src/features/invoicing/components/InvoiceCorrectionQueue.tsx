import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ControlSection } from "../../control/components/shared/ControlShell";
import { usePendingInvoiceCorrections, useWithdrawInvoiceCorrection, type CorrectionRequest } from "../api/invoiceCorrectionRequests";
import { INVOICE_LIST_COLUMNS, type InvoiceRecord } from "../hooks/useInvoices";

export function InvoiceCorrectionQueue({ onReview }: Readonly<{ onReview: (invoice: InvoiceRecord, reason: string) => void }>) {
  const { isSuperAdmin } = useAuth();
  const { data, isLoading, isError, refetch } = usePendingInvoiceCorrections();
  const withdraw = useWithdrawInvoiceCorrection();
  const [reviewing, setReviewing] = useState<string | null>(null);

  const review = async (row: CorrectionRequest) => {
    setReviewing(row.id);
    try {
      const { data: invoice, error } = await supabase.from("invoices")
        .select(INVOICE_LIST_COLUMNS).eq("id", row.invoice_id).single();
      if (error || !invoice) throw new Error(error?.message ?? "Invoice unavailable");
      const current = invoice as unknown as InvoiceRecord;
      if (current.status === "cancelled") { void refetch(); throw new Error("The original invoice is already cancelled."); }
      onReview(current, row.reason);
    } catch (err) {
      toast({ title: "Review unavailable", description: err instanceof Error ? err.message : "Could not load invoice", variant: "destructive" });
    } finally { setReviewing(null); }
  };

  const remove = async (id: string) => {
    try {
      await withdraw.mutateAsync(id);
      toast({ title: "Correction request withdrawn", description: "The original invoice is unchanged." });
    } catch (err) {
      toast({ title: "Withdrawal failed", description: err instanceof Error ? err.message : "Please retry", variant: "destructive" });
    }
  };

  if (isLoading) return null;
  if (isError) return <ControlSection title="Financial corrections"><p role="alert">Correction requests unavailable.</p><Button variant="outline" onClick={() => void refetch()}>Retry</Button></ControlSection>;
  if (!data?.length) return null;
  return <ControlSection title="Financial corrections" description="Pending review — no credit note has been authorised">
    <div className="space-y-3">
      {data.map(row => <div key={row.id} className="rounded-lg border p-3 space-y-2">
        <p className="font-medium text-sm">{row.invoice_number} · {row.abort_id ? "Abort fee correction" : "Invoice correction"}</p>
        <p className="text-xs text-muted-foreground">{row.reason}</p>
        {row.revised_fee != null && <p className="text-sm">Requested revised fee: £{Number(row.revised_fee).toFixed(2)}</p>}
        <div className="flex flex-wrap gap-2">
          {row.abort_id ? (isSuperAdmin && row.job_id && <Button asChild variant="outline"><Link to={"/jobs/" + row.job_id}>Review on job</Link></Button>)
            : <Button variant="outline" disabled={reviewing !== null} onClick={() => void review(row)}>Review invoice</Button>}
          {(!row.abort_id || isSuperAdmin) && <Button variant="ghost" disabled={withdraw.isPending} onClick={() => void remove(row.id)}>Withdraw request</Button>}
        </div>
      </div>)}
    </div>
  </ControlSection>;
}
