import { describe, it, expect } from "vitest";
import {
  editDistance,
  groupUnlinkedJobs,
  normalizeName,
  similarity,
  suggestClient,
  type MatchClient,
} from "@/features/clients/lib/jobClientMatch";

// Shapes mirror the live data: a client's `name` is usually the contact
// person, sometimes the company again; jobs record company and contact
// separately, and older jobs put the company in the contact field.
const CLIENTS: MatchClient[] = [
  { id: "cje", name: "Chris Ellsworth", company: "CJE Transport", contact_name: "Chris Ellsworth ", email: "cjetrans@outlook.com" },
  { id: "rev", name: "Revillo Automotive ", company: "Revillo Automotive ", contact_name: "Lewis Pythian", email: "tony@revillo.test" },
  { id: "hj", name: "Peter Moorhouse", company: "Halliwell Jones BMW Chester", email: "peter@hj.test" },
  { id: "movex", name: "Movex", company: "Movex", email: "" },
  { id: "cs", name: "Salman Mustafa", company: "Car Sourcing Ltd", contact_email: "carsourcing@test.com" },
];

const job = (client_company: string | null, client_name: string | null, client_email: string | null = null) => ({
  client_company,
  client_name,
  client_email,
});

describe("normalizeName / similarity", () => {
  it("matches the database's normalize_client_name rule", () => {
    expect(normalizeName("  Revillo Automotive ")).toBe("revilloautomotive");
    expect(normalizeName("Car-Sourcing Ltd.")).toBe("carsourcingltd");
    expect(normalizeName(null)).toBe("");
  });

  it("scores typos highly and different names low", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(similarity("rovelloautomotive", "revilloautomotive")).toBeGreaterThanOrEqual(0.8);
    expect(similarity("jct600", "movex")).toBeLessThan(0.5);
    expect(similarity("", "movex")).toBe(0);
  });
});

describe("suggestClient", () => {
  it("matches the company field exactly, ignoring case and spacing", () => {
    expect(suggestClient(job("CJE Transport", "Chris Ellsworth"), CLIENTS)).toMatchObject({ clientId: "cje", confidence: "exact" });
    expect(suggestClient(job("Revillo automotive", "Tony Beaney"), CLIENTS)).toMatchObject({ clientId: "rev", confidence: "exact" });
    expect(suggestClient(job("Halliwell Jones BMW Chester", "Peter Moorhouse"), CLIENTS)).toMatchObject({ clientId: "hj", confidence: "exact" });
  });

  it("matches a company typed into the contact field (older jobs)", () => {
    expect(suggestClient(job(null, "Movex"), CLIENTS)).toMatchObject({ clientId: "movex", confidence: "exact" });
  });

  it("matches on email", () => {
    expect(suggestClient(job(null, null, "CarSourcing@test.com"), CLIENTS)).toMatchObject({ clientId: "cs", confidence: "exact" });
  });

  it("flags a typo'd company as likely, not exact", () => {
    expect(suggestClient(job(null, "Rovello Automotive"), CLIENTS)).toMatchObject({ clientId: "rev", confidence: "likely" });
  });

  it("falls back to the contact person as likely", () => {
    expect(suggestClient(job(null, "Salman Mustafa"), CLIENTS)).toMatchObject({ clientId: "cs", confidence: "likely" });
  });

  it("suggests nothing for unknown or empty details", () => {
    expect(suggestClient(job(null, "JCT600"), CLIENTS)).toBeNull();
    expect(suggestClient(job(null, "Thrifty"), CLIENTS)).toBeNull();
    expect(suggestClient(job(null, null), CLIENTS)).toBeNull();
    expect(suggestClient(job("", "  "), CLIENTS)).toBeNull();
  });

  it("refuses to guess between two equally good clients", () => {
    const dupes: MatchClient[] = [
      { id: "a", name: "Acme", company: "Acme Ltd" },
      { id: "b", name: "Acme", company: "Acme Ltd" },
    ];
    expect(suggestClient(job("Acme Ltd", null), dupes)).toBeNull();
  });

  it("prefers the active client when a duplicate is archived", () => {
    const dupes: MatchClient[] = [
      { id: "old", name: "Acme", company: "Acme Ltd", is_active: false },
      { id: "new", name: "Acme", company: "Acme Ltd", is_active: true },
    ];
    expect(suggestClient(job("Acme Ltd", null), dupes)).toMatchObject({ clientId: "new" });
  });

  it("does not fuzzy-match very short names", () => {
    expect(suggestClient(job("Move", null), CLIENTS)).toBeNull();
  });
});

describe("groupUnlinkedJobs", () => {
  it("groups by recorded details, suggestion per group, empty group last", () => {
    const jobs = [
      { id: "1", ...job("CJE Transport", "Chris Ellsworth") },
      { id: "2", ...job(null, null) },
      { id: "3", ...job("CJE transport", "Chris  Ellsworth") },
      { id: "4", ...job(null, "JCT600") },
      { id: "5", ...job("", "") },
    ];
    const groups = groupUnlinkedJobs(jobs, CLIENTS);
    expect(groups.map((g) => g.jobs.map((j) => j.id))).toEqual([["1", "3"], ["4"], ["2", "5"]]);
    expect(groups[0].suggestion).toMatchObject({ clientId: "cje", confidence: "exact" });
    expect(groups[1].suggestion).toBeNull();
    expect(groups[2].key).toBe("");
    expect(groups[2].suggestion).toBeNull();
  });
});
