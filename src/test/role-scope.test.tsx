/**
 * RoleScope — defense-in-depth role gate. Tests verify the permission
 * matrix; the real authority is RLS, but this prevents accidental UI leaks.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleScope } from "@/components/ui-kit/RoleScope";

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/context/AuthContext";
const mockedUseAuth = vi.mocked(useAuth);

function setRole(role: "driver" | "admin" | "super_admin") {
  mockedUseAuth.mockReturnValue({
    isAdmin: role === "admin",
    isSuperAdmin: role === "super_admin",
    user: { id: "u1" },
  } as unknown as ReturnType<typeof useAuth>);
}

describe("RoleScope", () => {
  it("hides admin content from drivers", () => {
    setRole("driver");
    render(<RoleScope admin><div>secret</div></RoleScope>);
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("shows admin content to admins", () => {
    setRole("admin");
    render(<RoleScope admin><div>secret</div></RoleScope>);
    expect(screen.getByText("secret")).toBeTruthy();
  });

  it("shows admin content to super_admins", () => {
    setRole("super_admin");
    render(<RoleScope admin><div>secret</div></RoleScope>);
    expect(screen.getByText("secret")).toBeTruthy();
  });

  it("hides super_admin-only content from regular admins", () => {
    setRole("admin");
    render(<RoleScope superAdminOnly><div>danger</div></RoleScope>);
    expect(screen.queryByText("danger")).toBeNull();
  });

  it("renders fallback when denied", () => {
    setRole("driver");
    render(
      <RoleScope admin fallback={<div>nope</div>}>
        <div>secret</div>
      </RoleScope>,
    );
    expect(screen.getByText("nope")).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("respects explicit allow override", () => {
    setRole("driver");
    render(<RoleScope allow={true}><div>open</div></RoleScope>);
    expect(screen.getByText("open")).toBeTruthy();
  });
});
