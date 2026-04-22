// src/lib/evidenceQueueBus.ts
//
// Tiny pub/sub bus for evidence-queue mutation events, with optional
// cross-tab fan-out via BroadcastChannel.
//
// Why this exists:
//   Multiple surfaces (PendingUploads, JobDetail, InspectionFlow review)
//   render <EvidenceStatusBadges/> reading the same IndexedDB queue. We
//   want every badge — in this tab AND in any other open tab on the
//   same origin — to reflect a queue mutation immediately, without
//   each surface owning its own polling loop.
//
// Contract:
//   - Any code that mutates the queue (retry terminal transitions,
//     prune, discard, promote, purge, delete) calls
//     `notifyEvidenceQueueChanged()` once after the mutation completes.
//   - Notification is emitted from the canonical lifecycle layer
//     (`pendingUploads.ts`) so screens never have to hand-wire it.
//   - `useEvidenceQueueVersion()` returns a number that increments on
//     every notify; components depend on it to trigger a re-read.
//
// Cross-tab:
//   When BroadcastChannel is available, each notify is fan-out to a
//   shared "axentra-evidence-queue" channel. Other tabs receive it
//   and bump their local version, so badges stay consistent across
//   tabs. Tabs without BroadcastChannel (older browsers) still work
//   correctly within their own tab — they simply don't sync across
//   tabs, which is a graceful degradation, not a regression.
//
// This is intentionally not a full state store — the source of truth
// stays in IndexedDB. The bus only signals "something changed, re-read".

import { useSyncExternalStore } from "react";

let version = 0;
const listeners = new Set<() => void>();

const CHANNEL_NAME = "axentra-evidence-queue";
type Channel = { postMessage: (msg: unknown) => void; close: () => void };
let channel: Channel | null = null;

function getChannel(): Channel | null {
  if (channel) return channel;
  if (typeof window === "undefined") return null;
  const BC = (window as unknown as { BroadcastChannel?: typeof BroadcastChannel })
    .BroadcastChannel;
  if (!BC) return null;
  try {
    const bc = new BC(CHANNEL_NAME);
    bc.onmessage = () => bumpLocal();
    channel = bc as unknown as Channel;
    return channel;
  } catch {
    return null;
  }
}

function bumpLocal(): void {
  version++;
  for (const l of listeners) {
    try { l(); } catch { /* swallow listener errors */ }
  }
}

/**
 * Bump the version, notify all in-tab subscribers, AND broadcast to
 * other tabs on the same origin (when BroadcastChannel is supported).
 */
export function notifyEvidenceQueueChanged(): void {
  bumpLocal();
  const ch = getChannel();
  if (ch) {
    try { ch.postMessage({ t: Date.now() }); } catch { /* ignore */ }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Lazily wire the cross-tab channel on first subscription.
  getChannel();
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
  if (channel) {
    try { channel.close(); } catch { /* ignore */ }
    channel = null;
  }
}
