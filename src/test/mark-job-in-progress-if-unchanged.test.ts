import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression for a race found by a controlled concurrency load test
// simulating an offline-queue reconnection burst: InspectionFlow's
// fire-and-forget "mark in_progress" poke used a plain status update with
// no guard. If the driver finished and submitted before that poke's write
// landed, submit_inspection() had already moved the job past this stage —
// and the poke, arriving after, unconditionally clobbered status back to
// *_in_progress even though the submission had already completed, leaving
// job.status inconsistent with has_pickup_inspection and the saved
// inspection. markJobInProgressIfUnchanged() gates the write on updated_at
// so a stale poke becomes a no-op instead of an overwrite.

const state = { eqArgs: [] as unknown[][] };

function makeQuery(result: { data: unknown; error: unknown }) {
  const query: any = {
    eq: vi.fn((...args: unknown[]) => {
      state.eqArgs.push(args);
      return query;
    }),
    select: vi.fn(() => Promise.resolve(result)),
  };
  return query;
}

const mockUpdate = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { markJobInProgressIfUnchanged } from "@/lib/api";

beforeEach(() => {
  state.eqArgs = [];
  mockUpdate.mockReset();
  mockFrom.mockReset();
});

describe("markJobInProgressIfUnchanged", () => {
  it("scopes the update to the job id AND the expected updated_at, and reports success when it lands", async () => {
    const query = makeQuery({ data: [{ id: "job-1" }], error: null });
    mockUpdate.mockReturnValue(query);
    mockFrom.mockReturnValue({ update: mockUpdate });

    const applied = await markJobInProgressIfUnchanged(
      "job-1",
      "pickup_in_progress",
      "2026-09-27T01:25:46.310985+00:00",
    );

    expect(mockFrom).toHaveBeenCalledWith("jobs");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "pickup_in_progress" });
    expect(state.eqArgs).toEqual([
      ["id", "job-1"],
      ["updated_at", "2026-09-27T01:25:46.310985+00:00"],
    ]);
    expect(applied).toBe(true);
  });

  it("reports a no-op (not an error) when the job changed since it was read — e.g. the real submission won the race", async () => {
    const query = makeQuery({ data: [], error: null });
    mockUpdate.mockReturnValue(query);
    mockFrom.mockReturnValue({ update: mockUpdate });

    const applied = await markJobInProgressIfUnchanged("job-1", "pickup_in_progress", "stale-timestamp");

    expect(applied).toBe(false);
  });

  it("throws on a genuine database error", async () => {
    const query = makeQuery({ data: null, error: { message: "boom" } });
    mockUpdate.mockReturnValue(query);
    mockFrom.mockReturnValue({ update: mockUpdate });

    await expect(
      markJobInProgressIfUnchanged("job-1", "pickup_in_progress", "t"),
    ).rejects.toMatchObject({ message: "boom" });
  });
});
