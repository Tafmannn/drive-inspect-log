/**
 * Background invoice-pack preparation.
 *
 * Building a draft's pack (invoice PDF, receipts, a POD per job, zip, upload) used to
 * start only when Send was pressed, so the admin watched it run. It now starts as soon
 * as the invoice is created and runs while they review; Send / Mark as sent then reuse
 * the stored pack (prepareInvoiceDelivery returns an already-prepared pack as-is).
 *
 * One build per invoice at a time: a background build and a Send for the same invoice
 * share the same promise, so they never race to upload two packs. A failed build is
 * forgotten, so the next Send simply tries again.
 */
import { useSyncExternalStore } from "react";
import type { InvoiceRecord } from "../hooks/useInvoices";
import type { OrgInvoiceSettings } from "./invoiceDocument";
import { prepareInvoiceDelivery } from "./invoiceDelivery";

export type PackState =
  | { state: "building"; message: string }
  | { state: "ready"; path: string }
  | { state: "failed"; error: string };

const inFlight = new Map<string, Promise<string>>();
const states = new Map<string, PackState>();
const listeners = new Set<() => void>();

function set(id: string, s: PackState) {
  states.set(id, s);
  listeners.forEach((l) => l());
}

/** Prepare (or join the preparation of) a draft invoice's pack. Resolves to the stored PDF path. */
export function preparePackOnce(
  record: InvoiceRecord,
  orgId: string,
  settings?: OrgInvoiceSettings | null,
): Promise<string> {
  const running = inFlight.get(record.id);
  if (running) return running;
  set(record.id, { state: "building", message: "Preparing the invoice pack…" });
  const p = prepareInvoiceDelivery(record, orgId, settings, (message) =>
    set(record.id, { state: "building", message }),
  ).then(
    (path) => {
      set(record.id, { state: "ready", path });
      return path;
    },
    (err: unknown) => {
      set(record.id, { state: "failed", error: err instanceof Error ? err.message : String(err) });
      throw err;
    },
  );
  // Forget the promise once settled: a ready pack is found again from the invoice row,
  // and a failed one is retried by the next caller.
  void p.catch(() => undefined).finally(() => inFlight.delete(record.id));
  inFlight.set(record.id, p);
  return p;
}

/** Start preparing in the background; failures are kept in the status, never thrown. */
export function startPackInBackground(record: InvoiceRecord, orgId: string, settings?: OrgInvoiceSettings | null): void {
  if (record.status !== "draft" || record.document_type === "credit_note") return;
  void preparePackOnce(record, orgId, settings).catch(() => undefined);
}

export function getPackState(id: string | null | undefined): PackState | undefined {
  return id ? states.get(id) : undefined;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Live pack status for one invoice (undefined when nothing has been started this session). */
export function usePackState(id: string | null | undefined): PackState | undefined {
  return useSyncExternalStore(subscribe, () => getPackState(id), () => undefined);
}

/** Test helper. */
export function resetPackPreparation(): void {
  inFlight.clear();
  states.clear();
}
