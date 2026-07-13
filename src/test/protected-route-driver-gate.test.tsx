/**
 * WORKFLOW-002 regression: useDriverGate()'s onboarding gate was previously
 * enforced only by Dashboard rendering <DriverGateScreen> at "/" — every
 * other protected route (JobDetail, InspectionFlow, PodReport,
 * PendingUploads, ExpenseForm, ...) never checked it, so a driver whose
 * onboarding was rejected or still pending could reach a job directly (e.g.
 * via browser history) and complete a real inspection. The fix centralises
 * the check inside `ProtectedRoute` itself, which wraps every driver-
 * reachable route.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AppUser } from "@/context/AuthContext";
import type { DriverGateResult } from "@/hooks/useDriverGate";

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>(
    "@/context/AuthContext",
  );
  return { ...actual, useAuth: () => mockUseAuth() };
});

const mockUseDriverGate = vi.fn();
vi.mock("@/hooks/useDriverGate", () => ({
  useDriverGate: () => mockUseDriverGate(),
}));

import { ProtectedRoute } from "@/App";

function driverUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: "driver-1",
    name: "Driver",
    email: "driver@example.com",
    roles: ["DRIVER"],
    status: "active",
    accountStatus: "active",
    ...overrides,
  };
}

function baseAuthState(overrides: Partial<ReturnType<typeof authDefaults>> = {}) {
  return { ...authDefaults(), ...overrides };
}
function authDefaults() {
  return { authEnabled: true, authLoading: false, user: driverUser() };
}

function gateResult(overrides: Partial<DriverGateResult>): DriverGateResult {
  return {
    status: "active",
    driverProfileId: "dp-1",
    onboardingStatus: null,
    isDriverOnly: true,
    ...overrides,
  };
}

function renderRoute(path = "/jobs/some-job-id") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ProtectedRoute>
        <div>Job Detail Content</div>
      </ProtectedRoute>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute driver-onboarding gate", () => {
  it("blocks a rejected driver from reaching a directly-navigated job route", () => {
    mockUseAuth.mockReturnValue(baseAuthState());
    mockUseDriverGate.mockReturnValue(gateResult({ status: "rejected" }));
    renderRoute();
    expect(screen.queryByText("Job Detail Content")).not.toBeInTheDocument();
    expect(screen.getByText("Account Not Active")).toBeInTheDocument();
  });

  it("blocks a still-onboarding driver from reaching a directly-navigated job route", () => {
    mockUseAuth.mockReturnValue(baseAuthState());
    mockUseDriverGate.mockReturnValue(gateResult({ status: "onboarding" }));
    renderRoute();
    expect(screen.queryByText("Job Detail Content")).not.toBeInTheDocument();
    expect(screen.getByText("Awaiting Activation")).toBeInTheDocument();
  });

  it("blocks a no_profile driver from reaching a directly-navigated job route", () => {
    mockUseAuth.mockReturnValue(baseAuthState());
    mockUseDriverGate.mockReturnValue(gateResult({ status: "no_profile", driverProfileId: null }));
    renderRoute();
    expect(screen.queryByText("Job Detail Content")).not.toBeInTheDocument();
    expect(screen.getByText("Account Being Set Up")).toBeInTheDocument();
  });

  it("allows an active driver through", () => {
    mockUseAuth.mockReturnValue(baseAuthState());
    mockUseDriverGate.mockReturnValue(gateResult({ status: "active" }));
    renderRoute();
    expect(screen.getByText("Job Detail Content")).toBeInTheDocument();
  });

  it("never blocks an admin — useDriverGate reports ungated", () => {
    mockUseAuth.mockReturnValue(
      baseAuthState({ user: driverUser({ roles: ["DRIVER", "ADMIN"] }) }),
    );
    mockUseDriverGate.mockReturnValue(
      gateResult({ status: "ungated", isDriverOnly: false, driverProfileId: null }),
    );
    renderRoute();
    expect(screen.getByText("Job Detail Content")).toBeInTheDocument();
  });

  it("shows a loading spinner while the gate query resolves, not the content or gate screen", () => {
    mockUseAuth.mockReturnValue(baseAuthState());
    mockUseDriverGate.mockReturnValue(gateResult({ status: "loading" }));
    renderRoute();
    expect(screen.queryByText("Job Detail Content")).not.toBeInTheDocument();
    expect(screen.queryByText("Account Not Active")).not.toBeInTheDocument();
  });
});
