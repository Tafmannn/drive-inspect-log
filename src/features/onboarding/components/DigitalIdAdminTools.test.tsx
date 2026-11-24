import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DigitalIdAdminTools } from "./DigitalIdAdminTools";
import type { DigitalIdCredential } from "../hooks/useDigitalCredential";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove }),
    },
  },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/evidence/imageProcessing", () => ({
  processImage: async () => ({
    bytes: new Uint8Array([1, 2, 3]).buffer,
    thumbBytes: null,
    mimeType: "image/jpeg",
    fileSize: 3,
    width: 10,
    height: 10,
    hash: "test-hash",
  }),
}));

const credential: DigitalIdCredential = {
  driver_id: "AX-000099",
  credential_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  org_id: "33333333-3333-4333-8333-333333333333",
  full_name: "Sample Driver",
  employment_type: "contractor",
  role_label: "Authorised Driver",
  photo_path: null,
  credential_version: 1,
  status: "active",
  checked_at: "2026-11-24T00:00:00Z",
  valid_until: "2026-11-24T00:00:30Z",
  company_name: "Axentra Vehicle Logistics",
  company_website: "www.axentravehicles.co.uk",
  company_phone: null,
  issued_by: "Axentra Control",
};

function selectPhoto() {
  const input = screen.getByLabelText("Select Digital ID photograph");
  fireEvent.change(input, {
    target: { files: [new File(["photo"], "driver.jpg", { type: "image/jpeg" })] },
  });
}

describe("Digital ID photo assignment atomicity", () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ error: null });
    mocks.upload.mockReset().mockResolvedValue({ error: null });
    mocks.remove.mockReset().mockResolvedValue({ error: null });
    mocks.toast.mockReset();
    vi.stubGlobal("crypto", { randomUUID: () => "stable-nonce" });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps the assigned photo if the UI refresh fails after the RPC commits", async () => {
    const onChanged = vi.fn().mockRejectedValue(new Error("Network refresh failed"));
    render(<DigitalIdAdminTools credential={credential} onChanged={onChanged} />);

    selectPhoto();
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "ID photo saved" }),
    ));
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "set_driver_digital_id_photo",
      expect.objectContaining({ p_user_id: credential.user_id }),
    );
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("removes an orphan image if the database rejects its assignment", async () => {
    mocks.rpc.mockResolvedValueOnce({ error: new Error("ADMIN_REQUIRED") });
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<DigitalIdAdminTools credential={credential} onChanged={onChanged} />);

    selectPhoto();
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
    expect(onChanged).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Unable to update ID photo", variant: "destructive" }),
    );
  });
  it("reports a successful upload without removing the referenced photo", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<DigitalIdAdminTools credential={credential} onChanged={onChanged} />);
    selectPhoto();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "ID photograph updated" }),
    ));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("refuses unsupported image formats before uploading or modifying a credential", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<DigitalIdAdminTools credential={credential} onChanged={onChanged} />);
    fireEvent.change(screen.getByLabelText("Select Digital ID photograph"), {
      target: { files: [new File(["hello"], "not-an-image.txt", { type: "text/plain" })] },
    });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Unsupported image", variant: "destructive" }),
    ));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("allows authorised admins to remove an existing photograph via the RPC", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<DigitalIdAdminTools credential={{ ...credential, photo_path: "org/driver/photo.jpg" }} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: /Remove photo/i }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith(
      "set_driver_digital_id_photo",
      { p_user_id: credential.user_id, p_photo_path: null },
    ));
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "ID photograph removed" }),
    );
  });

  it("does not upload photos for a credential without an organisation", async () => {
    const onChanged = vi.fn().mockResolvedValue(undefined);
    render(<DigitalIdAdminTools credential={{ ...credential, org_id: null }} onChanged={onChanged} />);
    selectPhoto();
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Missing organisation", variant: "destructive" }),
    ));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
