/** The Abort admin panel must not hide a failed replacement-job lookup. */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockState = vi.hoisted(() => ({ replacementLookupError: "" }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const chain = {
          eq: (_column: string, _value: unknown) => chain,
          order: (_column: string, _options?: unknown) => chain,
          limit: (_count: number) => chain,
          then: (resolve: (value: { data: unknown[]; error: { message: string } | null }) => unknown) =>
            Promise.resolve({
              data: [] as unknown[],
              error: table === "jobs" && mockState.replacementLookupError
                ? { message: mockState.replacementLookupError }
                : null,
            }).then(resolve),
        };
        return chain;
      },
    }),
  },
}));

import { getJobAbortState } from "@/features/abort/api/abortApi";

describe("getJobAbortState", () => {
  beforeEach(() => {
    mockState.replacementLookupError = "";
  });

  it("returns an empty state when all data lookups succeed", async () => {
    const state = await getJobAbortState("job-1");
    expect(state.current).toBeNull();
    expect(state.pendingRequest).toBeNull();
    expect(state.replacementJobId).toBeNull();
    expect(state.invoiced).toBe(false);
  });

  it("does not misreport 'no replacement' when the lookup failed", async () => {
    mockState.replacementLookupError = "permission denied for replacement job";
    await expect(getJobAbortState("job-1")).rejects.toThrow(
      "Could not load the Abort: permission denied for replacement job",
    );
  });
});
