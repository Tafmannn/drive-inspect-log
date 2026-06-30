import { describe, it, expect, vi } from "vitest";

// internalStorageService imports the supabase client at module load; the 0-byte
// guard throws before any storage call, so a minimal mock is sufficient.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({ upload: async () => ({ error: null }) }) } },
}));

import { internalStorageService } from "@/lib/internalStorageService";

describe("internalStorageService — 0-byte upload guard (V7)", () => {
  it("throws on a 0-byte file before any storage write", async () => {
    const empty = new File([], "empty.jpg", { type: "image/jpeg" });
    await expect(
      internalStorageService.uploadImage(empty, "jobs/J/pickup/odometer/x"),
    ).rejects.toThrow(/empty/i);
  });
});
