import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>("@/context/AuthContext");
  return { ...actual, useAuth: () => ({ isAdmin: true, isSuperAdmin: false, user: { id: "u1", roles: ["ADMIN"] } }) };
});
vi.mock("@/features/users/components/UserManagementPanel", () => ({ UserManagementPanel: () => <div>PANEL</div> }));
import { AdminUsers } from "@/pages/AdminUsers";

describe("/admin/users page chrome", () => {
  it("has a titled header, a back button to Control > Admin, and the bottom bar", () => {
    render(
      <MemoryRouter initialEntries={["/admin/users"]}>
        <Routes>
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/control/admin" element={<div>CONTROL_ADMIN</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "User Management" })).toBeInTheDocument();
    expect(screen.getByText("PANEL")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByText("CONTROL_ADMIN")).toBeInTheDocument();
  });
});
