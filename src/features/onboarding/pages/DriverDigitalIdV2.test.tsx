import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DriverDigitalIdV2 from "./DriverDigitalIdV2";
import type { DigitalIdCredential } from "../hooks/useDigitalCredential";

const mocks = vi.hoisted(() => ({
  routeUserId: undefined as string | undefined,
  currentUserId: "self-driver",
  isAdmin: false,
  status: "loading",
  credential: null as DigitalIdCredential | null,
  error: null as string | null,
  refresh: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
  useParams: () => ({ userId: mocks.routeUserId }),
}));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => <div>Header</div> }));
vi.mock("@/components/BottomNav", () => ({ BottomNav: () => <div>Navigation</div> }));
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: mocks.currentUserId }, isAdmin: mocks.isAdmin }),
}));
vi.mock("../hooks/useDigitalCredential", () => ({
  useDigitalCredential: () => ({
    credential: mocks.credential,
    status: mocks.status,
    error: mocks.error,
    refresh: mocks.refresh,
  }),
}));
vi.mock("../hooks/useDigitalIdPhotoUrl", () => ({ useDigitalIdPhotoUrl: () => null }));
vi.mock("../components/DigitalIdAdminTools", () => ({
  DigitalIdAdminTools: () => <div data-testid="admin-photo-tools">ID administration</div>,
}));

const credential: DigitalIdCredential = {
  driver_id: "AX-000099",
  credential_id: "11111111-1111-4111-8111-111111111111",
  user_id: "self-driver",
  org_id: "33333333-3333-4333-8333-333333333333",
  full_name: "Sample Driver",
  employment_type: "contractor",
  role_label: "Authorised Driver",
  photo_path: null,
  credential_version: 1,
  status: "active",
  checked_at: "2026-11-24T10:00:00Z",
  valid_until: "2026-11-24T10:00:30Z",
  company_name: "Axentra Vehicle Logistics",
  company_website: "www.axentravehicles.co.uk",
  company_phone: null,
  issued_by: "Axentra Control",
};

describe("Digital ID V2 page access and user messaging", () => {
  beforeEach(() => {
    mocks.routeUserId = undefined;
    mocks.currentUserId = "self-driver";
    mocks.isAdmin = false;
    mocks.status = "loading";
    mocks.credential = null;
    mocks.error = null;
    mocks.refresh.mockReset();
    mocks.navigate.mockReset();
  });

  it("shows a checking state while waiting for server authorisation", () => {
    render(<DriverDigitalIdV2 />);
    expect(screen.getByText(/Checking your company ID/)).toBeInTheDocument();
    expect(screen.queryByText("Authorised / Active")).not.toBeInTheDocument();
  });

  it("shows missing credential and offers a retry, not an invented ID", () => {
    mocks.status = "missing";
    render(<DriverDigitalIdV2 />);
    expect(screen.getByText("No Digital ID issued yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not display an active card when the server cannot be reached", () => {
    mocks.status = "unavailable";
    render(<DriverDigitalIdV2 />);
    expect(screen.getByText("Unable to confirm authorisation")).toBeInTheDocument();
    expect(screen.queryByText("Authorised / Active")).not.toBeInTheDocument();
  });

  it("hides revoked credentials from the driver", () => {
    mocks.status = "revoked";
    mocks.credential = { ...credential, status: "revoked" };
    render(<DriverDigitalIdV2 />);
    expect(screen.getByText("Company ID unavailable")).toBeInTheDocument();
    expect(screen.queryByText("AX-000099")).not.toBeInTheDocument();
  });

  it("shows a clearly labelled historical revoked card to admins only", () => {
    mocks.routeUserId = "self-driver";
    mocks.isAdmin = true;
    mocks.status = "revoked";
    mocks.credential = { ...credential, status: "revoked" };
    render(<DriverDigitalIdV2 />);
    expect(screen.getByText("Historical admin view. This credential is not valid.")).toBeInTheDocument();
    expect(screen.getByText("AX-000099")).toBeInTheDocument();
    expect(screen.getByTestId("admin-photo-tools")).toBeInTheDocument();
    expect(screen.queryByText("Authorised / Active")).not.toBeInTheDocument();
  });

  it("shows a disconnected warning rather than confirming a live status", () => {
    mocks.status = "grace";
    mocks.credential = credential;
    render(<DriverDigitalIdV2 />);
    expect(screen.getAllByText(/Connection lost/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Authorised / Active")).not.toBeInTheDocument();
  });

  it("keeps administrative tools hidden on a driver's own active card", () => {
    mocks.status = "active";
    mocks.credential = credential;
    render(<DriverDigitalIdV2 />);
    expect(screen.getByText("Authorised / Active")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-photo-tools")).not.toBeInTheDocument();
  });

  it("warns admins to configure a missing customer-facing phone number", () => {
    mocks.routeUserId = "self-driver";
    mocks.isAdmin = true;
    mocks.status = "active";
    mocks.credential = credential;
    render(<DriverDigitalIdV2 />);
    expect(screen.getByTestId("admin-photo-tools")).toBeInTheDocument();
    expect(screen.getByText(/Company contact number is not yet configured/)).toBeInTheDocument();
  });

  it("does not let a non-admin visitor see administrative actions", () => {
    mocks.routeUserId = "self-driver";
    mocks.status = "active";
    mocks.credential = credential;
    render(<DriverDigitalIdV2 />);
    expect(screen.queryByTestId("admin-photo-tools")).not.toBeInTheDocument();
  });
});
