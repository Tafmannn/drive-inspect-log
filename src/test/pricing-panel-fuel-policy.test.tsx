/**
 * The Suggested Price panel for a client who pays fuel separately and for one whose price
 * includes it: what it says, and that the old "Missing inputs: fuel_estimate, ..." is gone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  policy: "recharged" as "recharged" | "included",
  policyFor: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: false, user: { id: "u1" } }) }));
vi.mock("@/lib/pricingDefaults", () => ({
  loadPricingDefaults: vi.fn().mockResolvedValue({ MIN_CHARGE: 50, MIN_RATE_PER_MILE: 1.2 }),
}));
vi.mock("@/lib/clientApi", () => ({
  getActiveClientRateCard: vi.fn().mockResolvedValue(null),
  getClientFuelPolicy: (id: string) => {
    h.policyFor(id);
    return Promise.resolve(h.policy);
  },
}));

import { PricingSuggestionPanel } from "@/components/PricingSuggestionPanel";

const panel = (clientId: string | null = "c1") => (
  <PricingSuggestionPanel
    clientId={clientId}
    inputs={{ routeMiles: 237.2, urgency: "standard" }}
  />
);

describe("PricingSuggestionPanel and fuel", () => {
  beforeEach(() => {
    h.policy = "recharged";
    h.policyFor.mockReset();
  });

  it("no longer shows 'Missing inputs: fuel_estimate, return_travel_estimate'", async () => {
    render(panel());
    expect(await screen.findByText(/237\.2 mi × £1\.20 = £284\.64/)).toBeInTheDocument();
    expect(screen.queryByText(/Missing inputs/)).toBeNull();
    expect(screen.queryByText(/fuel_estimate/)).toBeNull();
  });

  it("for a client who pays fuel separately, says it is billed on the invoice", async () => {
    render(panel());
    expect(await screen.findByText("Fuel is recharged on the invoice, so it is not in this price")).toBeInTheDocument();
    expect(h.policyFor).toHaveBeenCalledWith("c1");
  });

  it("for a fuel-included client, says the rate has to cover fuel", async () => {
    h.policy = "included";
    render(panel());
    expect(await screen.findByText("Fuel is included in this client's quote, so the rate has to cover it")).toBeInTheDocument();
    expect(screen.queryByText(/recharged on the invoice/)).toBeNull();
  });

  it("with no client chosen yet it does not look one up, and assumes fuel is billed on top", async () => {
    render(panel(null));
    expect(await screen.findByText("Fuel is recharged on the invoice, so it is not in this price")).toBeInTheDocument();
    expect(h.policyFor).not.toHaveBeenCalled();
  });
});
