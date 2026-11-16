import { describe, it, expect } from "vitest";
import {
  ADMIN_CAPABILITIES,
  OWNER_CAPABILITIES,
  capabilitiesFor,
  roleSatisfies,
  rolesForProfileRole,
  type AppRole,
} from "@/lib/roleModel";
import { callerAuthzFromProfile, rolesArrayFor } from "../../supabase/functions/_shared/profileAuthz";

const STAFF_DB_ROLES = ["driver", "admin", "super_admin"] as const;

describe("role model — Super Admin inherits every Admin capability", () => {
  it("Admin capabilities ⊆ Super Admin capabilities", () => {
    const admin = capabilitiesFor(rolesForProfileRole("admin"));
    const superAdmin = capabilitiesFor(rolesForProfileRole("super_admin"));
    for (const cap of admin) expect(superAdmin.has(cap)).toBe(true);
    expect(superAdmin.size).toBeGreaterThan(admin.size);
  });

  it("owner-only capabilities stay with the Super Admin", () => {
    const admin = capabilitiesFor(rolesForProfileRole("admin"));
    for (const cap of OWNER_CAPABILITIES) expect(admin.has(cap)).toBe(false);
    const superAdmin = capabilitiesFor(rolesForProfileRole("super_admin"));
    for (const cap of OWNER_CAPABILITIES) expect(superAdmin.has(cap)).toBe(true);
  });

  it("drivers, portal clients and unknown roles get no admin capability", () => {
    for (const r of ["driver", "client", "", null, "ADMIN", "superadmin"]) {
      expect(capabilitiesFor(rolesForProfileRole(r)).size).toBe(0);
    }
  });

  it("capability tiers don't overlap", () => {
    const admin = new Set<string>(ADMIN_CAPABILITIES);
    for (const cap of OWNER_CAPABILITIES) expect(admin.has(cap)).toBe(false);
  });
});

describe("roleSatisfies — hierarchy SUPERADMIN ⊇ ADMIN ⊇ DRIVER, CLIENT isolated", () => {
  const cases: [AppRole[], AppRole, boolean][] = [
    [["SUPERADMIN"], "ADMIN", true],
    [["SUPERADMIN"], "DRIVER", true],
    [["SUPERADMIN"], "SUPERADMIN", true],
    [["SUPERADMIN"], "CLIENT", false],
    [["ADMIN"], "DRIVER", true],
    [["ADMIN"], "SUPERADMIN", false],
    [["DRIVER"], "ADMIN", false],
    [["CLIENT"], "DRIVER", false],
    [["CLIENT"], "ADMIN", false],
    [["CLIENT"], "CLIENT", true],
    // A portal login can never be combined with staff roles to gain access.
    [["CLIENT", "SUPERADMIN"], "ADMIN", false],
  ];
  it.each(cases)("%j satisfies %s → %s", (held, required, expected) => {
    expect(roleSatisfies(held, required)).toBe(expected);
  });

  it("an expanded super admin's role list contains ADMIN (so includes('ADMIN') checks pass)", () => {
    expect(rolesForProfileRole("super_admin")).toContain("ADMIN");
  });
});

describe("client and server expand roles identically", () => {
  it.each(STAFF_DB_ROLES)("%s", (dbRole) => {
    expect(rolesForProfileRole(dbRole)).toEqual(rolesArrayFor(dbRole));
  });

  it("server authz flags agree with the client hierarchy", () => {
    for (const dbRole of STAFF_DB_ROLES) {
      const server = callerAuthzFromProfile({ role: dbRole });
      const roles = rolesForProfileRole(dbRole);
      expect(server.isAdmin).toBe(roleSatisfies(roles, "ADMIN"));
      expect(server.isSuperAdmin).toBe(roleSatisfies(roles, "SUPERADMIN"));
    }
  });
});
