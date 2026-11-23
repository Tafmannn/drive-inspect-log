import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

let session: unknown = null;
const updateUser = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      updateUser: (...a: unknown[]) => updateUser(...a),
    },
  },
}));
import { Welcome, isPortalInvite } from "@/pages/Welcome";

const user = (app_metadata: Record<string, unknown>) => ({ user: { id: "u", app_metadata } });
function renderWelcome() {
  return render(
    <MemoryRouter initialEntries={["/welcome"]}>
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/portal" element={<div>PORTAL_HOME</div>} />
        <Route path="/" element={<div>APP_HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
async function setPassword() {
  fireEvent.change(await screen.findByLabelText("Choose a password"), { target: { value: "secret123" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "secret123" } });
}

beforeEach(() => { updateUser.mockClear(); vi.useRealTimers(); });

describe("isPortalInvite", () => {
  it("is true only for the server-set client role", () => {
    expect(isPortalInvite(user({ role: "client" }) as never)).toBe(true);
    expect(isPortalInvite(user({ roles: ["CLIENT"] }) as never)).toBe(true);
    expect(isPortalInvite(user({ role: "driver" }) as never)).toBe(false);
    expect(isPortalInvite(user({}) as never)).toBe(false);
    expect(isPortalInvite(null)).toBe(false);
  });
});

describe("Welcome page", () => {
  it("a portal invite gets the customer-portal setup page and lands in the portal", async () => {
    session = user({ role: "client", roles: ["CLIENT"] });
    renderWelcome();
    expect(await screen.findByRole("heading", { name: "Set up your customer portal" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /What you can do in the portal/ })).toBeInTheDocument();
    await setPassword();
    fireEvent.click(screen.getByRole("button", { name: /open my portal/ }));
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: "secret123" }));
    expect(await screen.findByText("Taking you to your portal…")).toBeInTheDocument();
    expect(await screen.findByText("PORTAL_HOME", {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("a staff invite keeps the existing page and goes to the app", async () => {
    session = user({ role: "driver" });
    renderWelcome();
    expect(await screen.findByRole("heading", { name: "Welcome to Axentra" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /portal/ })).toBeNull();
    await setPassword();
    fireEvent.click(screen.getByRole("button", { name: /Create password & continue/ }));
    expect(await screen.findByText("APP_HOME", {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
