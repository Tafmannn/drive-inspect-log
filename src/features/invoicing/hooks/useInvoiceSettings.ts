import { useQuery } from "@tanstack/react-query";
import { getOrgId } from "@/lib/orgHelper";
import { fetchOrgInvoiceSettings, type OrgInvoiceSettings } from "../api/invoiceDocument";
import { fetchBillableExpenses } from "../api/billableExpenses";

/** The business-level invoice settings: the VAT switch + legal identity for the footer. */
export function useOrgInvoiceSettings() {
  return useQuery({
    queryKey: ["invoicing", "org-settings"],
    queryFn: async (): Promise<OrgInvoiceSettings & { orgId: string }> => {
      const orgId = await getOrgId();
      return { orgId, ...(await fetchOrgInvoiceSettings(orgId)) };
    },
    staleTime: 60_000,
  });
}

/** Expenses that can still be recharged for the given jobs. */
export function useBillableExpenses(jobIds: string[]) {
  const key = [...jobIds].sort();
  return useQuery({
    // Under ["invoicing"] so creating or cancelling an invoice refreshes it.
    queryKey: ["invoicing", "billable-expenses", key],
    queryFn: () => fetchBillableExpenses(key),
    enabled: key.length > 0,
    staleTime: 15_000,
  });
}
