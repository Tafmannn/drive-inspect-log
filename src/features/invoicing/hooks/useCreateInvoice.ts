import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createMultiJobInvoice } from "../api/createInvoice";
import { invalidateForEvent } from "@/lib/mutationEvents";

export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMultiJobInvoice,
    onSuccess: () => {
      // Invoice creation makes jobs leave the prep list AND can change
      // their queue membership (e.g. "Completed not invoiced" → invoiced).
      // Use the centralised event so every admin-visible surface refreshes.
      invalidateForEvent(queryClient, "invoice_created");
    },
  });
}
