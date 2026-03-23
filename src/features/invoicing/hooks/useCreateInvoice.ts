import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createMultiJobInvoice, type CreateInvoiceInput } from "../api/createInvoice";

export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMultiJobInvoice,
    onSuccess: () => {
      // Invalidate eligible jobs so they disappear from the prep list
      queryClient.invalidateQueries({ queryKey: ["invoice-prep-eligible"] });
    },
  });
}
