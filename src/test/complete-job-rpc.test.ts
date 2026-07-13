import { describe, it, expect, vi, beforeEach } from "vitest";

// WORKFLOW-006: complete_job now rejects non-admin callers server-side
// (supabase/migrations/20260713180000_complete_job_admin_only.sql). This
// covers the client wrapper's translation of that rejection into a
// user-facing message, mirroring the existing INVALID_COMPLETION_TRANSITION
// handling already in place.
const mockRpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { completeJobRpc } from "@/lib/api";

beforeEach(() => mockRpc.mockReset());

describe("completeJobRpc (WORKFLOW-006)", () => {
  it("calls the complete_job RPC with the job id and notes", async () => {
    mockRpc.mockResolvedValue({ data: { id: "job-1", status: "completed" }, error: null });
    const job = await completeJobRpc("job-1", "Confirmed via test");
    expect(mockRpc).toHaveBeenCalledWith("complete_job", {
      p_job_id: "job-1",
      p_notes: "Confirmed via test",
    });
    expect(job).toEqual({ id: "job-1", status: "completed" });
  });

  it("translates a server-side ADMIN_OR_SUPER_ADMIN_ONLY rejection into a friendly message", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "ADMIN_OR_SUPER_ADMIN_ONLY" },
    });
    await expect(completeJobRpc("job-1")).rejects.toThrow(
      "Only an admin or super-admin can complete this job.",
    );
  });

  it("translates a server-side INVALID_COMPLETION_TRANSITION rejection into a friendly message", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "INVALID_COMPLETION_TRANSITION" },
    });
    await expect(completeJobRpc("job-1")).rejects.toThrow(
      "This job cannot be completed from its current status.",
    );
  });

  it("rethrows unrecognised errors unchanged", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "some other database error" },
    });
    await expect(completeJobRpc("job-1")).rejects.toMatchObject({
      message: "some other database error",
    });
  });
});
