import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppUser } from "@/context/AuthContext";

// Mock the auth context so we can drive RootEntry through each state.
const useAuthMock = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

// Stub the heavy authenticated surfaces so the test stays a unit test.
vi.mock("@/App", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected">{children}</div>
  ),
}));
vi.mock("@/pages/Dashboard", () => ({
  Dashboard: () => <div>DASHBOARD</div>,
}));
vi.mock("@/features/marketing/pages/MarketingHome", () => ({
  MarketingHome: () => <div>MARKETING HOME</div>,
}));

import { RootEntry } from "../RootEntry";

function renderRoot() {
  return render(
    <MemoryRouter>
      <RootEntry />
    </MemoryRouter>,
  );
}

const activeUser: AppUser = {
  id: "u1",
  name: "Test",
  email: "test@example.com",
  roles: ["DRIVER"],
  status: "active",
};

describe("RootEntry", () => {
  beforeEach(() => useAuthMock.mockReset());

  it("shows the marketing homepage to unauthenticated visitors", () => {
    useAuthMock.mockReturnValue({ authEnabled: true, authLoading: false, user: null });
    renderRoot();
    expect(screen.getByText("MARKETING HOME")).toBeInTheDocument();
    expect(screen.queryByText("DASHBOARD")).not.toBeInTheDocument();
  });

  it("shows the protected Dashboard to authenticated users", () => {
    useAuthMock.mockReturnValue({ authEnabled: true, authLoading: false, user: activeUser });
    renderRoot();
    expect(screen.getByTestId("protected")).toBeInTheDocument();
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
    expect(screen.queryByText("MARKETING HOME")).not.toBeInTheDocument();
  });

  it("shows a loading state while auth resolves (no marketing/dashboard flash)", () => {
    useAuthMock.mockReturnValue({ authEnabled: true, authLoading: true, user: null });
    renderRoot();
    expect(screen.queryByText("MARKETING HOME")).not.toBeInTheDocument();
    expect(screen.queryByText("DASHBOARD")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });

  it("preserves app behaviour when auth is disabled (dev)", () => {
    useAuthMock.mockReturnValue({ authEnabled: false, authLoading: false, user: null });
    renderRoot();
    expect(screen.getByText("DASHBOARD")).toBeInTheDocument();
    expect(screen.queryByText("MARKETING HOME")).not.toBeInTheDocument();
  });
});
