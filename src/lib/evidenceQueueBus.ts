// src/lib/evidenceQueueBus.ts
//
// Tiny pub/sub bus for evidence-queue mutation events.
//
// Why this exists:
//   Multiple surfaces (PendingUploads, JobDetail, InspectionFlow review)
//   render <EvidenceStatusBadges/> reading the same IndexedDB queue. We
//   want every badge to reflect a queue mutation immediately, without
//   each surface owning its own polling loop or its own refreshKey
//   plumbing.
//
// Contract:
//   - Any code that mutates the queue (retry, prune, discard) calls
//     `notifyEvidenceQueueChanged()` once after the mutation completes.
//   - `useEvidenceQueueVersion()` returns a number that increments on
//     every notify; components depend on it to trigger a re-read.
//
// This is intentionally not a full state store — the source of truth
// stays in IndexedDB. The bus only signals "something changed, re-read".

import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

/** Bump the version and notify all subscribers. */
export function notifyEvidenceQueueChanged(): void {
  version++;
  for (const l of listeners) {
    try { l(); } catch { /* swallow listener errors */ }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): number {
  return version;
}

/**
 * Subscribe to queue-change notifications. Returns a monotonically
 * increasing version number that components can pass to a useEffect
 * dependency to re-read the queue.
 */
export function useEvidenceQueueVersion(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test-only. */
export function __resetEvidenceQueueBusForTests(): void {
  version = 0;
  listeners.clear();
}
