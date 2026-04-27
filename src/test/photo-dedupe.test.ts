import { describe, it, expect } from "vitest";
import {
  canonicalisePhotos,
  dedupeByIdentity,
  excludeArchived,
  isolateToCurrentRun,
  photoIdentity,
} from "@/lib/photoDedupe";
import type { Photo } from "@/lib/types";

const p = (over: Partial<Photo>): Photo => ({
  id: over.id ?? "id-" + Math.random().toString(36).slice(2),
  job_id: "job-1",
  inspection_id: null,
  type: "pickup_exterior_front",
  url: "https://x/y.jpg",
  thumbnail_url: null,
  backend: "googleCloud",
  backend_ref: null,
  label: null,
  created_at: "2026-01-01T00:00:00Z",
  run_id: null,
  archived_at: null,
  ...over,
});

describe("photoDedupe", () => {
  it("identity prefers id, then backend_ref, then inspection+type+url", () => {
    expect(photoIdentity(p({ id: "A", backend_ref: "B" }))).toBe("id:A");
    expect(photoIdentity(p({ id: "", backend_ref: "B" } as any))).toBe("ref:B");
  });

  it("excludeArchived drops archived rows", () => {
    const out = excludeArchived([
      p({ id: "1" }),
      p({ id: "2", archived_at: "2026-01-02T00:00:00Z" }),
    ]);
    expect(out.map((x) => x.id)).toEqual(["1"]);
  });

  it("isolateToCurrentRun prefers current run, falls back to null-run only when current is empty", () => {
    const cur = isolateToCurrentRun(
      [
        p({ id: "cur", run_id: "R2" }),
        p({ id: "old", run_id: "R1" }),
        p({ id: "legacy", run_id: null }),
      ],
      "R2",
    );
    expect(cur.map((x) => x.id)).toEqual(["cur"]);

    const fallback = isolateToCurrentRun(
      [
        p({ id: "old", run_id: "R1" }),
        p({ id: "legacy", run_id: null }),
      ],
      "R2",
    );
    expect(fallback.map((x) => x.id)).toEqual(["legacy"]);
  });

  it("dedupeByIdentity collapses duplicates by id / backend_ref", () => {
    const out = dedupeByIdentity([
      p({ id: "A" }),
      p({ id: "A" }),
      p({ id: "B", backend_ref: "ref-1" }),
      p({ id: "C", backend_ref: "ref-1" }),
    ]);
    // A wins by id; first ref-1 row (B) wins; C dropped because same id is unique but B already claimed via id
    expect(out.length).toBe(3);
  });

  it("canonicalisePhotos: archived dropped, current-run isolated, deduped", () => {
    const out = canonicalisePhotos(
      [
        p({ id: "1", run_id: "R2" }),
        p({ id: "1", run_id: "R2" }), // dupe by id
        p({ id: "2", run_id: "R1" }), // wrong run
        p({ id: "3", run_id: "R2", archived_at: "2026-01-02T00:00:00Z" }),
      ],
      "R2",
    );
    expect(out.map((x) => x.id)).toEqual(["1"]);
  });
});
