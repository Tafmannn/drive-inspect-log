// @vitest-environment jsdom
/**
 * Regression: the Super Admin must get the same user/driver management as an
 * Admin. /super-admin/users used to be a reduced copy (role + active toggle
 * only) while admins got the full editor (driver profile, permissions,
 * archive/restore, invites) — so the owner could change fewer driver settings
 * than an admin.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppRole } from "@/lib/roleModel";

const auth = { roles: ["SUPERADMIN", "ADMIN", "DRIVER"] as AppRole[] };

vi.mock("@/context/AuthContext", async () => {
  const { roleSatisfies } = await import("@/lib/roleModel");
  return {
    useAuth: () => ({
      user: { id: "u1", name: "Owner", email: "o@x.test", roles: auth.roles, status: "active", accountStatus: "active" },
      isAdmin: roleSatisfies(auth.roles, "ADMIN"),
      isSuperAdmin: roleSatisfies(auth.roles, "SUPERADMIN"),
      hasRole: (r: AppRole) => roleSatisfies(auth.roles, r),
      authLoading: false,
      authEnabled: true,
    }),
  };
});

vi.mock("@/features/users/components/UserManagementPanel", () => ({
  UserManagementPanel: ({ renderHeader, wrap }: { renderHeader?: (s: unknown) => React.ReactNode; wrap?: (c: React.ReactNode) => React.ReactNode }) => (
    <div data-testid="shared-user-management">
      {renderHeader?.({ selectedUserId: null, backToList: () => {} })}
      {wrap ? wrap(<span>list</span>) : <span>list</span>}
    </div>
  ),
}));

vi.mock("@/components/AppHeader", () => ({ AppHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => null }));
vi.mock("@/features/control/components/shared/ControlShell", () => ({
  ControlShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ControlHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
  ControlSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

beforeEach(() => {
  auth.roles = ["SUPERADMIN", "ADMIN", "DRIVER"];
});

describe("Admin / Super Admin user management parity", () => {
  it("/super-admin/users renders the shared user management, not a reduced copy", async () => {
    const { SuperAdminUsers } = await import("@/pages/SuperAdminPages");
    render(<MemoryRouter><SuperAdminUsers /></MemoryRouter>);
    expect(screen.getByTestId("shared-user-management")).toBeTruthy();
    // The old reduced page's inline role dropdown / deactivate toggle are gone.
    expect(screen.queryByText("Confirm Role Change")).toBeNull();
  });

  it("/admin/users and /control/admin use the same shared panel", async () => {
    const { AdminUsers } = await import("@/pages/AdminUsers");
    const { ControlAdmin } = await import("@/features/control/pages/ControlAdmin");
    for (const Page of [AdminUsers, ControlAdmin]) {
      const { unmount } = render(<MemoryRouter><Page /></MemoryRouter>);
      expect(screen.getByTestId("shared-user-management")).toBeTruthy();
      unmount();
    }
  });

  it("Control Admin labels the /admin link for what it is and gives the owner Organisations", async () => {
    const { ControlAdmin } = await import("@/features/control/pages/ControlAdmin");
    render(<MemoryRouter><ControlAdmin /></MemoryRouter>);
    expect(screen.queryByText("Organisation Settings")).toBeNull();
    expect(screen.getByText("Admin dashboard")).toBeTruthy();
    expect(screen.getByText("Organisations")).toBeTruthy();
  });
});

describe("Control navigation honours role inheritance", () => {
  it("a SUPERADMIN-only role list still sees ADMIN-gated items", async () => {
    vi.resetModules();
    vi.doMock("@/features/control/config/navigation", () => ({
      CONTROL_NAV: [
        { label: "Ops", requiredRoles: ["ADMIN"], items: [{ label: "Drivers", path: "/d", icon: "Users", requiredRoles: ["ADMIN"] }] },
        { label: "Platform", requiredRoles: ["SUPERADMIN"], items: [{ label: "Owner", path: "/o", icon: "Crown" }] },
      ],
    }));
    const { useControlNavigation } = await import("@/features/control/hooks/useControlNavigation");

    auth.roles = ["SUPERADMIN"];
    const owner = renderHook(() => useControlNavigation()).result.current;
    expect(owner.map((g) => g.label)).toEqual(["Ops", "Platform"]);
    expect(owner[0].items.map((i) => i.label)).toEqual(["Drivers"]);

    auth.roles = ["ADMIN", "DRIVER"];
    const admin = renderHook(() => useControlNavigation()).result.current;
    expect(admin.map((g) => g.label)).toEqual(["Ops"]);

    auth.roles = ["DRIVER"];
    expect(renderHook(() => useControlNavigation()).result.current).toEqual([]);
    vi.doUnmock("@/features/control/config/navigation");
  });
});
