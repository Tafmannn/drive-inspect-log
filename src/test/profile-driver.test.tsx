// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Terry Tapfumaneyi", email: "t@example.com", roles: ["DRIVER"] },
    isAdmin: false,
    isSuperAdmin: false,
    logout: vi.fn(),
  }),
}));
vi.mock("@/hooks/useDriverGate", () => ({
  useDriverGate: () => ({ isDriverOnly: true, driverProfileId: "d1" }),
}));
vi.mock("@/hooks/useProfilePhoto", () => ({ useOwnProfilePhotoPath: () => ({ data: null }) }));
vi.mock("@/hooks/useJobs", () => ({
  useDashboardCounts: () => ({
    data: { myJobs: 2, completedLast14Days: 5, pendingUploads: 1 },
    isLoading: false,
  }),
}));
vi.mock("@/lib/orgHelper", () => ({ getOrgId: () => Promise.resolve("org1") }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ gte: () => ({}) }) }) }) },
}));
// Heavy children not under test.
vi.mock("@/features/users/components/ProfilePhotoUpload", () => ({ ProfilePhotoUpload: () => null }));
vi.mock("@/components/DriverReadOnlyProfile", () => ({ DriverReadOnlyProfile: () => null }));
vi.mock("@/components/DriverProfileForm", () => ({ DriverProfileForm: () => null }));

import { Profile } from "@/pages/Profile";

describe("Profile — driver view", () => {
  it("shows the driver's own tappable stats and an Expenses shortcut", () => {
    render(
      <MemoryRouter>
        <Profile />
      </MemoryRouter>,
    );
    // Driver stat pills (KpiPill labels). "Uploads" also appears in the
    // bottom nav, so allow more than one.
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getAllByText("Uploads").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Done 14d")).toBeTruthy();
    // Quick link the driver previously never saw.
    expect(screen.getByText("Expenses")).toBeTruthy();
    // The admin org-total card must NOT show for a driver.
    expect(screen.queryByText("Total Jobs")).toBeNull();
  });
});
