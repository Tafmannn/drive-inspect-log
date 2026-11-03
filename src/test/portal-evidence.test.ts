import { describe, it, expect } from "vitest";
// Rules shared with the portal-evidence edge function: which stored objects a
// client-portal user may receive a signed URL for. Everything must fail closed.
import {
  isPathUnderJob,
  isClientVisiblePhotoType,
  photoStoragePath,
  signatureStoragePath,
} from "../../supabase/functions/_shared/portalEvidence";

const JOB = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const SUPA = "https://proj.supabase.co/storage/v1/object";

describe("isPathUnderJob", () => {
  it("accepts a path inside the job folder", () => {
    expect(isPathUnderJob(`jobs/${JOB}/delivery/front.jpg`, JOB)).toBe(true);
  });
  it("rejects another job's folder", () => {
    expect(isPathUnderJob(`jobs/${OTHER}/delivery/front.jpg`, JOB)).toBe(false);
  });
  it("rejects a prefix collision (job id followed by more characters)", () => {
    expect(isPathUnderJob(`jobs/${JOB}extra/front.jpg`, JOB)).toBe(false);
  });
  it("rejects traversal out of the job folder", () => {
    expect(isPathUnderJob(`jobs/${JOB}/../${OTHER}/front.jpg`, JOB)).toBe(false);
  });
  it("rejects absolute and backslash paths", () => {
    expect(isPathUnderJob(`/jobs/${JOB}/a.jpg`, JOB)).toBe(false);
    expect(isPathUnderJob(`jobs\\${JOB}\\a.jpg`, JOB)).toBe(false);
  });
  it("rejects empty inputs", () => {
    expect(isPathUnderJob("", JOB)).toBe(false);
    expect(isPathUnderJob(`jobs/${JOB}/a.jpg`, "")).toBe(false);
  });
});

describe("isClientVisiblePhotoType", () => {
  it("allows pickup, delivery and damage evidence", () => {
    expect(isClientVisiblePhotoType("pickup_exterior_front")).toBe(true);
    expect(isClientVisiblePhotoType("delivery_odometer")).toBe(true);
    expect(isClientVisiblePhotoType("damage_close_up")).toBe(true);
  });
  it("never allows expense receipts or unknown types", () => {
    expect(isClientVisiblePhotoType("receipt")).toBe(false);
    expect(isClientVisiblePhotoType("expense_receipt")).toBe(false);
    expect(isClientVisiblePhotoType("internal_note")).toBe(false);
    expect(isClientVisiblePhotoType(null)).toBe(false);
    expect(isClientVisiblePhotoType("")).toBe(false);
  });
});

describe("photoStoragePath", () => {
  it("uses backend_ref for an internal photo under the job", () => {
    expect(photoStoragePath({ backend: "internal", backend_ref: `jobs/${JOB}/pickup/a.jpg` }, JOB))
      .toBe(`jobs/${JOB}/pickup/a.jpg`);
  });
  it("falls back to extracting the path from a legacy public URL", () => {
    const url = `${SUPA}/public/vehicle-photos/jobs/${JOB}/pickup/a.jpg`;
    expect(photoStoragePath({ backend: "internal", backend_ref: null, url }, JOB))
      .toBe(`jobs/${JOB}/pickup/a.jpg`);
  });
  it("refuses a photo row whose path points at another job", () => {
    expect(photoStoragePath({ backend: "internal", backend_ref: `jobs/${OTHER}/pickup/a.jpg` }, JOB)).toBeNull();
  });
  it("refuses GCS-backed photos", () => {
    expect(photoStoragePath({ backend: "gcs", backend_ref: `jobs/${JOB}/pickup/a.jpg` }, JOB)).toBeNull();
  });
  it("refuses a URL from a different bucket", () => {
    const url = `${SUPA}/public/expense-receipts/jobs/${JOB}/r.jpg`;
    expect(photoStoragePath({ backend: "internal", backend_ref: null, url }, JOB)).toBeNull();
  });
});

describe("signatureStoragePath", () => {
  it("parses the supabase-sig:// form", () => {
    expect(signatureStoragePath(`supabase-sig://vehicle-signatures/jobs/${JOB}/signatures/d.png`, JOB))
      .toBe(`jobs/${JOB}/signatures/d.png`);
  });
  it("refuses supabase-sig:// pointing at another bucket", () => {
    expect(signatureStoragePath(`supabase-sig://onboarding-docs/jobs/${JOB}/x.png`, JOB)).toBeNull();
  });
  it("parses a legacy public URL", () => {
    expect(signatureStoragePath(`${SUPA}/public/vehicle-signatures/jobs/${JOB}/signatures/c.png`, JOB))
      .toBe(`jobs/${JOB}/signatures/c.png`);
  });
  it("accepts a bare path under the job", () => {
    expect(signatureStoragePath(`jobs/${JOB}/signatures/c.png`, JOB)).toBe(`jobs/${JOB}/signatures/c.png`);
  });
  it("refuses another job's signature", () => {
    expect(signatureStoragePath(`supabase-sig://vehicle-signatures/jobs/${OTHER}/s.png`, JOB)).toBeNull();
  });
  it("refuses GCS, data and blob URLs and empty input", () => {
    expect(signatureStoragePath(`https://storage.googleapis.com/axentra_db/jobs/${JOB}/s.png`, JOB)).toBeNull();
    expect(signatureStoragePath("data:image/png;base64,AAAA", JOB)).toBeNull();
    expect(signatureStoragePath("blob:https://x/1", JOB)).toBeNull();
    expect(signatureStoragePath(null, JOB)).toBeNull();
  });
});
