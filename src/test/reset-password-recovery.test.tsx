// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// supabase-js auto-consumes the recovery hash and can strip it before the
// component mounts. These mocks stand in for that behaviour so we can assert
// ResetPassword detects the session via getSession() rather than the hash.
// vi.hoisted so the mock factory (hoisted above imports) can see them.
const { getSession, onAuthStateChange } = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => getSession(), onAuthStateChange, updateUser: vi.fn() } },
}));

import { ResetPassword } from "@/pages/ResetPassword";

function renderReset() {
  return render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>,
  );
}

describe("ResetPassword recovery detection", () => {
  beforeEach(() => {
    window.location.hash = "";
    getSession.mockReset();
    onAuthStateChange.mockClear();
  });
  afterEach(() => { window.location.hash = ""; });

  it("shows the set-password form when a recovery session is already established", async () => {
    // detectSessionInUrl already consumed the hash and created the session.
    getSession.mockResolvedValue({ data: { session: { access_token: "x" } } });
    renderReset();
    expect(await screen.findByLabelText(/new password/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /update password/i })).toBeTruthy();
  });

  it("shows an expired-link message (not the form) when the link errored", async () => {
    window.location.hash = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";
    getSession.mockResolvedValue({ data: { session: null } });
    renderReset();
    expect(await screen.findByText(/invalid or has expired/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /request a new reset link/i })).toBeTruthy();
    expect(screen.queryByLabelText(/new password/i)).toBeNull();
  });

  it("falls back to the request-new-link screen when no session resolves", async () => {
    vi.useFakeTimers();
    getSession.mockResolvedValue({ data: { session: null } });
    renderReset();
    await vi.advanceTimersByTimeAsync(2600);
    vi.useRealTimers();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /request a new reset link/i })).toBeTruthy(),
    );
  });
});
