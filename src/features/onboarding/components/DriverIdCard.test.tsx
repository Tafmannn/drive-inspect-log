import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DriverIdCard, formatEmployment } from "./DriverIdCardV2";
import type { DigitalIdCredential } from "../hooks/useDigitalCredential";

const credential: DigitalIdCredential = {
  driver_id: "AX-000001",
  credential_id: "00000000-0000-0000-0000-000000000001",
  user_id: "00000000-0000-0000-0000-000000000002",
  org_id: "00000000-0000-0000-0000-000000000003",
  full_name: "Wesley Mahoya",
  employment_type: "contractor",
  role_label: "Authorised Driver",
  photo_path: null,
  credential_version: 1,
  status: "active",
  checked_at: "2026-11-23T20:54:00Z",
  valid_until: "2026-11-23T20:54:30Z",
  company_name: "Axentra Vehicle Logistics",
  company_website: "www.axentravehicles.co.uk",
  company_phone: "Company number",
  issued_by: "Axentra Control",
};

describe("DriverIdCard V2", () => {
  it("renders the approved compact company ID and initials fallback", () => {
    render(<DriverIdCard credential={credential} displayStatus="active" photoUrl={null} />);
    expect(screen.getByText("Wesley Mahoya")).toBeInTheDocument();
    expect(screen.getByText("WM")).toBeInTheDocument();
    expect(screen.getByText("AX-000001")).toBeInTheDocument();
    expect(screen.getByText("Authorised / Active")).toBeInTheDocument();
    expect(screen.getByText("www.axentravehicles.co.uk")).toBeInTheDocument();
    expect(screen.getByText("Company number")).toBeInTheDocument();
    expect(screen.getByText("Official Axentra company ID")).toBeInTheDocument();
  });

  it("never includes driving-licence or job data in the customer card", () => {
    render(<DriverIdCard credential={credential} displayStatus="active" photoUrl={null} />);
    expect(screen.queryByText(/licence status|licence number|licence expiry|job reference/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/identity confirmed|independently verified/i)).not.toBeInTheDocument();
  });

  it("shows a warning rather than green authorisation when offline", () => {
    render(<DriverIdCard credential={credential} displayStatus="grace" photoUrl={null} />);
    expect(screen.getByText("Connection lost")).toBeInTheDocument();
    expect(screen.queryByText("Authorised / Active")).not.toBeInTheDocument();
  });

  it("renders an actual photograph when provided", () => {
    render(<DriverIdCard credential={credential} displayStatus="active" photoUrl="https://example.com/portrait.jpg" />);
    expect(screen.getByAltText("Photograph of Wesley Mahoya")).toHaveAttribute("src", "https://example.com/portrait.jpg");
    expect(screen.queryByText("WM")).not.toBeInTheDocument();
  });

  it("formats known employment categories", () => {
    expect(formatEmployment("contractor")).toBe("Contractor");
    expect(formatEmployment("self_employed")).toBe("Self-employed");
    expect(formatEmployment("employed")).toBe("Employee");
  });
});
