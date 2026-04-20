import { describe, it, expect } from "vitest";
import {
  hasRoleCheck,
  isAdminDriverCheck,
  type AppUser,
} from "@/context/AuthContext";

function makeUser(roles: AppUser["roles"]): AppUser {
  return {
    id: "u1",
    name: "Test",
    email: "test@example.com",
    roles,
    status: "active",
  };
}

describe("AuthContext role derivation", () => {
  describe("hasRoleCheck", () => {
    it("grants DRIVER when user has DRIVER role", () => {
      expect(hasRoleCheck(makeUser(["DRIVER"]), "DRIVER")).toBe(true);
    });

    it("denies ADMIN when user only has DRIVER", () => {
      expect(hasRoleCheck(makeUser(["DRIVER"]), "ADMIN")).toBe(false);
    });

    it("grants any role to SUPERADMIN (implicit elevation)", () => {
      const su = makeUser(["SUPERADMIN"]);
      expect(hasRoleCheck(su, "DRIVER")).toBe(true);
      expect(hasRoleCheck(su, "ADMIN")).toBe(true);
      expect(hasRoleCheck(su, "SUPERADMIN")).toBe(true);
    });

    it("grants ADMIN when user has both DRIVER and ADMIN", () => {
      expect(hasRoleCheck(makeUser(["DRIVER", "ADMIN"]), "ADMIN")).toBe(true);
    });

    it("denies SUPERADMIN to plain ADMIN — privilege boundary", () => {
      expect(hasRoleCheck(makeUser(["ADMIN"]), "SUPERADMIN")).toBe(false);
    });
  });

  describe("isAdminDriverCheck", () => {
    it("returns true only when user has BOTH DRIVER and ADMIN", () => {
      expect(isAdminDriverCheck(makeUser(["DRIVER", "ADMIN"]))).toBe(true);
    });

    it("returns false for ADMIN only", () => {
      expect(isAdminDriverCheck(makeUser(["ADMIN"]))).toBe(false);
    });

    it("returns false for DRIVER only", () => {
      expect(isAdminDriverCheck(makeUser(["DRIVER"]))).toBe(false);
    });

    it("returns false for SUPERADMIN alone — even though hasRoleCheck would pass", () => {
      // Important: admin-driver dual-mode UI should NOT light up for plain SUPERADMIN
      expect(isAdminDriverCheck(makeUser(["SUPERADMIN"]))).toBe(false);
    });
  });
});
