import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { preferredName } from "@/lib/preferredName";
import { adminGreeting } from "@/features/admin-home/greeting";

describe("preferredName", () => {
  it("prefers the profile's preferred name, then first name, then full name", () => {
    expect(preferredName({ display_name: "Terrence", first_name: "T", full_name: "Terrence T" }, "info")).toBe("Terrence");
    expect(preferredName({ display_name: " ", first_name: "Terrence", full_name: "X" }, "info")).toBe("Terrence");
    expect(preferredName({ display_name: null, first_name: null, full_name: "Terrence Tapfumaneyi" }, "info")).toBe("Terrence Tapfumaneyi");
  });

  it("falls back to the sign-in name / email handle only when the profile has no name", () => {
    expect(preferredName({ display_name: null, first_name: "", full_name: null }, "info")).toBe("info");
    expect(preferredName(null, "info")).toBe("info");
  });

  it("greets by the preferred first name, not the email handle", () => {
    expect(adminGreeting(preferredName({ full_name: "Terrence Tapfumaneyi" }, "info"), 9)).toBe("Good morning, Terrence");
  });

  it("AuthContext loads the profile names in the same query as the role", () => {
    const src = readFileSync(resolve(process.cwd(), "src/context/AuthContext.tsx"), "utf8");
    expect(src).toContain('.select("account_status, role, display_name, first_name, full_name")');
    expect(src).toContain("user.name = preferredName(data, user.name)");
  });
});
