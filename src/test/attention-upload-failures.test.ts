import { describe, it, expect } from "vitest";
import {
  deriveEvidenceExceptions,
  isGenuineUploadFailure,
} from "@/features/attention/engine/exceptionEngine";

const JOB = "5c859237-0a3a-4645-a2a2-0740ff155291";
const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const log = (event: string, context: any = {}, created_at = minsAgo(5)) => ({
  event,
  job_id: JOB,
  created_at,
  context,
});

const run = (logs: ReturnType<typeof log>[]) => deriveEvidenceExceptions([], [], logs);
const repeated = (out: ReturnType<typeof run>) => out.filter(e => e.title === "Repeated upload failures");

describe("isGenuineUploadFailure", () => {
  it("counts real upload failures", () => {
    expect(isGenuineUploadFailure(log("photo_upload_failed", { error: "Upload failed: Load failed" }))).toBe(true);
    expect(isGenuineUploadFailure(log("upload_failed"))).toBe(true);
  });

  it("ignores deliberate stale-run purges", () => {
    expect(isGenuineUploadFailure(log("photo_upload_failed", { reason: "stale_run_purged" }))).toBe(false);
  });

  it("ignores other events", () => {
    expect(isGenuineUploadFailure(log("signature_resolve_failed"))).toBe(false);
  });
});

describe("repeated upload failure exception", () => {
  it("is not raised by a burst of stale-run purges plus one real failure", () => {
    const purges = Array.from({ length: 8 }, () => log("photo_upload_failed", { reason: "stale_run_purged" }));
    expect(repeated(run([...purges, log("photo_upload_failed", { error: "Load failed" })]))).toHaveLength(0);
  });

  it("is still raised by three genuine failures on one job", () => {
    const real = Array.from({ length: 3 }, () => log("photo_upload_failed", { error: "Load failed" }));
    const [e] = repeated(run(real));
    expect(e).toMatchObject({ category: "evidence", severity: "high", jobId: JOB });
    expect(e.detail).toContain("3 upload failures");
  });

  it("counts only the genuine ones when mixed with purges", () => {
    const logs = [
      ...Array.from({ length: 5 }, () => log("photo_upload_failed", { reason: "stale_run_purged" })),
      ...Array.from({ length: 3 }, () => log("upload_failed", { error: "timeout" })),
    ];
    expect(repeated(run(logs))[0].detail).toContain("3 upload failures");
  });
});
