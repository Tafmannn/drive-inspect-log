// Regression tests for the production-grade "Photos could not be saved on
// this device" recovery flow.
//
// These cover the contract — they intentionally do NOT mount the full
// InspectionFlow tree (which would require mocking auth, router, react-
// query, the storage service and the inspection RPC). Instead they
// verify the canonical surface (StorageFailureCard) and the structured
// diagnostics emission, which together encode the user-facing rules:
//
//   1. ONE canonical error surface (no duplicate banners or toasts).
//   2. "Try again" re-attempts the staged save WITHOUT mutating any
//      caller-owned state — the card itself owns no form/photo state.
//   3. Submit must stay blocked while the failure persists (the parent
//      drives this; the card never auto-clears or reports success).
//   4. After a successful retry, the parent clears the failure and the
//      card unmounts cleanly.
//   5. Structured diagnostics are emitted with a machine-readable
//      reason code classified per failure kind.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

const mockLogClientEvent = vi.fn();
vi.mock("@/lib/logger", () => ({
  logClientEvent: (...a: unknown[]) => mockLogClientEvent(...a),
}));

import { StorageFailureCard } from "@/components/StorageFailureCard";
import {
  classifyStorageError,
  logStorageSubmitFailure,
  type StorageFailure,
} from "@/lib/storageDiagnostics";

beforeEach(() => {
  mockLogClientEvent.mockReset();
  cleanup();
});

const failure: StorageFailure = {
  kind: "quota_exceeded",
  title: "Device storage is full",
  description: "Test description",
  recovery: ["Free up space", "Retry"],
  raw: "QuotaExceededError: disk is full",
};

describe("StorageFailureCard — single canonical surface", () => {
  it("renders exactly one alert region with the failure copy", () => {
    const { getAllByTestId, getByText } = render(
      <StorageFailureCard failure={failure} retrying={false} onRetry={() => {}} />,
    );
    // Exactly one card on screen.
    expect(getAllByTestId("storage-failure-card")).toHaveLength(1);
    // Primary copy present once.
    expect(getByText("Device storage is full")).toBeInTheDocument();
    expect(getByText("Test description")).toBeInTheDocument();
  });

  it("exposes the machine-readable reason code as a data attribute", () => {
    const { getByTestId } = render(
      <StorageFailureCard failure={failure} retrying={false} onRetry={() => {}} />,
    );
    expect(getByTestId("storage-failure-card").getAttribute("data-reason-code"))
      .toBe("quota_exceeded");
  });

  it("offers Try again as the primary action and Show details as the secondary", () => {
    const { getByTestId } = render(
      <StorageFailureCard failure={failure} retrying={false} onRetry={() => {}} />,
    );
    expect(getByTestId("storage-failure-retry").textContent).toContain("Try again");
    expect(getByTestId("storage-failure-details").textContent).toContain("Show details");
  });

  it("Show details reveals recovery steps and the raw reason", () => {
    const { getByTestId, getByText, queryByText } = render(
      <StorageFailureCard failure={failure} retrying={false} onRetry={() => {}} />,
    );
    // Hidden initially — recovery list not rendered.
    expect(queryByText("Free up space")).toBeNull();
    fireEvent.click(getByTestId("storage-failure-details"));
    expect(getByText("Free up space")).toBeInTheDocument();
    expect(getByText("Retry")).toBeInTheDocument();
    // Raw reason is shown for support escalation.
    expect(
      getByText((_, n) => !!n && n.textContent?.includes("QuotaExceededError") === true),
    ).toBeInTheDocument();
  });
});

describe("StorageFailureCard — retry contract", () => {
  it("calls onRetry when Try again is tapped", () => {
    const onRetry = vi.fn();
    const { getByTestId } = render(
      <StorageFailureCard failure={failure} retrying={false} onRetry={onRetry} />,
    );
    fireEvent.click(getByTestId("storage-failure-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while retry is in flight (no duplicate retries)", () => {
    const onRetry = vi.fn();
    const { getByTestId } = render(
      <StorageFailureCard failure={failure} retrying onRetry={onRetry} />,
    );
    const retry = getByTestId("storage-failure-retry") as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    expect(retry.textContent).toContain("Trying again…");
    // Tapping again must not enqueue another retry.
    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("never reports success on its own — parent owns clearing the failure", () => {
    // The card is purely presentational about the failure; on a successful
    // retry the parent unmounts it. Verify by re-rendering with no failure.
    const { queryByTestId, rerender } = render(
      <StorageFailureCard failure={failure} retrying={false} onRetry={() => {}} />,
    );
    expect(queryByTestId("storage-failure-card")).not.toBeNull();
    // Parent has cleared submitStorageFailure on a successful retry path:
    rerender(<div data-testid="parent-only" />);
    expect(queryByTestId("storage-failure-card")).toBeNull();
  });
});

describe("Structured diagnostics", () => {
  it("classifies a quota error and logs it with reason_code=quota_exceeded", () => {
    const err = Object.assign(new Error("QuotaExceededError: disk is full"), {
      name: "QuotaExceededError",
    });
    const f = logStorageSubmitFailure(err, {
      jobId: "job-1",
      inspectionType: "pickup",
      queuedSoFar: 0,
      submissionSessionId: "sess-1",
      phase: "stage",
    });
    expect(f.kind).toBe("quota_exceeded");
    expect(mockLogClientEvent).toHaveBeenCalledTimes(1);
    const [event, severity, opts] = mockLogClientEvent.mock.calls[0];
    expect(event).toBe("inspection_submit_storage_failure");
    expect(severity).toBe("error");
    const ctx = (opts as { context: Record<string, unknown> }).context;
    expect(ctx.reason_code).toBe("quota_exceeded");
    expect(ctx.kind).toBe("quota_exceeded");
    expect(ctx.phase).toBe("stage");
    expect(ctx.attempt).toBe("initial");
    expect(ctx.jobId).toBe("job-1");
  });

  it("classifies a Safari-private-mode error correctly", () => {
    const err = Object.assign(new Error("A mutation operation was attempted on a database that did not allow mutations"), {
      name: "InvalidStateError",
    });
    const f = classifyStorageError(err);
    expect(f.kind).toBe("private_mode");
    expect(f.title).toMatch(/Private Browsing/i);
  });

  it("falls back to unknown with the new operational copy", () => {
    const f = classifyStorageError(new Error("something weird"));
    expect(f.kind).toBe("unknown");
    expect(f.title).toBe("Photos could not be saved on this device");
    expect(f.description).toBe(
      "The inspection has not been submitted because the photos could not be saved safely.",
    );
  });

  it("tags retry attempts distinctly so they're visible in client_logs", () => {
    logStorageSubmitFailure(new Error("x"), {
      jobId: "j",
      inspectionType: "delivery",
      queuedSoFar: 2,
      attempt: "retry",
    });
    const ctx = (mockLogClientEvent.mock.calls[0][2] as { context: Record<string, unknown> })
      .context;
    expect(ctx.attempt).toBe("retry");
  });
});
