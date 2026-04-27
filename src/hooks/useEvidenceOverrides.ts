/**
 * useEvidenceOverrides — session-scoped admin acknowledgements for
 * Operational Health blockers.
 *
 * UI-only override: acknowledged blocker codes are stored per scope key
 * (e.g. job id) in sessionStorage so they survive a tab refresh but not
 * a logout. They are NOT persisted to the database and do NOT change
 * podReadiness/evidenceHealth at the source — call sites combine the
 * acknowledgements with readiness flags to decide whether to unlock a
 * downstream action (e.g. "Approve POD").
 *
 * Defense-in-depth only — never the sole authorization check.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "axentra:evidence-override:";

function readStored(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeStored(key: string, codes: string[]): void {
  if (typeof window === "undefined") return;
  try {
    if (codes.length === 0) {
      window.sessionStorage.removeItem(STORAGE_PREFIX + key);
    } else {
      window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(codes));
    }
  } catch {
    /* storage unavailable — no-op */
  }
}

export interface UseEvidenceOverridesResult {
  /** Set of acknowledged blocker codes for this scope. */
  acknowledgedCodes: string[];
  /** Acknowledge a single blocker code (idempotent). */
  acknowledge: (code: string) => void;
  /** Remove a single acknowledgement (idempotent). */
  unacknowledge: (code: string) => void;
  /** Clear all acknowledgements for this scope. */
  clear: () => void;
  /** True when the given code is acknowledged. */
  isAcknowledged: (code: string) => boolean;
}

/**
 * @param scopeKey  Stable identifier for the scope (e.g. job id, "invoice:<jobId>").
 *                  Pass empty string to disable persistence.
 */
export function useEvidenceOverrides(scopeKey: string): UseEvidenceOverridesResult {
  const [codes, setCodes] = useState<string[]>(() => (scopeKey ? readStored(scopeKey) : []));

  // Re-hydrate when the scope changes (e.g. navigating between jobs).
  useEffect(() => {
    setCodes(scopeKey ? readStored(scopeKey) : []);
  }, [scopeKey]);

  const acknowledge = useCallback((code: string) => {
    if (!code) return;
    setCodes((prev) => {
      if (prev.includes(code)) return prev;
      const next = [...prev, code];
      if (scopeKey) writeStored(scopeKey, next);
      return next;
    });
  }, [scopeKey]);

  const unacknowledge = useCallback((code: string) => {
    setCodes((prev) => {
      if (!prev.includes(code)) return prev;
      const next = prev.filter((c) => c !== code);
      if (scopeKey) writeStored(scopeKey, next);
      return next;
    });
  }, [scopeKey]);

  const clear = useCallback(() => {
    setCodes([]);
    if (scopeKey) writeStored(scopeKey, []);
  }, [scopeKey]);

  const isAcknowledged = useCallback((code: string) => codes.includes(code), [codes]);

  return { acknowledgedCodes: codes, acknowledge, unacknowledge, clear, isAcknowledged };
}
