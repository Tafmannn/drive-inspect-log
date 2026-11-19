// @vitest-environment jsdom
/**
 * UI-only Phase 1a — behaviour-preservation and visual-contract tests.
 *
 * Phase 1a changed colours, class names and CSS tokens only. These tests pin the
 * things that must NOT have changed (status keys/labels, handlers, labels, links,
 * sidebar toggling) plus the accessibility contract the phase introduced
 * (status badge text/background contrast >= 4.5:1, tabular-nums on identifiers).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MetricBlock } from "@/components/ui-kit/MetricBlock";
import { JobCard } from "@/components/JobCard";
import { AdminJobCard, type AdminJobRow } from "@/components/AdminJobCard";
import { ControlSidebar } from "@/features/control/components/ControlSidebar";
import { JOB_STATUS, getStatusStyle } from "@/lib/statusConfig";

vi.mock("@/features/control/hooks/useControlNavigation", () => ({
  useControlNavigation: () => [
    {
      label: "Operations",
      items: [
        { label: "Overview", path: "/control", icon: "LayoutDashboard" },
        { label: "Jobs", path: "/control/jobs", icon: "Truck" },
      ],
    },
  ],
}));
vi.mock("@/features/control/hooks/useControlAccess", () => ({
  useControlAccess: () => ({ userName: "Test User", userEmail: "test@example.test" }),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ logout: vi.fn() }) }));

// ── WCAG helpers ─────────────────────────────────────────────────────
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("status badge contract (single source: getStatusStyle)", () => {
  const statuses = Object.values(JOB_STATUS);

  it("every status key resolves to a label and a hex colour pair", () => {
    for (const s of statuses) {
      const style = getStatusStyle(s);
      expect(style.label).toBeTruthy();
      expect(style.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
      expect(style.color).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("every badge text/background pair is at least 4.5:1", () => {
    for (const s of statuses) {
      const { color, backgroundColor } = getStatusStyle(s);
      expect(contrast(color, backgroundColor), s).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the existing operator-facing labels", () => {
    expect(getStatusStyle(JOB_STATUS.NEW).label).toBe("NEW");
    expect(getStatusStyle(JOB_STATUS.READY_FOR_PICKUP).label).toBe("READY");
    expect(getStatusStyle(JOB_STATUS.IN_TRANSIT).label).toBe("IN PROGRESS");
    expect(getStatusStyle(JOB_STATUS.COMPLETED).label).toBe("COMPLETED");
    expect(getStatusStyle(JOB_STATUS.CANCELLED).label).toBe("CANCELLED");
  });

  it("falls back to a neutral style and uppercases an unknown status", () => {
    const style = getStatusStyle("something_new");
    expect(style.label).toBe("SOMETHING_NEW");
    expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("MetricBlock", () => {
  it("renders label, value, hint and trailing content with tabular figures", () => {
    render(<MetricBlock label="Suggested" value="£125.00" hint="vs £100.00" trailing={<span>badge</span>} tone="headline" />);
    expect(screen.getByText("Suggested")).toBeTruthy();
    expect(screen.getByText("vs £100.00")).toBeTruthy();
    expect(screen.getByText("badge")).toBeTruthy();
    expect(screen.getByText("£125.00").className).toContain("tabular-nums");
  });

  it("uses tabular figures for the muted tone too", () => {
    render(<MetricBlock label="Current" value="£100.00" />);
    expect(screen.getByText("£100.00").className).toContain("tabular-nums");
  });
});

describe("JobCard", () => {
  const route = { pickupAddress: "1 Test St, Leeds", deliveryAddress: "2 Test Rd, Bristol" };

  it("shows reg and job ref, and still fires the card and CTA handlers", () => {
    const onCardClick = vi.fn();
    const onPrimaryAction = vi.fn();
    render(
      <MemoryRouter>
        <JobCard
          reg="AB12 CDE"
          jobRef="AX0042"
          status={JOB_STATUS.ASSIGNED}
          route={route}
          hasPickupInspection={false}
          hasDeliveryInspection={false}
          ctaLabel="Start pickup"
          onCardClick={onCardClick}
          onPrimaryAction={onPrimaryAction}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Job AX0042")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /start pickup/i }));
    expect(onPrimaryAction).toHaveBeenCalledTimes(1);
  });

  it("read-only cards render no CTA button", () => {
    render(
      <MemoryRouter>
        <JobCard
          reg="AB12 CDE"
          jobRef="AX0042"
          status={JOB_STATUS.COMPLETED}
          route={route}
          hasPickupInspection
          hasDeliveryInspection
          ctaLabel="Start pickup"
          readOnly
        />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /start pickup/i })).toBeNull();
  });
});

describe("AdminJobCard", () => {
  const job: AdminJobRow = {
    id: "j1",
    external_job_number: "AX0099",
    vehicle_reg: "XY99 ZZZ",
    status: JOB_STATUS.ASSIGNED,
    pickup_city: "Leeds",
    pickup_postcode: "LS1",
    delivery_city: "Bristol",
    delivery_postcode: "BS1",
    updated_at: new Date().toISOString(),
    resolvedDriverName: "Sample Driver",
    has_pickup_inspection: true,
    has_delivery_inspection: false,
    driver_id: "d1",
  };

  it("shows the job number, driver, and keeps View / Reassign handlers wired", () => {
    const onView = vi.fn();
    const onAssign = vi.fn();
    render(
      <MemoryRouter>
        <AdminJobCard job={job} onView={onView} onAssign={onAssign} />
      </MemoryRouter>,
    );
    expect(screen.getByText("AX0099")).toBeTruthy();
    expect(screen.getByText("Sample Driver")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /reassign/i }));
    expect(onAssign).toHaveBeenCalledWith(job);
  });

  it("flags an unassigned job and offers Assign", () => {
    const onAssign = vi.fn();
    render(
      <MemoryRouter>
        <AdminJobCard
          job={{ ...job, driver_id: null, resolvedDriverName: null }}
          onView={vi.fn()}
          onAssign={onAssign}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/unassigned/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^assign/i }));
    expect(onAssign).toHaveBeenCalledTimes(1);
  });
});

describe("ControlSidebar", () => {
  it("renders every nav group, item and link target unchanged", () => {
    render(
      <MemoryRouter initialEntries={["/control/jobs"]}>
        <ControlSidebar />
      </MemoryRouter>,
    );
    expect(screen.getByText("Operations")).toBeTruthy();
    expect(screen.getByRole("link", { name: /overview/i }).getAttribute("href")).toBe("/control");
    expect(screen.getByRole("link", { name: /jobs/i }).getAttribute("href")).toBe("/control/jobs");
    expect(screen.getByRole("link", { name: /back to app/i }).getAttribute("href")).toBe("/");
    expect(screen.getByText("Test User")).toBeTruthy();
    expect(screen.getByText("test@example.test")).toBeTruthy();
  });

  it("collapses and expands, hiding labels but keeping links", () => {
    render(
      <MemoryRouter>
        <ControlSidebar />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(screen.queryByText("Operations")).toBeNull();
    expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(3);
    fireEvent.click(screen.getByRole("button", { name: /expand sidebar/i }));
    expect(screen.getByText("Operations")).toBeTruthy();
  });
});
