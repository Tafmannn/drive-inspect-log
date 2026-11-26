/**
 * Attention queue acknowledgement: dismissing or snoozing an exception only
 * records a tenant-scoped acknowledgement through the RPC. It never touches
 * evidence, and refuses when the exception's organisation is unknown.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AttentionException } from "@/features/attention/types/exceptionTypes";

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  toasts: [] as { title?: string; description?: string; variant?: string }[],
  invalidations: [] as unknown[][],
  user: { id: "admin-1" } as { id: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: h.rpc, from: h.from } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => h.toasts.push(t) }));
vi.mock("@/lib/mutationEvents", () => ({
  invalidateForEvent: (_qc: unknown, event: string, extra: unknown[]) => h.invalidations.push([event, extra]),
}));

import { AttentionQueue } from "@/features/attention/components/AttentionQueue";

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
const ex = (over: Partial<AttentionException> = {}): AttentionException => ({
  id: "evidence:job-1", orgId: "org-A", jobId: "job-1", category: "evidence", severity: "high",
  title: "Missing delivery photos", detail: "No delivery photos", createdAt: hoursAgo(2),
  actionLabel: "Open job", actionRoute: "/jobs/job-1", ...over,
});

function renderQueue(exceptions: AttentionException[], acknowledged = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AttentionQueue exceptions={exceptions} showOrg loading={false} acknowledged={acknowledged} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openAndSubmit(button: RegExp, note: string, submit: string) {
  fireEvent.click(screen.getByRole("button", { name: button }));
  const dialog = within(await screen.findByRole("dialog"));
  const confirm = dialog.getByRole("button", { name: submit }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true); // a note is mandatory
  fireEvent.change(dialog.getByRole("textbox"), { target: { value: note } });
  fireEvent.click(confirm);
}

beforeEach(() => {
  h.rpc.mockReset().mockResolvedValue({ error: null });
  h.from.mockReset();
  h.toasts = [];
  h.invalidations = [];
  h.user = { id: "admin-1" };
});

describe("AttentionQueue acknowledgements", () => {
  it("acknowledges through the tenant-scoped RPC only, never writing evidence tables", async () => {
    renderQueue([ex()]);
    await openAndSubmit(/Ack/, "Photos are on the paper POD", "Acknowledge");
    await waitFor(() => expect(h.rpc).toHaveBeenCalledTimes(1));
    expect(h.rpc).toHaveBeenCalledWith("acknowledge_attention_exception", {
      p_exception_id: "evidence:job-1", p_job_id: "job-1", p_org_id: "org-A",
      p_note: "Photos are on the paper POD", p_snoozed_until: undefined,
    });
    expect(h.from).not.toHaveBeenCalled();
    await waitFor(() => expect(h.toasts[0].title).toBe("Acknowledged"));
    expect(h.invalidations).toEqual([["evidence_resolved", [["job", "job-1"]]]]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("snoozes for 24 hours", async () => {
    const before = Date.now();
    renderQueue([ex({ jobId: undefined, id: "billing:org-A" })]);
    await openAndSubmit(/24h/, "Chasing client", "Snooze");
    await waitFor(() => expect(h.rpc).toHaveBeenCalled());
    const args = h.rpc.mock.calls[0][1];
    const until = new Date(args.p_snoozed_until).getTime();
    expect(until - before).toBeGreaterThanOrEqual(24 * 3_600_000 - 1000);
    expect(until - before).toBeLessThanOrEqual(24 * 3_600_000 + 5000);
    await waitFor(() => expect(h.toasts[0].title).toBe("Snoozed for 24h"));
    expect(h.invalidations).toEqual([["evidence_resolved", [["attention-center"]]]]);
  });

  it("refuses when neither the job nor the organisation is known", async () => {
    renderQueue([ex({ jobId: undefined, orgId: undefined })]);
    await openAndSubmit(/Ack/, "Done", "Acknowledge");
    await waitFor(() => expect(h.toasts[0]).toMatchObject({
      title: "Failed", description: "The organisation for this exception could not be verified.", variant: "destructive",
    }));
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("reports a server refusal (e.g. another organisation's exception) and keeps the dialog open", async () => {
    h.rpc.mockResolvedValue({ error: { message: "permission denied" } });
    renderQueue([ex()]);
    await openAndSubmit(/Ack/, "Not mine", "Acknowledge");
    await waitFor(() => expect(h.toasts[0]).toMatchObject({ title: "Failed", description: "permission denied" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(h.invalidations).toEqual([]);
  });

  it("does nothing without a signed-in user", async () => {
    h.user = null;
    renderQueue([ex()]);
    await openAndSubmit(/Ack/, "note", "Acknowledge");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("closes the dialog on cancel without recording anything", async () => {
    renderQueue([ex()]);
    fireEvent.click(screen.getByRole("button", { name: /Ack/ }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("hides acknowledgement actions on already-acknowledged items but keeps the primary action", () => {
    renderQueue([ex()], true);
    expect(screen.queryByRole("button", { name: /Ack/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Open job" })).toBeTruthy();
  });

  it("escalates by age", () => {
    renderQueue([
      ex({ id: "a", title: "Fresh", createdAt: hoursAgo(1) }),
      ex({ id: "b", title: "Day old", createdAt: hoursAgo(30) }),
      ex({ id: "c", title: "Stale", createdAt: hoursAgo(80) }),
    ]);
    expect(screen.getAllByText("ESCALATED")).toHaveLength(1);
    expect(screen.getAllByText("URGENT")).toHaveLength(1);
  });
});
