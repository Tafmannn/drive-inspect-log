import { describe, it, expect } from "vitest";
// Pure authorization derivation shared by ALL privileged edge functions
// (assign-driver, get-org-users, gcs-upload, user-lifecycle, gcs-proxy,
// resolve-signature-url, gcs-fix-acl, vision-ocr) via _shared/auth.ts.
//
// SECURITY PROPERTY UNDER TEST: a caller's role/org are derived SOLELY from the
// server-controlled `user_profiles` row. `callerAuthzFromProfile` takes ONLY the
// profile as input — there is NO parameter for JWT `user_metadata` — so a user
// who self-sets `user_metadata.role`/`org_id` via auth.updateUser() cannot
// influence authorization. These tests lock that contract in place.
import {
  callerAuthzFromProfile,
  rolesArrayFor,
} from "../../supabase/functions/_shared/profileAuthz";

describe("callerAuthzFromProfile — authz comes only from user_profiles", () => {
  it("no profile row → driver, never admin/super-admin", () => {
    for (const p of [null, undefined, {}]) {
      const a = callerAuthzFromProfile(p as never);
      expect(a.role).toBe("driver");
      expect(a.isAdmin).toBe(false);
      expect(a.isSuperAdmin).toBe(false);
      expect(a.orgId).toBeNull();
    }
  });

  it("driver profile → not admin, org from profile only", () => {
    const a = callerAuthzFromProfile({ role: "driver", org_id: "org-A" });
    expect(a.isAdmin).toBe(false);
    expect(a.isSuperAdmin).toBe(false);
    expect(a.orgId).toBe("org-A");
  });

  it("admin profile → admin, not super-admin", () => {
    const a = callerAuthzFromProfile({ role: "admin", org_id: "org-A" });
    expect(a.isAdmin).toBe(true);
    expect(a.isSuperAdmin).toBe(false);
  });

  it("super_admin profile → admin and super-admin", () => {
    const a = callerAuthzFromProfile({ role: "super_admin" });
    expect(a.isAdmin).toBe(true);
    expect(a.isSuperAdmin).toBe(true);
  });

  it("unknown/garbage role → driver (fail closed)", () => {
    const a = callerAuthzFromProfile({ role: "hacker" });
    expect(a.role).toBe("driver");
    expect(a.isAdmin).toBe(false);
  });

  it("suspended status is surfaced for callers to reject", () => {
    const a = callerAuthzFromProfile({ role: "admin", account_status: "suspended" });
    expect(a.accountStatus).toBe("suspended");
  });

  // The security proof: even if an attacker sets user_metadata to claim
  // super_admin, the ONLY thing the edge functions evaluate is the profile.
  // A driver-profile user is a driver regardless of any JWT metadata they forge,
  // because callerAuthzFromProfile has no metadata parameter to be influenced by.
  it("a forged user_metadata role cannot promote a driver-profile user", () => {
    // Simulate: profile says driver; the JWT (not passed here, by design) claims
    // super_admin. Authorization must still be 'driver'.
    const profile = { role: "driver", org_id: "org-A" };
    const a = callerAuthzFromProfile(profile);
    expect(a.role).toBe("driver");
    expect(a.isAdmin).toBe(false);
    expect(a.isSuperAdmin).toBe(false);
    // gcs-fix-acl requires isSuperAdmin → would 403; vision-ocr uses orgId from
    // the profile (org-A), not any forged user_metadata.org_id.
    expect(a.orgId).toBe("org-A");
  });

  it("rolesArrayFor stays consistent with the profile role", () => {
    expect(rolesArrayFor("driver")).toEqual(["DRIVER"]);
    expect(rolesArrayFor("admin")).toEqual(["ADMIN", "DRIVER"]);
    expect(rolesArrayFor("super_admin")).toEqual(["SUPERADMIN", "ADMIN", "DRIVER"]);
  });
});
