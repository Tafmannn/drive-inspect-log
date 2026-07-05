import { describe, it, expect, beforeEach, vi } from "vitest";

// Same collaborator mocks as pending-uploads.test.ts so the module imports.
vi.mock("@/lib/storage", () => ({
  storageService: { uploadImage: vi.fn() },
}));
vi.mock("@/lib/api", () => ({ insertPhoto: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logClientEvent: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { current_run_id: null } }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));

import { stagePendingUpload, getAllPendingUploads, __testing__ } from "@/lib/pendingUploads";
import { get, clear } from "idb-keyval";

const SESSION = "sess-bbbbbbbb-0000-0000-0000-000000000002";

// A recognisable, non-trivial byte payload.
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03, 0x04, 0xfe, 0xff]);

function makeFile(): File {
  return new File([BYTES], "durable.jpg", { type: "image/jpeg" });
}

beforeEach(async () => {
  await clear(__testing__.store);
});

describe("pendingUploads — blob durability (iOS WebKit 0-byte guard)", () => {
  it("persists staged bytes as an ArrayBuffer, not a raw Blob", async () => {
    const item = await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION,
      clientPhotoId: "cpid-1",
      jobId: "job-1",
      inspectionType: "pickup",
      photoType: "exterior_front",
      label: null,
    });

    // The value stored under the per-item blob key must be the ArrayBuffer
    // wrapper. A raw Blob here is what WebKit can silently zero out.
    const raw = await get(__testing__.BLOB_KEY_PREFIX + item.id, __testing__.store);
    expect(raw).toBeTruthy();
    // ArrayBuffer-backed (duck-typed: byteLength), not a raw Blob that WebKit can zero.
    const bytes = (raw as { __axBytes?: { byteLength?: number } }).__axBytes;
    expect(typeof bytes?.byteLength).toBe("number");
    expect(bytes?.byteLength).toBe(BYTES.byteLength);
    expect((raw as { type?: string }).type).toBe("image/jpeg");
    expect(raw instanceof Blob).toBe(false);
  });

  it("round-trips the exact bytes back into a non-empty Blob on load", async () => {
    await stagePendingUpload(makeFile(), {
      submissionSessionId: SESSION,
      clientPhotoId: "cpid-2",
      jobId: "job-1",
      inspectionType: "pickup",
      photoType: "exterior_rear",
      label: null,
    });

    const all = await getAllPendingUploads();
    expect(all).toHaveLength(1);
    const blob = all[0].fileBlob!;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBe(BYTES.byteLength);

    const roundTripped = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(roundTripped)).toEqual(Array.from(BYTES));
  });
});
