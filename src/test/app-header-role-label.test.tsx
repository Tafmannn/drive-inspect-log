/**
 * UI-003: AppHeader's brand banner hardcoded "Driver App" regardless of who
 * was viewing it — including on every Admin and Super Admin page (they all
 * reuse the same AppHeader). The label now reflects the caller's actual
 * role.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mockUseAuth() }));
vi.mock("@/components/Breadcrumbs", () => ({ Breadcrumbs: () => null }));

import { AppHeader } from "@/components/AppHeader";

function renderHeader() {
  return render(
    <MemoryRouter>
      <AppHeader title="Test" />
    </MemoryRouter>,
  );
}

describe("AppHeader role label (UI-003)", () => {
  it('shows "Driver App" for a plain driver', () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, isSuperAdmin: false });
    renderHeader();
    expect(screen.getByText("Driver App")).toBeInTheDocument();
  });

  it('shows "Admin" for an admin, not "Driver App"', () => {
    mockUseAuth.mockReturnValue({ isAdmin: true, isSuperAdmin: false });
    renderHeader();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Driver App")).not.toBeInTheDocument();
  });

  it('shows "Super Admin" for a super admin, not "Driver App"', () => {
    mockUseAuth.mockReturnValue({ isAdmin: true, isSuperAdmin: true });
    renderHeader();
    expect(screen.getByText("Super Admin")).toBeInTheDocument();
    expect(screen.queryByText("Driver App")).not.toBeInTheDocument();
  });
});
