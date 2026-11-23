// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useProfilePhoto", () => ({ useProfilePhotoUrl: () => null }));
vi.mock("@/hooks/use-toast", () => ({ toast: () => {} }));

import { ProfilePhotoUpload } from "@/features/users/components/ProfilePhotoUpload";

const wrap = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
afterEach(() => cleanup());

describe("ProfilePhotoUpload hero layout (My Profile)", () => {
  it("offers 'Add photo' on the avatar when there is no photo, with no remove action", () => {
    wrap(<ProfilePhotoUpload layout="hero" userId="u" orgId="o" currentPath={null} displayName="Terry Smith" />);
    expect(screen.getByRole("button", { name: "Add photo" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove photo" })).toBeNull();
    expect(screen.getByText("TS")).toBeTruthy();
  });

  it("offers change and remove once a photo exists", () => {
    wrap(<ProfilePhotoUpload layout="hero" userId="u" orgId="o" currentPath="o/u/1.jpg" displayName="Terry" />);
    expect(screen.getByRole("button", { name: "Change photo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeTruthy();
  });

  it("keeps the compact Replace / Remove layout for admin screens", () => {
    wrap(<ProfilePhotoUpload userId="u" orgId="o" currentPath="o/u/1.jpg" displayName="Terry" />);
    expect(screen.getByRole("button", { name: /Replace/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Remove/ })).toBeTruthy();
  });
});
