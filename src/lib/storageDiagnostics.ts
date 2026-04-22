// src/lib/storageDiagnostics.ts
//
// Diagnostics for the local photo persistence layer (IndexedDB).
//
// The inspection submit flow REQUIRES that every captured photo be durably
// persisted to IndexedDB before the inspection RPC fires. If local
// persistence fails we MUST abort — submitting with memory-only photos
// would let an iOS Safari tab eviction / refresh / crash silently destroy
// evidence and leave a "submitted" inspection with no proof.
//
// This module:
//   1. Classifies raw storage errors into actionable categories.
//   2. Provides user-friendly recovery copy per category.
//   3. Exposes a lightweight pre-flight probe so the review screen can
//      warn drivers BEFORE they try to submit.

import { get, set, del, createStore } from "idb-keyval";
import { logClientEvent } from "./logger";

export type StorageFailureKind =
  | "quota_exceeded"      // QuotaExceededError / NS_ERROR_DOM_QUOTA_REACHED
  | "private_mode"        // Safari private browsing blocks IDB writes
  | "blocked"             // Cookies/site data disabled, ITP, or security policy
  | "unsupported"         // No IDB available at all
  | "transient"           // Timeout, abort, network-ish
  | "unknown";

export interface StorageFailure {
  kind: StorageFailureKind;
  title: string;
  description: string;
  /** Recovery steps tailored per kind, plain-English, mobile-safe. */
  recovery: string[];
  /** Original raw error message — kept verbatim for logs only. */
  raw: string;
}

// ─────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────

/**
 * Map a raw error (Error | string | unknown) to a structured StorageFailure.
 * Never throws — always returns *something*, defaulting to "unknown".
 */
export function classifyStorageError(err: unknown): StorageFailure {
  const raw = errMessage(err);
  const lower = raw.toLowerCase();
  const name = (err as { name?: string } | null)?.name?.toLowerCase() ?? "";

  if (
    name === "quotaexceedederror" ||
    lower.includes("quota") ||
    lower.includes("ns_error_dom_quota_reached") ||
    lower.includes("disk is full")
  ) {
    return {
      kind: "quota_exceeded",
      title: "Device storage is full",
      description:
        "There is not enough free space on your device to save the photos. The inspection has NOT been submitted.",
      recovery: [
        "Free up space (delete unused apps, photos, or cached websites).",
        "Then return to this screen and tap Submit Report again.",
      ],
      raw,
    };
  }

  if (
    lower.includes("private") ||
    lower.includes("a mutation operation was attempted on a database that did not allow mutations") ||
    lower.includes("the user denied permission") ||
    name === "invalidstateerror"
  ) {
    return {
      kind: "private_mode",
      title: "Private Browsing blocks photo saving",
      description:
        "Safari Private Browsing prevents this app from safely storing your photos. The inspection has NOT been submitted.",
      recovery: [
        "Open this site in a normal Safari tab (not Private).",
        "Or switch off Private Browsing in Safari, then resubmit.",
      ],
      raw,
    };
  }

  if (
    lower.includes("securityerror") ||
    name === "securityerror" ||
    lower.includes("blocked") ||
    lower.includes("not allowed") ||
    lower.includes("cookies") ||
    lower.includes("site data") ||
    lower.includes("third-party")
  ) {
    return {
      kind: "blocked",
      title: "Browser is blocking local storage",
      description:
        "Your browser settings are stopping this app from storing photos locally. The inspection has NOT been submitted.",
      recovery: [
        "Settings → Safari → make sure 'Block All Cookies' is OFF.",
        "Settings → Safari → Advanced → keep 'Website Data' enabled.",
        "Then reload the page and resubmit.",
      ],
      raw,
    };
  }

  if (
    lower.includes("indexeddb is not defined") ||
    lower.includes("indexeddb undefined") ||
    lower.includes("not supported")
  ) {
    return {
      kind: "unsupported",
      title: "Browser does not support local storage",
      description:
        "This browser cannot store photos safely for upload. The inspection has NOT been submitted.",
      recovery: [
        "Use the latest version of Safari or Chrome.",
        "Avoid in-app browsers (e.g. Facebook, WhatsApp) — open in Safari instead.",
      ],
      raw,
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("aborted") ||
    name === "aborterror" ||
    lower.includes("transaction") && lower.includes("inactive")
  ) {
    return {
      kind: "transient",
      title: "Could not save photos right now",
      description:
        "A temporary error stopped the photos from being saved. The inspection has NOT been submitted.",
      recovery: [
        "Wait a few seconds and tap Submit Report again.",
        "If it keeps failing, close other tabs and reload the app.",
      ],
      raw,
    };
  }

  return {
    kind: "unknown",
    title: "Photos could not be saved locally",
    description:
      "Something stopped the photos from being saved on your device. The inspection has NOT been submitted.",
    recovery: [
      "Reload the page and try again.",
      "Free up some device storage.",
      "If the problem continues, contact your admin.",
    ],
    raw,
  };
}

function errMessage(err: unknown): string {
  if (!err) return "";
  if (err instanceof Error) return err.message || err.name || "Error";
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

// ─────────────────────────────────────────────────────────────────────
// Pre-flight probe
// ─────────────────────────────────────────────────────────────────────

export type StorageHealth =
  | { status: "ok" }
  | { status: "at_risk"; failure: StorageFailure }
  | { status: "blocked"; failure: StorageFailure };

const PROBE_STORE = createStore("axentra-storage-probe", "v1");
const PROBE_KEY = "__probe__";

/**
 * Attempt a tiny write+read+delete cycle against IndexedDB.
 *  - "ok"      → IDB is writable; submission can proceed.
 *  - "at_risk" → IDB worked but with warnings (currently unused; reserved
 *                for future near-quota detection via StorageManager.estimate).
 *  - "blocked" → IDB write/read failed; submission MUST be blocked.
 *
 * Always logs the result via logClientEvent for forensic visibility.
 */
export async function probeLocalStorageHealth(): Promise<StorageHealth> {
  // Detect IDB availability up front
  if (typeof indexedDB === "undefined") {
    const failure = classifyStorageError(new Error("IndexedDB is not supported"));
    void logClientEvent("storage_probe_failed", "error", {
      source: "storage",
      type: "upload",
      context: { kind: failure.kind, raw: failure.raw, phase: "probe" },
    });
    return { status: "blocked", failure };
  }

  const payload = `probe-${Date.now()}-${Math.random()}`;
  try {
    await set(PROBE_KEY, payload, PROBE_STORE);
    const back = await get<string>(PROBE_KEY, PROBE_STORE);
    await del(PROBE_KEY, PROBE_STORE).catch(() => {});
    if (back !== payload) {
      throw new Error("Storage round-trip mismatch (read returned different value than written)");
    }
    return { status: "ok" };
  } catch (err) {
    const failure = classifyStorageError(err);
    void logClientEvent("storage_probe_failed", "error", {
      source: "storage",
      type: "upload",
      context: { kind: failure.kind, raw: failure.raw, phase: "probe" },
    });
    return { status: "blocked", failure };
  }
}

/**
 * Convenience: classify + structured-log a storage failure that occurred
 * during a real inspection submit. Use in the failPreflight handler.
 */
export function logStorageSubmitFailure(
  err: unknown,
  ctx: { jobId: string; inspectionType: string; queuedSoFar: number },
): StorageFailure {
  const failure = classifyStorageError(err);
  void logClientEvent("inspection_submit_storage_failure", "error", {
    source: "storage",
    type: "upload",
    context: { kind: failure.kind, raw: failure.raw, phase: "submit", ...ctx },
  });
  return failure;
}
