/**
 * DATA-002: suites 02/03/04's "release set" detection used to be a hardcoded
 * date regex duplicated in three files, never bumped since the original
 * Phase 1 release — 10+ migrations since then were silently never checked.
 * This tests the extracted, shared cutoff directly.
 */
import { describe, it, expect } from "vitest";
import { isInReleaseSet, RELEASE_SET_SINCE } from "../../release-validation/lib/releaseSet.mjs";

describe("isInReleaseSet", () => {
  it("includes the cutoff date itself", () => {
    expect(isInReleaseSet(`${RELEASE_SET_SINCE}100000_something.sql`)).toBe(true);
  });

  it("includes migrations well after the cutoff", () => {
    expect(isInReleaseSet("20260713150000_submit_inspection_assigned_driver_only.sql")).toBe(true);
  });

  it("excludes migrations before the cutoff", () => {
    expect(isInReleaseSet("20260225231715_ff75c7d2-f6d4-4331-9798-b8eb38a7fc39.sql")).toBe(false);
  });

  it("excludes files with no leading timestamp", () => {
    expect(isInReleaseSet("README.md")).toBe(false);
    expect(isInReleaseSet("not_a_migration.sql")).toBe(false);
  });
});
