import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
// Who may spend the org's paid third-party API quota (Google Maps/Places,
// DVLA). Shared with the five lookup edge functions via _shared/staffAuth.ts.
import { staffDecision } from "../../supabase/functions/_shared/staffGate";

const ORG = "11111111-2222-4333-8444-555555555555";

describe("staffDecision", () => {
  it.each(["driver", "admin", "super_admin"])("allows an active %s with an org", (role) => {
    expect(staffDecision({ role, org_id: ORG, account_status: "active" })).toBeNull();
  });

  it("allows a super admin without an org", () => {
    expect(staffDecision({ role: "super_admin", org_id: null, account_status: "active" })).toBeNull();
  });

  it("treats a missing account_status as active (matches _shared/auth.ts)", () => {
    expect(staffDecision({ role: "driver", org_id: ORG })).toBeNull();
  });

  it("refuses customer-portal logins", () => {
    expect(staffDecision({ role: "client", org_id: null, account_status: "active" })).toMatchObject({
      status: 403,
      error: "STAFF_ONLY",
    });
  });

  it("refuses a client even if an org were somehow set", () => {
    expect(staffDecision({ role: "client", org_id: ORG, account_status: "active" })?.status).toBe(403);
  });

  it("refuses users with no profile", () => {
    expect(staffDecision(null)?.status).toBe(403);
    expect(staffDecision(undefined)?.status).toBe(403);
  });

  it.each(["suspended", "pending_activation", "anything_else"])("refuses %s accounts", (account_status) => {
    expect(staffDecision({ role: "admin", org_id: ORG, account_status })?.status).toBe(403);
  });

  it("refuses drivers and admins without an org", () => {
    expect(staffDecision({ role: "driver", org_id: null, account_status: "active" })?.status).toBe(403);
    expect(staffDecision({ role: "admin", org_id: null, account_status: "active" })?.status).toBe(403);
  });

  it("refuses unknown, empty or differently-cased roles (fail closed)", () => {
    for (const role of ["", null, "ADMIN", "Driver", "superadmin", "owner"]) {
      expect(staffDecision({ role, org_id: ORG, account_status: "active" })?.status).toBe(403);
    }
  });
});

describe("paid lookup functions are staff-gated", () => {
  const FUNCTIONS = ["business-search", "place-details", "postcode-lookup", "maps-directions", "vehicle-lookup"];

  it.each(FUNCTIONS)("%s calls checkStaff and has no public path", (fn) => {
    const src = readFileSync(join(__dirname, "../../supabase/functions", fn, "index.ts"), "utf8");
    expect(src).toContain('from "../_shared/staffAuth.ts"');
    expect(src).toMatch(/const denied = await checkStaff\(req\);\s*if \(denied\)/);
    expect(src).not.toMatch(/isPublicCall/);
    // The gate must run before any billed key is read.
    const gate = src.indexOf("checkStaff(req)");
    const key = Math.max(src.indexOf("GOOGLE_MAPS_API_KEY"), src.indexOf("DVLA_VES_API_KEY"));
    expect(gate).toBeGreaterThan(-1);
    expect(key).toBeGreaterThan(gate);
  });
});
