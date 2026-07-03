import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client's storage.createSignedUrl so we can exercise the
// resolver without a live backend.
const createSignedUrl = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    storage: {
      from: () => ({ createSignedUrl }),
    },
  },
}));

import {
  isVehiclePhotoRef,
  extractVehiclePhotoPath,
  resolveVehiclePhotoUrl,
} from "@/lib/vehiclePhotoUrl";

const PUBLIC_URL =
  "https://proj.supabase.co/storage/v1/object/public/vehicle-photos/jobs/abc-123/pickup/exterior_front/p1.jpg";
const SIGNED_URL =
  "https://proj.supabase.co/storage/v1/object/sign/vehicle-photos/jobs/abc-123/pickup/exterior_front/p1.jpg?token=xyz";

describe("vehiclePhotoUrl", () => {
  beforeEach(() => {
    createSignedUrl.mockReset();
  });

  describe("isVehiclePhotoRef", () => {
    it("matches vehicle-photos storage URLs", () => {
      expect(isVehiclePhotoRef(PUBLIC_URL)).toBe(true);
      expect(isVehiclePhotoRef(SIGNED_URL)).toBe(true);
    });
    it("does not match GCS / signature / other refs", () => {
      expect(isVehiclePhotoRef("jobs/abc-123/pickup/p1.jpg")).toBe(false);
      expect(
        isVehiclePhotoRef("https://storage.googleapis.com/axentra_db/jobs/x/p.jpg"),
      ).toBe(false);
      expect(isVehiclePhotoRef("supabase-sig://vehicle-signatures/jobs/x/s.png")).toBe(
        false,
      );
      expect(
        isVehiclePhotoRef(
          "https://proj.supabase.co/storage/v1/object/public/expense-receipts/e/r.jpg",
        ),
      ).toBe(false);
    });
  });

  describe("extractVehiclePhotoPath", () => {
    it("extracts the object path from a public URL", () => {
      expect(extractVehiclePhotoPath(PUBLIC_URL)).toBe(
        "jobs/abc-123/pickup/exterior_front/p1.jpg",
      );
    });
    it("extracts the object path from a signed URL", () => {
      expect(extractVehiclePhotoPath(SIGNED_URL)).toBe(
        "jobs/abc-123/pickup/exterior_front/p1.jpg",
      );
    });
    it("returns null for a non-vehicle-photos ref", () => {
      expect(extractVehiclePhotoPath("jobs/x/p.jpg")).toBeNull();
    });
  });

  describe("resolveVehiclePhotoUrl", () => {
    it("returns a fresh signed URL for a same-org (RLS-allowed) photo", async () => {
      createSignedUrl.mockResolvedValue({
        data: { signedUrl: SIGNED_URL },
        error: null,
      });
      const out = await resolveVehiclePhotoUrl(PUBLIC_URL);
      expect(out).toBe(SIGNED_URL);
      expect(createSignedUrl).toHaveBeenCalledWith(
        "jobs/abc-123/pickup/exterior_front/p1.jpg",
        3600,
      );
    });

    it("returns null when RLS denies signing (cross-org — no leak)", async () => {
      createSignedUrl.mockResolvedValue({
        data: null,
        error: { message: "Object not found" },
      });
      expect(await resolveVehiclePhotoUrl(PUBLIC_URL)).toBeNull();
    });

    it("returns null (no signing attempt) for non-vehicle-photos refs", async () => {
      expect(await resolveVehiclePhotoUrl("jobs/x/p.jpg")).toBeNull();
      expect(await resolveVehiclePhotoUrl(null)).toBeNull();
      expect(await resolveVehiclePhotoUrl(undefined)).toBeNull();
      expect(createSignedUrl).not.toHaveBeenCalled();
    });
  });
});
