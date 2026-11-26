import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { BrandHeader } from "@/components/BrandHeader";
import { AppHeader } from "@/components/AppHeader";
import { HomeHeader } from "@/features/admin-home/HomeHeader";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { name: "Example Driver" }, isAdmin: true, isSuperAdmin: false }),
}));
vi.mock("@/components/Breadcrumbs", () => ({ Breadcrumbs: () => null }));

function Location() { return <output>{useLocation().pathname}</output>; }

describe("Shared dashboard brand header", () => {
  it.each([BrandHeader, HomeHeader, AppHeader])("shows the original lockup, role and profile shortcut", (Header) => {
    render(<MemoryRouter initialEntries={["/jobs"]}><Header /><Location /></MemoryRouter>);
    expect(screen.getByText("AXENTRA")).toBeInTheDocument();
    expect(screen.getByText("Vehicle Logistics")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("E")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /profile/i }));
    expect(screen.getByText("/profile")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /go to dashboard/i }));
    expect(screen.getByText("/")).toBeInTheDocument();
  });
  it("preserves the page title, subtitle, back callback and action slot", () => {
    const onBack = vi.fn();
    render(<MemoryRouter><AppHeader title="Job details" subtitle="AX0079" showBack onBack={onBack}><button>Save</button></AppHeader></MemoryRouter>);
    expect(screen.getByText("Job details")).toBeInTheDocument();
    expect(screen.getByText("AX0079")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
