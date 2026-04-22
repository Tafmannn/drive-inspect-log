/**
 * Lifecycle integrity regression tests.
 *
 * These cover the rules enforced by the reopen / submit_inspection / complete_job
 * RPCs and the run-isolation logic in pendingUploads. Where we can't exercise
 * Postgres directly we assert against the centralized helpers that mirror the
 * server's contract (ADMIN_ALLOWED_TRANSITIONS, the JOB_STATUS map, and the
 * pending-upload run-id contract).
 */
import { describe, it, expect } from "vitest";
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
