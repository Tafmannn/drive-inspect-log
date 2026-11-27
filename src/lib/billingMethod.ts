/**
 * Who raises the invoice for a client's work?
 *
 *   we_invoice  : we invoice them through Invoice Prep (every client by default).
 *   self_billed : the client invoices themselves (e.g. Movex through their app) and sends
 *                 us the paid invoice. Their jobs stay out of Invoice Prep, "Ready to
 *                 bill" and the unbilled counts; we record their invoice instead so the
 *                 income is in the accounts.
 *
 * Stored on `clients.billing_method`. Keep the values in sync with the CHECK constraint
 * in supabase/migrations/20261127200000_client_self_billing.sql.
 */
export type BillingMethod = "we_invoice" | "self_billed";

export const BILLING_METHODS: readonly BillingMethod[] = ["we_invoice", "self_billed"];

export const DEFAULT_BILLING_METHOD: BillingMethod = "we_invoice";

/** Anything other than an explicit 'self_billed' (missing column, null, typo) is invoiced by us. */
export function normaliseBillingMethod(value: unknown): BillingMethod {
  return value === "self_billed" ? "self_billed" : DEFAULT_BILLING_METHOD;
}

export function isSelfBilled(client: { billing_method?: unknown } | null | undefined): boolean {
  return normaliseBillingMethod(client?.billing_method) === "self_billed";
}

export const BILLING_METHOD_LABEL: Record<BillingMethod, string> = {
  we_invoice: "We invoice them",
  self_billed: "They invoice themselves (self-billing)",
};

export const BILLING_METHOD_HELP: Record<BillingMethod, string> = {
  we_invoice: "Their completed jobs appear in Invoice Prep for you to invoice.",
  self_billed:
    "They raise the invoice (e.g. through their app) and send you the paid copy. Their jobs stay out of Invoice Prep — record their invoice instead, so the income is in your accounts.",
};
