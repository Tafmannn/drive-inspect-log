// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const h = vi.hoisted(() => ({ logout: vi.fn(), ctx: undefined as unknown, error: null as unknown }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ logout: h.logout, user: { email: "buyer@example.com" } }) }));
vi.mock("@/features/portal/api", () => ({ usePortalContext: () => ({ data: h.ctx, isLoading: false, error: h.error }) }));

import { PortalLayout } from "@/features/portal/components/PortalLayout";

const ctx = {
  client: { id: "c1", name: "Northgate Motors" },
  operator: { name: "Axentra Vehicles", logo_url: null, primary_colour: null, contact_email: "ops@example.com", contact_phone: null },
};
function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<p>LIST</p>} />
          <Route path="/portal/jobs/:id" element={<p>JOB</p>} />
          <Route path="/portal/invoices" element={<p>INVOICES</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
afterEach(() => { cleanup(); h.error = null; h.logout.mockClear(); });

describe("Customer portal shell", () => {
  it("shows the Axentra brand, the portal label and the two sections", () => {
    h.ctx = ctx;
    renderAt("/portal");
    expect(screen.getByText("AXENTRA")).toBeTruthy();
    expect(screen.getByText("Customer Portal")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Vehicle moves/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Invoices/ }).getAttribute("aria-current")).toBeNull();
  });

  it("keeps Vehicle moves active on a move's own page", () => {
    h.ctx = ctx;
    renderAt("/portal/jobs/j1");
    expect(screen.getByText("JOB")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Vehicle moves/ }).getAttribute("aria-current")).toBe("page");
  });

  it("uses the operator's own logo when it has one", () => {
    h.ctx = { ...ctx, operator: { ...ctx.operator, name: "Other Movers", logo_url: "https://cdn.example.com/logo.png" } };
    renderAt("/portal");
    expect(screen.getByRole("img", { name: "Other Movers" }).getAttribute("src")).toBe("https://cdn.example.com/logo.png");
    expect(screen.queryByText("AXENTRA")).toBeNull();
  });

  it("signs out from the account menu, which names the client and the signed-in email", () => {
    h.ctx = ctx;
    renderAt("/portal");
    fireEvent.keyDown(screen.getByRole("button", { name: "Account" }), { key: "Enter" });
    expect(screen.getAllByText("Northgate Motors").length).toBeGreaterThan(0);
    expect(screen.getAllByText("buyer@example.com").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign out/ }));
    expect(h.logout).toHaveBeenCalled();
  });

  it("shows no portal when the server refuses access", () => {
    h.ctx = undefined;
    h.error = new Error("NO_ACCESS");
    renderAt("/portal");
    expect(screen.getByText("Portal access unavailable")).toBeTruthy();
    expect(screen.queryByText("LIST")).toBeNull();
  });
});
