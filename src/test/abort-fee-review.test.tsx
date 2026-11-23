/** Regression: an approved Abort must never expose ordinary fee-review controls. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AbortFeeReview } from "@/features/abort/components/AbortFeeReview";
import type { JobAbort } from "@/features/abort/api/abortApi";

const state = vi.hoisted(() => ({
  superAdmin: false,
  review: vi.fn(),
  amend: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ isSuperAdmin: state.superAdmin }),
}));
vi.mock("@/features/abort/hooks/useAbort", () => ({
  useReviewAbortClaim: () => ({ isPending: false, mutateAsync: state.review }),
  useAmendApprovedAbortClaim: () => ({ isPending: false, mutateAsync: state.amend }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const base: JobAbort = {
  id: "abort-1",
  org_id: "org-1",
  job_id: "job-1",
  run_id: "run-1",
  from_status: "assigned",
  driver_id: "driver-1",
  contact_name: "Lewis",
  no_name_exception: false,
  confirmed_by: "admin-1",
  confirmed_at: "2026-11-23T18:44:00Z",
  agreed_price: 240,
  proposed_amount: 240,
  approved_amount: 240,
  client_fee_confirmed_at: null,
  client_fee_confirmed_by: null,
  client_fee_confirmed_amount: null,
  finance_status: "approved",
  reviewed_by: "admin-1",
  reviewed_at: "2026-11-23T20:10:00Z",
  review_note: null,
  last_amended_at: null,
  last_amended_by: null,
  last_amendment_reason: null,
  customer_notified_at: null,
  reopened_at: null,
};

beforeEach(() => {
  state.superAdmin = false;
  state.review.mockReset();
  state.amend.mockReset();
});

describe("Abort fee-review lock", () => {
  it("shows approved fee as locked without an editable amount or Approve/Reject actions", () => {
    render(<AbortFeeReview jobId="job-1" abort={base} invoiced={false} paid={false} />);
    expect(screen.getByText("Approved fee locked")).toBeTruthy();
    expect(screen.getByText(/£240.00 has been approved/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject fee" })).toBeNull();
    expect(screen.queryByLabelText("Amount to approve")).toBeNull();
    expect(screen.queryByText("Exceptional fee amendment")).toBeNull();
  });

  it("removes fee-review controls immediately when a pending decision becomes approved", () => {
    const pending: JobAbort = { ...base, finance_status: "pending_review", approved_amount: null };
    const view = render(<AbortFeeReview jobId="job-1" abort={pending} invoiced={false} paid={false} />);
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject fee" })).toBeTruthy();

    view.rerender(<AbortFeeReview jobId="job-1" abort={base} invoiced={false} paid={false} />);
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText("Approved fee locked")).toBeTruthy();
  });

  it("locks rejected decisions too", () => {
    const rejected: JobAbort = { ...base, finance_status: "rejected", approved_amount: null };
    render(<AbortFeeReview jobId="job-1" abort={rejected} invoiced={false} paid={false} />);
    expect(screen.getByText("Fee review closed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject fee" })).toBeNull();
  });

  it("submits the proposed fee once from the pending review form", async () => {
    state.review.mockResolvedValue({ financeStatus: "approved", approvedAmount: 240 });
    const pending: JobAbort = { ...base, finance_status: "pending_review", approved_amount: null };
    render(<AbortFeeReview jobId="job-1" abort={pending} invoiced={false} paid={false} />);

    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText("I confirm the client agreed to this Abort fee"));
    expect(approve.hasAttribute("disabled")).toBe(false);
    fireEvent.click(approve);
    await waitFor(() => {
      expect(state.review).toHaveBeenCalledTimes(1);
      expect(state.review).toHaveBeenCalledWith({
        abortId: "abort-1", decision: "approved", amount: 240, note: null, clientConfirmed: true,
      });
    });
  });

  it("approves a client-confirmed fee higher than the original job price without changing pricing", async () => {
    state.review.mockResolvedValue({ financeStatus: "approved", approvedAmount: 275 });
    const pending: JobAbort = { ...base, finance_status: "pending_review", approved_amount: null };
    render(<AbortFeeReview jobId="job-1" abort={pending} invoiced={false} paid={false} />);

    fireEvent.change(screen.getByLabelText("Amount to approve"), { target: { value: "275.00" } });
    expect(screen.getByText(/Above the original agreed price of £240.00/)).toBeTruthy();
    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText("I confirm the client agreed to this Abort fee"));
    fireEvent.click(approve);
    await waitFor(() => expect(state.review).toHaveBeenCalledWith({
      abortId: "abort-1", decision: "approved", amount: 275, note: null, clientConfirmed: true,
    }));
    expect(pending.agreed_price).toBe(240);
  });

  it("can reject a pending claim without an approved amount", async () => {
    state.review.mockResolvedValue({ financeStatus: "rejected", approvedAmount: null });
    const pending: JobAbort = { ...base, finance_status: "pending_review", approved_amount: null };
    render(<AbortFeeReview jobId="job-1" abort={pending} invoiced={false} paid={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Reject fee" }));
    await waitFor(() => {
      expect(state.review).toHaveBeenCalledWith({
        abortId: "abort-1", decision: "rejected", amount: null, note: null, clientConfirmed: false,
      });
    });
  });

  it("restricts the exceptional amendment control to a Super Admin before invoicing", () => {
    state.superAdmin = true;
    const view = render(<AbortFeeReview jobId="job-1" abort={base} invoiced={false} paid={false} />);
    expect(screen.getByRole("button", { name: "Exceptional fee amendment" })).toBeTruthy();

    view.rerender(<AbortFeeReview jobId="job-1" abort={base} invoiced={true} paid={false} />);
    expect(screen.queryByRole("button", { name: "Exceptional fee amendment" })).toBeNull();
    expect(screen.getByText(/invoice\/credit-note process/)).toBeTruthy();
  });
  it("requires a reason and the previous amount for a Super Admin correction", async () => {
    state.superAdmin = true;
    state.amend.mockResolvedValue({ financeStatus: "approved", approvedAmount: 210, amendedAt: "2026-11-23T21:00:00Z" });
    render(<AbortFeeReview jobId="job-1" abort={base} invoiced={false} paid={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Exceptional fee amendment" }));
    const confirm = screen.getByRole("button", { name: "Confirm exceptional amendment" });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Corrected Abort fee amount"), { target: { value: "210.00" } });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason for exceptional amendment (required)"), {
      target: { value: "Client confirmed a revised Abort fee" },
    });
    expect(confirm.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByLabelText("Client has agreed to amended Abort fee"));
    expect(confirm.hasAttribute("disabled")).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(state.amend).toHaveBeenCalledTimes(1);
      expect(state.amend).toHaveBeenCalledWith({
        abortId: "abort-1", newAmount: 210, expectedAmount: 240,
        reason: "Client confirmed a revised Abort fee", clientConfirmed: true,
      });
    });
  });

});
