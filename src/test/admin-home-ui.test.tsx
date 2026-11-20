// @vitest-environment jsdom
/**
 * Admin Home (UI refresh) — presentation regression tests.
 * Hooks are mocked; this guards the UI contract only: state-driven banner,
 * preserved destinations, and no invented figures.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const iso = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const job = (id: string, status: string, driver: string | null, h = 2) => ({
  id, external_job_number: `AXN-${id}`, vehicle_reg: "AB12 CDE", status, driver_id: driver ? "d" : null,
  driver_name: driver, resolvedDriverName: driver, pickup_city: "", pickup_postcode: "LS1",
  delivery_city: "", delivery_postcode: "M1", updated_at: iso(h),
});

let queues: Record<string, unknown[]>;
let kpis: Record<string, number>;
let buckets: Record<string, number>;
let exceptions: unknown[];

vi.mock("@/hooks/useAdminJobQueues", () => ({
  useAdminJobQueues: () => ({ data: queues, isLoading: false }),
  useAdminJobQueueKpis: () => ({ data: kpis, isLoading: false }),
}));
vi.mock("@/hooks/useAdminDashboardData", () => ({
  useAdminMissingEvidence: () => ({ data: 0, isLoading: false }),
  useAdminComplianceCounts: () => ({ data: { pendingReview: 0, missingDocs: 0, expiredLicences: 0 }, isLoading: false }),
}));
vi.mock("@/hooks/useAdminOperationsBuckets", () => ({
  useAdminOperationsBuckets: () => ({ data: buckets, isLoading: false }),
}));
vi.mock("@/features/attention/hooks/useAttentionData", () => ({
  useAttentionData: () => ({ data: { exceptions }, isLoading: false }),
}));
vi.mock("@/hooks/useRefetchOnFocus", () => ({ useRefetchOnFocus: () => {} }));
vi.mock("@/hooks/useEvidenceAckRealtime", () => ({ useEvidenceAckRealtime: () => {} }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ isAdmin: true, isSuperAdmin: false, user: { name: "Amy" } }) }));
vi.mock("@/features/control/components/AssignDriverModal", () => ({
  AssignDriverModal: ({ jobId }: { jobId: string }) => <div role="dialog">ASSIGN:{jobId}</div>,
}));

import { AdminDashboardBody } from "@/pages/AdminDashboard";

function Landed() {
  const l = useLocation();
  return <p data-testid="landed">{l.pathname + l.search}</p>;
}

function renderBody() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<AdminDashboardBody />} />
        <Route path="*" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
  );
}

const zero = {
  todays_active: 0, needs_driver_action: 0, needs_admin_review: 0, blocked_evidence: 0, ready_to_close: 0,
  ready_to_invoice: 0, completed_not_invoiced: 0, failed_uploads: 0, cancelled_archived: 0,
};
const emptyQueues = { needsAttention: [], unassigned: [], inProgress: [], review: [], completed: [], missingEvidence: [] };

describe("Admin Home UI", () => {
  beforeEach(() => {
    queues = emptyQueues;
    kpis = { active: 0, podReview: 0, unassigned: 0, stale: 0 };
    buckets = zero;
    exceptions = [];
  });

  it("shows the all-clear state when nothing needs action", () => {
    renderBody();
    expect(screen.getByText("All clear")).toBeTruthy();
    expect(screen.queryByText("Needs your attention")).toBeNull();
  });

  it("summarises the Needs Action queue in the banner when items exist", () => {
    const u = job("u1", "ready_for_pickup", null);
    queues = { ...emptyQueues, unassigned: [u], needsAttention: [u], review: [job("r1", "pod_ready", "Pat"), job("r2", "pod_ready", "Sam")] };
    renderBody();
    expect(screen.getByText("Needs your attention")).toBeTruthy();
    expect(screen.getByText("1 unassigned job and 2 PODs to review.")).toBeTruthy();
  });

  it("falls back to the not-invoiced banner and keeps its destination", () => {
    buckets = { ...zero, completed_not_invoiced: 68 };
    renderBody();
    expect(screen.getByText("68 completed jobs are not yet invoiced.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Review jobs/ }));
    expect(screen.getByTestId("landed").textContent).toBe("/control/invoice-prep");
  });

  it("keeps the intervention destinations", () => {
    kpis = { active: 5, podReview: 2, unassigned: 1, stale: 3 };
    renderBody();
    fireEvent.click(screen.getByRole("button", { name: /^Needs review: 2$/ }));
    expect(screen.getByTestId("landed").textContent).toBe("/control/pod-review");
  });

  it("opens the existing assign modal from the Needs Action queue", () => {
    const u = job("u9", "ready_for_pickup", null);
    queues = { ...emptyQueues, unassigned: [u], needsAttention: [u] };
    renderBody();
    fireEvent.click(screen.getAllByRole("button", { name: /Assign/ })[0]);
    expect(screen.getByRole("dialog").textContent).toBe("ASSIGN:u9");
  });

  it("never shows money figures it has no source for", () => {
    kpis = { active: 5, podReview: 2, unassigned: 1, stale: 3 };
    buckets = { ...zero, completed_not_invoiced: 68, ready_to_invoice: 3 };
    const { container } = renderBody();
    expect(container.textContent).not.toMatch(/£|\+\d+%/);
  });
});
