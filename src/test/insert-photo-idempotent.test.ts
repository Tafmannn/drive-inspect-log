import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression for a real production incident found during a mobile-conditions
// audit: insertPhoto() did a plain INSERT with no idempotency key. On a
// retry after the response leg was lost (a plausible drop on a weak mobile
// connection right after the insert had already committed server-side),
// retryUpload() calls insertPhoto() again for the same photo — three real
// jobs on bad connections produced 18 groups of duplicate rows (135 extra
// rows) in production before this fix. insertPhoto() now upserts on
// `backend_ref`, which is deterministic per captured photo, so a retry
// updates the existing row instead of creating a duplicate.
//
// migration 20260927120000_photos_idempotent_insert_on_retry adds the
// unique index this upsert relies on; it is deliberately NOT partial —
// PostgREST's upsert can only express a conflict target as a column list,
// so an `on_conflict=backend_ref` request against a partial index fails at
// runtime (verified against a live rolled-back probe).

const state = { from: [] as string[], upsertArgs: [] as unknown[], insertArgs: [] as unknown[], eqArgs: [] as unknown[] };

function photosQuery(result: { data: unknown; error: unknown }) {
  return {
    select: () => ({ single: async () => result }),
  };
}

const mockGetOrgId = vi.fn(async () => "org-1");
const mockJobsSelect = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      state.from.push(table);
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => mockJobsSelect() }),
          }),
        };
      }
      return {
        insert: (row: unknown) => {
          state.insertArgs.push(row);
          return photosQuery({ data: { id: "photo-1", ...(row as object) }, error: null });
        },
        upsert: (row: unknown, opts: unknown) => {
          state.upsertArgs.push([row, opts]);
          return photosQuery({ data: { id: "photo-1", ...(row as object) }, error: null });
        },
      };
    },
  },
}));

vi.mock("@/lib/orgHelper", () => ({ getOrgId: () => mockGetOrgId() }));

import { insertPhoto } from "@/lib/api";

beforeEach(() => {
  state.from = [];
  state.upsertArgs = [];
  state.insertArgs = [];
  mockJobsSelect.mockReset().mockResolvedValue({ data: { current_run_id: "run-1" }, error: null });
});

describe("insertPhoto idempotency", () => {
  it("upserts on backend_ref when the photo carries one (the normal captured-photo path)", async () => {
    await insertPhoto({
      job_id: "job-1",
      inspection_id: "insp-1",
      type: "pickup_exterior_front",
      url: "https://x/photo.jpg",
      backend: "internal",
      backend_ref: "jobs/job-1/pickup/pickup_exterior_front/pu_abc.jpg",
      thumbnail_url: null,
      label: null,
      damage_item_id: null,
    } as any);

    expect(state.upsertArgs).toHaveLength(1);
    expect(state.insertArgs).toHaveLength(0);
    const [row, opts] = state.upsertArgs[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(opts).toEqual({ onConflict: "backend_ref" });
    expect(row.backend_ref).toBe("jobs/job-1/pickup/pickup_exterior_front/pu_abc.jpg");
  });

  it("a retry with the same backend_ref reuses the upsert path (would update the existing row, not create a second one)", async () => {
    const payload = {
      job_id: "job-1",
      inspection_id: "insp-1",
      type: "pickup_exterior_front",
      url: "https://x/photo.jpg",
      backend: "internal",
      backend_ref: "jobs/job-1/pickup/pickup_exterior_front/pu_abc.jpg",
      thumbnail_url: null,
      label: null,
      damage_item_id: null,
    } as any;

    await insertPhoto(payload);
    await insertPhoto(payload); // simulates retryUpload firing again after a lost ack

    expect(state.upsertArgs).toHaveLength(2);
    expect(state.insertArgs).toHaveLength(0);
    // Both calls hit the same conflict target — the DB-level unique index
    // (verified separately against a live probe) is what actually collapses
    // these into one row; this test guards the client always taking the
    // upsert path rather than a plain insert for any backend_ref'd photo.
    for (const [, opts] of state.upsertArgs as [unknown, Record<string, unknown>][]) {
      expect(opts).toEqual({ onConflict: "backend_ref" });
    }
  });

  it("falls back to a plain insert when backend_ref is absent (no conflict target to upsert on)", async () => {
    await insertPhoto({
      job_id: "job-1",
      inspection_id: "insp-1",
      type: "pickup_exterior_front",
      url: "https://x/photo.jpg",
      backend: "internal",
      backend_ref: null,
      thumbnail_url: null,
      label: null,
      damage_item_id: null,
    } as any);

    expect(state.insertArgs).toHaveLength(1);
    expect(state.upsertArgs).toHaveLength(0);
  });
});
