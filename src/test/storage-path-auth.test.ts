import { describe, it, expect } from "vitest";
// Pure path-authorization logic shared with the gcs-proxy / resolve-signature-url /
// gcs-upload edge functions (C1/C2 IDOR fix, later extended to close the
// gcs-upload cross-org write gap). This guards the rule that a storage object's
// owning job is derived ONLY from a well-formed `jobs/<uuid>/...` path, and that
// anything else fails closed.
import { extractJobIdFromPath } from "../../supabase/functions/_shared/pathAuth";

const JOB = "11111111-2222-4333-8444-555555555555";

describe("extractJobIdFromPath (storage IDOR guard)", () => {
  it("extracts the job id from a photo path", () => {
    expect(extractJobIdFromPath(`jobs/${JOB}/collection/exterior/abc.jpg`)).toBe(JOB);
  });

  it("extracts the job id from a signature path", () => {
    expect(extractJobIdFromPath(`jobs/${JOB}/signatures/delivery/driver.png`)).toBe(JOB);
  });

  it("tolerates a leading slash", () => {
    expect(extractJobIdFromPath(`/jobs/${JOB}/x/y.jpg`)).toBe(JOB);
  });

  it("rejects a non-uuid job segment (fail closed)", () => {
    expect(extractJobIdFromPath("jobs/not-a-uuid/x.jpg")).toBeNull();
    expect(extractJobIdFromPath("jobs/123/x.jpg")).toBeNull();
  });

  it("rejects paths without a jobs/<id>/ prefix (fail closed)", () => {
    expect(extractJobIdFromPath(`${JOB}/x.jpg`)).toBeNull();
    expect(extractJobIdFromPath("expense-receipts/abc/x.jpg")).toBeNull();
    expect(extractJobIdFromPath("../../etc/passwd")).toBeNull();
    expect(extractJobIdFromPath("")).toBeNull();
  });

  it("rejects a bare jobs/<id> with no trailing segment (fail closed)", () => {
    expect(extractJobIdFromPath(`jobs/${JOB}`)).toBeNull();
  });

  it("does not let an attacker smuggle another job id mid-path", () => {
    // The FIRST jobs/<uuid>/ segment is authoritative.
    const other = "99999999-8888-4777-8666-555555555555";
    expect(extractJobIdFromPath(`jobs/${JOB}/x/jobs/${other}/y.jpg`)).toBe(JOB);
  });
});
