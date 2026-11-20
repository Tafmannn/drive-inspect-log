/**
 * Per-client fuel policy: the rules, what the price suggestion says, and that the app's
 * values match the database migration.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEFAULT_FUEL_POLICY,
  FUEL_POLICIES,
  FUEL_POLICY_HELP,
  FUEL_POLICY_LABEL,
  fuelPolicyInvoiceNote,
  fuelPolicyPricingNote,
  normaliseFuelPolicy,
  rechargeCategoriesFor,
} from "@/lib/fuelPolicy";
import { suggestJobPrice } from "@/lib/pricingBrain";

const MIGRATION = "supabase/migrations/20261120120000_client_fuel_policy.sql";
const ROLLBACK = "supabase/rollback/20261120120000_client_fuel_policy.down.sql";
const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

describe("fuel policy rules", () => {
  it("an unset or unknown value behaves as before: the client pays fuel", () => {
    expect(DEFAULT_FUEL_POLICY).toBe("recharged");
    for (const v of [undefined, null, "", "other", 5]) expect(normaliseFuelPolicy(v)).toBe("recharged");
    expect(normaliseFuelPolicy("included")).toBe("included");
    expect(normaliseFuelPolicy("recharged")).toBe("recharged");
  });

  it("Invoice Prep ticks Fuel only when the client pays it separately", () => {
    expect(rechargeCategoriesFor("recharged")).toEqual(["Fuel"]);
    expect(rechargeCategoriesFor(undefined)).toEqual(["Fuel"]);
    expect(rechargeCategoriesFor(null)).toEqual(["Fuel"]);
    expect(rechargeCategoriesFor("included")).toEqual([]);
  });

  it("every policy has a label and help text", () => {
    for (const p of FUEL_POLICIES) {
      expect(FUEL_POLICY_LABEL[p]).toBeTruthy();
      expect(FUEL_POLICY_HELP[p]).toBeTruthy();
    }
    expect(FUEL_POLICY_LABEL.recharged).not.toBe(FUEL_POLICY_LABEL.included);
  });

  it("the invoice note appears only for a fuel-included client, and names the client", () => {
    expect(fuelPolicyInvoiceNote("recharged", "CJE")).toBeNull();
    expect(fuelPolicyInvoiceNote(undefined, "CJE")).toBeNull();
    expect(fuelPolicyInvoiceNote("included", "CJE Transport")).toBe(
      "Fuel is included in CJE Transport's price, so it is not ticked. Tick it only for a one-off recharge.",
    );
  });
});

describe("price suggestion", () => {
  const base = { routeMiles: 100, ratePerMile: 1.2 };

  it("no longer reports fuel or return travel as 'missing inputs'", () => {
    const r = suggestJobPrice(base);
    expect(r.missingInputs).toEqual([]);
    expect(r.suggestedPrice).toBe(120); // 100 mi x 1.20: fuel was never in the number
  });

  it("says fuel is billed on top by default, and for a recharged client", () => {
    for (const fuelPolicy of [undefined, null, "recharged" as const]) {
      const r = suggestJobPrice({ ...base, fuelPolicy });
      expect(r.reasons).toContain("Fuel is recharged on the invoice, so it is not in this price");
    }
  });

  it("says the rate must cover fuel for a fuel-included client", () => {
    const r = suggestJobPrice({ ...base, fuelPolicy: "included" });
    expect(r.reasons).toContain("Fuel is included in this client's quote, so the rate has to cover it");
    expect(r.reasons.join(" ")).not.toMatch(/recharged on the invoice/);
  });

  it("the policy never changes the number", () => {
    const a = suggestJobPrice({ ...base, fuelPolicy: "recharged" });
    const b = suggestJobPrice({ ...base, fuelPolicy: "included" });
    expect(a.suggestedPrice).toBe(b.suggestedPrice);
    expect(a.confidence).toBe(b.confidence);
  });

  it("a supplied fuel estimate is still added, and then the policy line is not repeated", () => {
    const r = suggestJobPrice({ ...base, fuelPolicy: "included", fuelEstimate: 20 });
    expect(r.suggestedPrice).toBe(140);
    expect(r.reasons).toContain("Fuel estimate £20.00");
    expect(r.reasons.join(" ")).not.toMatch(/included in this client/);
  });

  it("a flat-price client also gets the fuel line", () => {
    const r = suggestJobPrice({
      routeMiles: 100,
      fuelPolicy: "included",
      clientRateCard: { agreedPrice: 250 },
    });
    expect(r.suggestedPrice).toBe(250);
    expect(r.reasons).toContain("Fuel is included in this client's quote, so the rate has to cover it");
  });

  it("a real missing input (the route) is still reported", () => {
    expect(suggestJobPrice({ routeMiles: null }).missingInputs).toEqual(["route_miles"]);
  });

  it("a mid-range job on a client rate card can now be 'high' confidence; a long one stays low", () => {
    const card = { ratePerMile: 1.4 };
    expect(suggestJobPrice({ routeMiles: 100, clientRateCard: card }).confidence).toBe("high");
    expect(suggestJobPrice({ routeMiles: 237.2, ratePerMile: 1.2 }).confidence).toBe("low");
  });
});

describe("the migration", () => {
  it("adds the column with the default every client already behaves as, and a matching check", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS fuel_policy text NOT NULL DEFAULT 'recharged'/);
    const allowed = /CHECK \(fuel_policy IN \(([^)]*)\)\)/.exec(sql)?.[1] ?? "";
    expect([...allowed.matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort()).toEqual([...FUEL_POLICIES].sort());
  });

  it("is re-runnable and has a matching rollback", () => {
    expect(sql).toMatch(/IF NOT EXISTS \(/);
    expect(existsSync(resolve(process.cwd(), ROLLBACK))).toBe(true);
    const down = readFileSync(resolve(process.cwd(), ROLLBACK), "utf8");
    expect(down).toMatch(/DROP CONSTRAINT IF EXISTS clients_fuel_policy_check/);
    expect(down).toMatch(/DROP COLUMN IF EXISTS fuel_policy/);
  });
});
