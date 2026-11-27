import { describe, it, expect } from "vitest";
import { tidyName, tidyClientNames, namesLookAlike, findSimilarClients } from "@/lib/clientNames";

describe("client name tidy-up", () => {
  it("trims and collapses spaces, leaving null alone", () => {
    expect(tidyName("  Revillo   Automotive ")).toBe("Revillo Automotive");
    expect(tidyName(null)).toBeNull();
    expect(tidyClientNames({ name: " Movex ", company: null, email: " x " })).toEqual({ name: "Movex", company: null, email: " x " });
    expect(tidyClientNames({ payment_terms: "Net 30" } as { name?: string; payment_terms: string })).toEqual({ payment_terms: "Net 30" });
  });

  it("spots near-duplicate business names", () => {
    expect(namesLookAlike("Revillo Automotive", "Revilo Automotive")).toBe(true);
    expect(namesLookAlike("Revillo Automotive ", "revillo automotive ltd")).toBe(true);
    expect(namesLookAlike("Movex", "Movex Ltd")).toBe(true);
    expect(namesLookAlike("Halliwell Jones BMW Chester", "Halliwell Jones")).toBe(true);
    expect(namesLookAlike("Movex", "Revillo Automotive")).toBe(false);
    expect(namesLookAlike("CJE Transport", "CJE Transit")).toBe(false);
    expect(namesLookAlike("AB", "AB")).toBe(false);
  });

  it("finds similar existing clients, ignoring the one being edited", () => {
    const clients = [
      { id: "1", name: "Revillo Automotive ", company: "Revillo Automotive " },
      { id: "2", name: "Movex", company: "Movex" },
    ];
    expect(findSimilarClients("Revilo Automotive", clients).map((c) => c.id)).toEqual(["1"]);
    expect(findSimilarClients("Revillo Automotive", clients, "1")).toEqual([]);
    expect(findSimilarClients("", clients)).toEqual([]);
  });
});
