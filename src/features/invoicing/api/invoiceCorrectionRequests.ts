import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const correctionQueryKey = ["invoicing", "corrections"] as const;
export type CorrectionRequest = Database["public"]["Tables"]["invoice_correction_requests"]["Row"];

export async function deferInvoiceCorrection(input: {
  invoiceId: string; reason: string; abortId?: string;
  revisedFee?: number; expectedFee?: number; clientConfirmed?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc("defer_invoice_correction", {
    p_invoice_id: input.invoiceId, p_reason: input.reason.trim(), p_abort_id: input.abortId,
    p_revised_fee: input.revisedFee, p_expected_fee: input.expectedFee,
    p_client_confirmed: input.clientConfirmed,
  });
  if (error) throw new Error(error.message);
  return data;
}

export function useDeferInvoiceCorrection() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: deferInvoiceCorrection,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: correctionQueryKey }); } });
}
export function usePendingInvoiceCorrections() {
  return useQuery({
    queryKey: correctionQueryKey,
    queryFn: async (): Promise<CorrectionRequest[]> => {
      const { data, error } = await supabase.from("invoice_correction_requests")
        .select("*").eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
export function useWithdrawInvoiceCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("withdraw_invoice_correction", { p_request_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: correctionQueryKey }); },
  });
}
