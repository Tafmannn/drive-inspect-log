import { describe, it, expect } from "vitest";
import {
  deriveEvidenceExceptions,
  deriveSyncExceptions,
} from "@/features/attention/engine/exceptionEngine";

const now = new Date().toISOString();

describe("attention exception action routes", () => {
  it("signature failures open the affected job (there is no /admin/logs page)", () => {
    const [withJob] = deriveEvidenceExceptions([], [], [
      { event: "signature_resolve_failed", job_id: "job-1", created_at: now, context: {} },
    ]);
    expect(withJob.actionRoute).toBe("/jobs/job-1");

    const [noJob] = deriveEvidenceExceptions([], [], [
      { event: "signature_resolve_failed", job_id: null, created_at: now, context: {} },
    ]);
    expect(noJob.actionRoute).toBe("/super-admin/errors");
  });

  it('sync "Open logs" goes to the error feed, not the super-admin dashboard', () => {
    const [dupe] = deriveSyncExceptions([{ event: "duplicate_job_skipped", created_at: now, context: {} }]);
    expect(dupe.actionRoute).toBe("/super-admin/errors");
  });
});
