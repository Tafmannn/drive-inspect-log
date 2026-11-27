import { describe, it, expect } from "vitest";
import { summariseReadyToBill } from "@/features/invoicing/lib/readyToBill";

const approved = { finance_status: "approved", approved_amount: 240, reopened_at: null };

describe("summariseReadyToBill", () => {
  it("groups un-invoiced completed jobs and approved Aborts by client, largest value first", () => {
    const rows = [
      { id: "r1", client_id: "rev", status: "completed" },
      { id: "r2", client_id: "rev", status: "completed" },
      { id: "r3", client_id: "rev", status: "aborted" },
      { id: "m1", client_id: "mov", status: "closed" },
      { id: "inv", client_id: "mov", status: "completed" },
    ];
    const prices = new Map<string, number | null>([["r1", 120], ["r2", 220], ["m1", 110], ["inv", 999]]);
    const out = summariseReadyToBill(rows, prices, new Map([["r3", approved]]), new Set(["inv"]));
    expect(out.clients).toEqual([
      { clientId: "rev", jobs: 3, value: 580, unpriced: 0 },
      { clientId: "mov", jobs: 1, value: 110, unpriced: 0 },
    ]);
    expect(out.unlinked).toBe(0);
  });

  it("counts an unpriced job but never values it at zero", () => {
    const out = summariseReadyToBill(
      [{ id: "a", client_id: "c", status: "completed" }, { id: "b", client_id: "c", status: "completed" }],
      new Map<string, number | null>([["a", null], ["b", 0]]),
      new Map(),
      new Set(),
    );
    expect(out.clients).toEqual([{ clientId: "c", jobs: 2, value: 0, unpriced: 2 }]);
  });

  it("leaves out Aborts whose fee is pending, rejected, nil or reopened, and counts unlinked jobs", () => {
    const out = summariseReadyToBill(
      [
        { id: "p", client_id: "c", status: "aborted" },
        { id: "n", client_id: "c", status: "aborted" },
        { id: "o", client_id: "c", status: "aborted" },
        { id: "x", client_id: "c", status: "aborted" },
        { id: "u", client_id: null, status: "completed" },
      ],
      new Map([["u", 100]]),
      new Map([
        ["p", { finance_status: "pending_review", approved_amount: null }],
        ["n", { finance_status: "approved", approved_amount: 0 }],
        ["o", { ...approved, reopened_at: "2026-11-25" }],
      ]),
      new Set(),
    );
    expect(out.clients).toEqual([]);
    expect(out.unlinked).toBe(1);
  });
});
