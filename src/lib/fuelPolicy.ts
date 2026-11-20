/**
 * Per-client fuel policy: does the client pay fuel on top of the price, or is it
 * already inside the price?
 *
 *   recharged : fuel is billed as its own line on the invoice (the original behaviour,
 *               and the default for every client).
 *   included  : the quote covers fuel; it is not recharged unless an admin ticks it.
 *
 * Stored on `clients.fuel_policy` (admin-only table). Keep the two values in sync with
 * the CHECK constraint in supabase/migrations/20261120120000_client_fuel_policy.sql
 * (src/test/client-fuel-policy.test.ts checks this).
 */

export type FuelPolicy = "recharged" | "included";

export const FUEL_POLICIES: readonly FuelPolicy[] = ["recharged", "included"];

/** Existing clients, and any client with no value, behave as before: fuel is recharged. */
export const DEFAULT_FUEL_POLICY: FuelPolicy = "recharged";

/** Expense category names are stored as typed ("Fuel"); this is the one fuel is filed under. */
export const FUEL_CATEGORY = "Fuel";

export function normaliseFuelPolicy(value: unknown): FuelPolicy {
  return value === "included" ? "included" : DEFAULT_FUEL_POLICY;
}

export const FUEL_POLICY_LABEL: Record<FuelPolicy, string> = {
  recharged: "Client pays fuel (billed on the invoice)",
  included: "Fuel included in the price",
};

export const FUEL_POLICY_HELP: Record<FuelPolicy, string> = {
  recharged:
    "Fuel receipts are added to the invoice as separate lines. Invoice Prep ticks Fuel for you.",
  included:
    "The quote already covers fuel, so Invoice Prep does not tick Fuel. The cost still counts against the job's profit.",
};

/** Expense categories Invoice Prep ticks by default for a client with this policy. */
export function rechargeCategoriesFor(policy: FuelPolicy | null | undefined): string[] {
  return normaliseFuelPolicy(policy) === "recharged" ? [FUEL_CATEGORY] : [];
}

/** One line for the price suggestion, so the admin sees which case applies. */
export function fuelPolicyPricingNote(policy: FuelPolicy | null | undefined): string {
  return normaliseFuelPolicy(policy) === "included"
    ? "Fuel is included in this client's quote, so the rate has to cover it"
    : "Fuel is recharged on the invoice, so it is not in this price";
}

/** Shown in Invoice Prep when fuel is not ticked by default for the client. */
export function fuelPolicyInvoiceNote(
  policy: FuelPolicy | null | undefined,
  clientName: string,
): string | null {
  if (normaliseFuelPolicy(policy) !== "included") return null;
  return `Fuel is included in ${clientName}'s price, so it is not ticked. Tick it only for a one-off recharge.`;
}
