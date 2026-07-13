/**
 * WORKFLOW-001 regression: `/control/*` is guarded solely by `ControlRoute`
 * (it is NOT nested inside `ProtectedRoute` in App.tsx), so it must enforce
 * the same suspended/pending_activation account-status check that
 * `ProtectedRoute` enforces for every other authenticated route. Before this
 * fix, ControlRoute checked only `isAdmin`/`isSuperAdmin` — a suspended admin
 * was blocked from /admin/* and /jobs/* but retained full Command Center
 * access (dispatch, POD review, finance, driver management, super-admin).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppUser } from "@/context/AuthContext";

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>(
    "@/context/AuthContext",
  );
  return { ...actual, useAuth: () => mockUseAuth() };
});

import { ControlRoute } from "@/features/control/guards/ControlRoute";

function authState(overrides: Partial<ReturnType<typeof baseAuth>>) {
  return { ...baseAuth(), ...overrides };
}
function baseAuth() {
  return {
    authEnabled: true,
    authLoading: false,
    user: null as AppUser | null,
    isAdmin: false,
    isSuperAdmin: false,
  };
}

function adminUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "admin-1",
    name: "Admin",
    email: "admin@example.com",
    roles: ["DRIVER", "ADMIN"],
    status: "active",
    ...overrides,
  };
}

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/control"]}>
      <ControlRoute>
        <div>Command Center Content</div>
      </ControlRoute>
    </MemoryRouter>,
  );
}

describe("ControlRoute account-status enforcement", () => {
  it("blocks a suspended admin from the Control Centre", () => {
    mockUseAuth.mockReturnValue(
      authState({
        user: adminUser({ accountStatus: "suspended" }),
        isAdmin: true,
      }),
    );
    renderGuard();
    expect(screen.queryByText("Command Center Content")).not.toBeInTheDocument();
    expect(screen.getByText("Account Suspended")).toBeInTheDocument();
  });

  it("blocks a pending_activation admin from the Control Centre", () => {
    mockUseAuth.mockReturnValue(
      authState({
        user: adminUser({ accountStatus: "pending_activation" }),
        isAdmin: true,
      }),
    );
    renderGuard();
    expect(screen.queryByText("Command Center Content")).not.toBeInTheDocument();
    expect(screen.getByText("Account Pending")).toBeInTheDocument();
  });

  it("allows an active admin through", () => {
    mockUseAuth.mockReturnValue(
      authState({
        user: adminUser({ accountStatus: "active" }),
        isAdmin: true,
      }),
    );
    renderGuard();
    expect(screen.getByText("Command Center Content")).toBeInTheDocument();
  });

  it("still redirects a non-admin driver regardless of account status", () => {
    mockUseAuth.mockReturnValue(
      authState({
        user: { id: "d1", name: "Driver", email: "d@example.com", roles: ["DRIVER"], status: "active", accountStatus: "active" },
        isAdmin: false,
      }),
    );
    renderGuard();
    expect(screen.queryByText("Command Center Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Account Suspended")).not.toBeInTheDocument();
  });
});
