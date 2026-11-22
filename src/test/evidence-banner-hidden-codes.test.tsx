import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
vi.mock("@/context/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/context/AuthContext")>("@/context/AuthContext");
  return { ...actual, useAuth: () => ({ isAdmin: true, isSuperAdmin: false, user: { id: "u1", roles: ["ADMIN"] } }) };
});
import { EvidenceHealthBanner } from "@/components/ui-kit";

const b = (code: string, message = code) => ({ code, message });

describe("EvidenceHealthBanner hiddenCodes (POD page de-duplication)", () => {
  it("does not repeat rows listed elsewhere, and says where they are", () => {
    render(
      <EvidenceHealthBanner
        level="red"
        title="POD Readiness"
        blockers={[b("missing_pickup_inspection"), b("missing_pickup_photos"), b("only_here")]}
        warnings={[b("low_pickup_photo_count")]}
        hiddenCodes={["missing_pickup_inspection", "missing_pickup_photos", "low_pickup_photo_count"]}
        hiddenNote="Issues are listed in Evidence Health above."
        onAcknowledge={() => {}}
      />,
    );
    expect(screen.queryByText("missing_pickup_inspection")).toBeNull();
    expect(screen.queryByText("low_pickup_photo_count")).toBeNull();
    expect(screen.getByText("only_here")).toBeInTheDocument();
    expect(screen.getByText("Issues are listed in Evidence Health above.")).toBeInTheDocument();
  });

  it("hidden rows still count: level only lightens once ALL blockers are acknowledged", () => {
    const { rerender } = render(
      <EvidenceHealthBanner level="red" blockers={[b("a"), b("b")]} hiddenCodes={["a", "b"]} acknowledgedCodes={["a"]} />,
    );
    expect(screen.getByText(/blocked/i)).toBeInTheDocument();
    rerender(<EvidenceHealthBanner level="red" blockers={[b("a"), b("b")]} hiddenCodes={["a", "b"]} acknowledgedCodes={["a", "b"]} />);
    expect(screen.queryByText(/blocked/i)).toBeNull();
    // acknowledged rows are hidden too (they're listed in the other banner)
    expect(screen.queryByText(/Acknowledged by admin/)).toBeNull();
  });

  it("without hiddenCodes nothing changes", () => {
    const ack = vi.fn();
    render(<EvidenceHealthBanner level="red" blockers={[b("a", "Alpha")]} warnings={[b("w", "Warn")]} onAcknowledge={ack} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Warn")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Acknowledge/ }));
    expect(ack).toHaveBeenCalledWith("a");
  });
});
