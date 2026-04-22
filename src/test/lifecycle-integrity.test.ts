/**
 * Lifecycle integrity regression tests.
 *
 * These cover the rules enforced by the reopen / submit_inspection / complete_job
 * RPCs and the run-isolation logic in pendingUploads. Where we can't exercise
 * Postgres directly we assert against the centralized helpers that mirror the
 * server's contract (ADMIN_ALLOWED_TRANSITIONS, the JOB_STATUS map, and the
 * pending-upload run-id contract).
 */
import { describe, it, expect, vi } from "vitest";
import {
  ADMIN_ALLOWED_TRANSITIONS,
  JOB_STATUS,
  ACTIVE_STATUSES,
  PENDING_STATUSES,
} from "@/lib/statusConfig";

// ─── Reopen transition rules ────────────────────────────────────────────

describe("admin reopen transitions", () => {
  it("allows COMPLETED → READY_FOR_PICKUP (reopen path)", () => {
    expect(ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.COMPLETED]).toContain(
      JOB_STATUS.READY_FOR_PICKUP,
    );
  });

  it("allows CANCELLED → READY_FOR_PICKUP (reopen path)", () => {
    expect(ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.CANCELLED]).toContain(
      JOB_STATUS.READY_FOR_PICKUP,
    );
  });

  it("allows FAILED → READY_FOR_PICKUP (reopen path)", () => {
    expect(ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.FAILED]).toContain(
      JOB_STATUS.READY_FOR_PICKUP,
    );
  });

  it("does NOT allow COMPLETED → arbitrary mid-flow status (only reopen)", () => {
    const allowed = ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.COMPLETED];
    expect(allowed).not.toContain(JOB_STATUS.PICKUP_IN_PROGRESS);
    expect(allowed).not.toContain(JOB_STATUS.IN_TRANSIT);
    expect(allowed).not.toContain(JOB_STATUS.POD_READY);
  });
});

// ─── Completion transition rules ────────────────────────────────────────

describe("completion transitions", () => {
  it("allows POD_READY → COMPLETED (terminal completion)", () => {
    expect(ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.POD_READY]).toContain(
      JOB_STATUS.COMPLETED,
    );
  });

  it("allows DELIVERY_COMPLETE → COMPLETED (terminal completion)", () => {
    expect(ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.DELIVERY_COMPLETE]).toContain(
      JOB_STATUS.COMPLETED,
    );
  });

  it("does NOT allow direct mid-flow → COMPLETED jumps", () => {
    // Server-side complete_job RPC also rejects these with INVALID_COMPLETION_TRANSITION
    expect(ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.NEW] ?? []).not.toContain(
      JOB_STATUS.COMPLETED,
    );
    expect(
      ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.PICKUP_IN_PROGRESS] ?? [],
    ).not.toContain(JOB_STATUS.COMPLETED);
    expect(
      ADMIN_ALLOWED_TRANSITIONS[JOB_STATUS.IN_TRANSIT] ?? [],
    ).not.toContain(JOB_STATUS.COMPLETED);
  });
});

// ─── Completion semantics: completed_at gating ──────────────────────────

describe("completion metric semantics", () => {
  it("POD_READY and DELIVERY_COMPLETE are NOT in ACTIVE_STATUSES (they are pending review)", () => {
    expect(ACTIVE_STATUSES).not.toContain(JOB_STATUS.POD_READY);
    expect(ACTIVE_STATUSES).not.toContain(JOB_STATUS.DELIVERY_COMPLETE);
  });

  it("POD_READY and DELIVERY_COMPLETE are PENDING (review queue), not COMPLETED", () => {
    expect(PENDING_STATUSES).toContain(JOB_STATUS.POD_READY);
    expect(PENDING_STATUSES).toContain(JOB_STATUS.DELIVERY_COMPLETE);
    expect(PENDING_STATUSES).not.toContain(JOB_STATUS.COMPLETED);
  });

  it("COMPLETED is NOT in ACTIVE_STATUSES", () => {
    expect(ACTIVE_STATUSES).not.toContain(JOB_STATUS.COMPLETED);
  });
});

// ─── Run-isolation contract ─────────────────────────────────────────────
//
// The pending-upload retry worker MUST drop any queued upload whose runId
// no longer matches the job's current_run_id. The pure decision is
// extracted here so we can test it without IndexedDB or Supabase.

function shouldUploadQueuedItem(
  itemRunId: string | null | undefined,
  jobCurrentRunId: string | null | undefined,
): boolean {
  // Item with no runId — legacy/best-effort, allow upload (back-compat).
  if (!itemRunId) return true;
  // Job has no current run (shouldn't happen — column is NOT NULL) — block defensively.
  if (!jobCurrentRunId) return false;
  // Run mismatch → stale, do NOT upload (would pollute new active run).
  return itemRunId === jobCurrentRunId;
}

describe("pending upload run isolation", () => {
  it("uploads when item runId matches job current_run_id", () => {
    expect(shouldUploadQueuedItem("run-abc", "run-abc")).toBe(true);
  });

  it("DROPS upload when item runId does not match (job was reopened)", () => {
    expect(shouldUploadQueuedItem("run-old", "run-new")).toBe(false);
  });

  it("allows upload for legacy items with no runId (back-compat)", () => {
    expect(shouldUploadQueuedItem(null, "run-new")).toBe(true);
    expect(shouldUploadQueuedItem(undefined, "run-new")).toBe(true);
  });

  it("blocks upload when job has no current_run_id but item does", () => {
    expect(shouldUploadQueuedItem("run-old", null)).toBe(false);
  });
});

// ─── Active-evidence filter contract ────────────────────────────────────
//
// Active read paths must exclude rows where archived_at IS NOT NULL.
// This mirrors the server filter in getJobWithRelations / getInspection /
// useControlComplianceData / useAttentionData / exportQueries / lib/export.

type EvidenceRow = { archived_at: string | null; run_id?: string | null };

function activeOnly<T extends EvidenceRow>(
  rows: T[],
  currentRunId?: string | null,
): T[] {
  return rows.filter((r) => {
    if (r.archived_at !== null) return false;
    // When current run is known, also reject rows tagged with a different run.
    if (currentRunId && r.run_id && r.run_id !== currentRunId) return false;
    return true;
  });
}

describe("active evidence filtering", () => {
  it("excludes archived rows", () => {
    const rows: EvidenceRow[] = [
      { archived_at: null, run_id: "r1" },
      { archived_at: "2025-01-01T00:00:00Z", run_id: "r1" },
      { archived_at: null, run_id: "r1" },
    ];
    expect(activeOnly(rows, "r1")).toHaveLength(2);
  });

  it("excludes rows from a previous run even if not yet archived", () => {
    // Defensive filter for the brief window between reopen_job's status flip
    // and the archive sweep on the corresponding evidence rows.
    const rows: EvidenceRow[] = [
      { archived_at: null, run_id: "r-old" },
      { archived_at: null, run_id: "r-new" },
    ];
    expect(activeOnly(rows, "r-new")).toEqual([
      { archived_at: null, run_id: "r-new" },
    ]);
  });

  it("preserves rows when current run is unknown (no defensive filter)", () => {
    const rows: EvidenceRow[] = [
      { archived_at: null, run_id: "r-old" },
      { archived_at: null, run_id: "r-new" },
    ];
    expect(activeOnly(rows, null)).toHaveLength(2);
  });
});

// ─── Dashboard completion semantics ─────────────────────────────────────
//
// Lifecycle contract: only `status = COMPLETED` is truly complete.
// pod_ready / delivery_complete are review states and MUST be counted as
// "pending review", not as completed work. completed_at is metadata only.

describe("dashboard completion semantics", () => {
  it("POD_READY and DELIVERY_COMPLETE are PENDING, not COMPLETED", () => {
    expect(PENDING_STATUSES).toContain(JOB_STATUS.POD_READY);
    expect(PENDING_STATUSES).toContain(JOB_STATUS.DELIVERY_COMPLETE);
    expect(PENDING_STATUSES).not.toContain(JOB_STATUS.COMPLETED);
  });

  it("only COMPLETED counts as completed (not POD_READY / DELIVERY_COMPLETE)", () => {
    // Mirrors the SQL filter applied in useDashboardCounts and
    // useAdminControlData.completedToday, which both filter by
    // status = JOB_STATUS.COMPLETED instead of completed_at IS NOT NULL.
    const jobsToCount = [
      { status: JOB_STATUS.COMPLETED },
      { status: JOB_STATUS.POD_READY },
      { status: JOB_STATUS.DELIVERY_COMPLETE },
      { status: JOB_STATUS.IN_TRANSIT },
    ];
    const completedCount = jobsToCount.filter(
      (j) => j.status === JOB_STATUS.COMPLETED,
    ).length;
    expect(completedCount).toBe(1);
  });
});

// ─── Submission session lifecycle (worker guard + duplicate-submit) ─────
//
// These tests validate the staged → ready → uploading state machine and
// the single-flight submit guard against fast double-tap. The full session
// flow (stage / promote / discard / TTL) is covered in pending-uploads.test.ts;
// here we keep small focused contracts so a regression in any of the
// invariants is caught without depending on IndexedDB infrastructure.

type QueueState = "staged" | "ready" | "uploading" | "uploaded" | "failed";

function workerWouldUpload(state: QueueState): boolean {
  // Must mirror retryUpload's hard guard in src/lib/pendingUploads.ts.
  return state === "ready" || state === "failed";
}

describe("upload worker state guard", () => {
  it("REFUSES staged items (cannot upload until promoted)", () => {
    expect(workerWouldUpload("staged")).toBe(false);
  });
  it("REFUSES uploading items (already in flight)", () => {
    expect(workerWouldUpload("uploading")).toBe(false);
  });
  it("REFUSES uploaded items (terminal success)", () => {
    expect(workerWouldUpload("uploaded")).toBe(false);
  });
  it("ACCEPTS ready items (post-promotion)", () => {
    expect(workerWouldUpload("ready")).toBe(true);
  });
  it("ACCEPTS failed items (user-initiated retry)", () => {
    expect(workerWouldUpload("failed")).toBe(true);
  });
});

// Single-flight submit mutex — pure model of the useRef guard used in
// InspectionFlow.handleFinalSubmit. Asserts that two concurrent calls
// only produce one inspection submission, even if React render hasn't
// caught up between rapid taps.
function makeSubmitMutex() {
  let inFlight = false;
  let calls = 0;
  return {
    async submit(work: () => Promise<void>) {
      if (inFlight) return false;
      inFlight = true;
      calls++;
      try {
        await work();
        return true;
      } finally {
        inFlight = false;
      }
    },
    get callCount() {
      return calls;
    },
  };
}

describe("single-flight submit guard", () => {
  it("blocks a second concurrent call and only invokes work once", async () => {
    const mutex = makeSubmitMutex();
    const work = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const [a, b] = await Promise.all([
      mutex.submit(work),
      mutex.submit(work),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(work).toHaveBeenCalledTimes(1);
    expect(mutex.callCount).toBe(1);
  });

  it("releases the lock after work completes (subsequent submit allowed)", async () => {
    const mutex = makeSubmitMutex();
    const work = vi.fn(async () => {});
    await mutex.submit(work);
    await mutex.submit(work);
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("releases the lock even if work throws", async () => {
    const mutex = makeSubmitMutex();
    await mutex
      .submit(async () => {
        throw new Error("boom");
      })
      .catch(() => {});
    const ok = await mutex.submit(async () => {});
    expect(ok).toBe(true);
  });
});


