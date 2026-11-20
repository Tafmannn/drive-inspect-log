import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { decideAssignDriver } from "../../supabase/functions/_shared/assignDriverPolicy";

// assign-driver uses the service role, which skips the user_profiles guard
// trigger. These tests pin the in-function guard: it may attach drivers and
// brand-new users only, and never rewrites a privileged or protected account.

const adminA = { orgId: "A", isAdmin: true, isSuperAdmin: false };
const superA = { orgId: "A", isAdmin: true, isSuperAdmin: true };
const driverA = { orgId: "A", isAdmin: false, isSuperAdmin: false };

describe("decideAssignDriver", () => {
  it("refuses non-admin callers", () => {
    expect(decideAssignDriver(driverA, null, null)).toMatchObject({ ok: false, status: 403 });
  });

  it("admin cannot demote or move the protected owner, in any org or none", () => {
    for (const org_id of ["A", "B", null]) {
      for (const role of ["super_admin", "admin", "driver"]) {
        expect(decideAssignDriver(adminA, null, { role, org_id, is_protected: true }))
          .toEqual({ ok: false, status: 403, error: "TARGET_PROTECTED" });
      }
    }
  });

  it("super-admin cannot rewrite a protected account through this endpoint either", () => {
    expect(decideAssignDriver(superA, "B", { role: "super_admin", org_id: null, is_protected: true }))
      .toMatchObject({ ok: false, error: "TARGET_PROTECTED" });
  });

  it("admin cannot demote a super-admin or another admin (same org or org-less)", () => {
    for (const role of ["super_admin", "admin"]) {
      for (const org_id of ["A", null]) {
        expect(decideAssignDriver(adminA, null, { role, org_id }))
          .toEqual({ ok: false, status: 409, error: "TARGET_ROLE_NOT_DRIVER" });
      }
    }
  });

  it("super-admin cannot use it as a demotion path either", () => {
    expect(decideAssignDriver(superA, null, { role: "admin", org_id: "A" }))
      .toMatchObject({ ok: false, error: "TARGET_ROLE_NOT_DRIVER" });
  });

  it("portal users are refused", () => {
    expect(decideAssignDriver(adminA, null, { role: "client", org_id: null, client_id: "c1" }))
      .toMatchObject({ ok: false, error: "TARGET_IS_PORTAL_USER" });
  });

  it("admin cannot pull another org's driver", () => {
    expect(decideAssignDriver(adminA, null, { role: "driver", org_id: "B" }))
      .toEqual({ ok: false, status: 403, error: "CROSS_ORG_FORBIDDEN" });
  });

  it("admin's requested org_id is ignored — always their own org", () => {
    expect(decideAssignDriver(adminA, "B", null)).toEqual({ ok: true, targetOrgId: "A", changesOrg: true });
  });

  it("admin may attach a new user or an org-less / same-org driver", () => {
    expect(decideAssignDriver(adminA, null, null)).toMatchObject({ ok: true, targetOrgId: "A" });
    expect(decideAssignDriver(adminA, null, { role: "driver", org_id: null })).toMatchObject({ ok: true });
    expect(decideAssignDriver(adminA, null, { role: "driver", org_id: "A" }))
      .toEqual({ ok: true, targetOrgId: "A", changesOrg: false });
  });

  it("super-admin may move a driver between orgs", () => {
    expect(decideAssignDriver(superA, "B", { role: "driver", org_id: "A" }))
      .toEqual({ ok: true, targetOrgId: "B", changesOrg: true });
  });

  it("admin with no org is refused", () => {
    expect(decideAssignDriver({ ...adminA, orgId: null }, "B", null))
      .toMatchObject({ ok: false, error: "NO_TARGET_ORG" });
  });
});

describe("assign-driver handler wiring", () => {
  const src = readFileSync("supabase/functions/assign-driver/index.ts", "utf8");
  it("decides before writing and reads is_protected", () => {
    expect(src).toContain("is_protected");
    expect(src.indexOf("decideAssignDriver(caller")).toBeLessThan(src.indexOf(".upsert("));
  });
});
