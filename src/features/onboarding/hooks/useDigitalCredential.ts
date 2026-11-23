import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DigitalIdCredential {
  driver_id: string;
  credential_id: string;
  user_id: string;
  org_id: string | null;
  full_name: string | null;
  employment_type: string | null;
  role_label: string;
  photo_path: string | null;
  credential_version: number;
  status: "active" | "revoked";
  checked_at: string;
  valid_until: string | null;
  company_name: string;
  company_website: string;
  company_phone: string | null;
  issued_by: string;
}

export type DigitalIdDisplayStatus =
  | "loading" | "active" | "grace" | "unavailable" | "revoked" | "missing";

const POLL_MS = 15_000;
export const OFFLINE_GRACE_MS = 30_000;

/**
 * Bound a server-issued validity window using only server timestamps and
 * elapsed request time; works even when the device clock is out of sync.
 */
export function credentialWindowMs(checkedAt: string, validUntil: string | null, requestElapsedMs: number): number {
  const issued = Date.parse(checkedAt);
  const expiry = Date.parse(validUntil ?? "");
  if (!Number.isFinite(issued) || !Number.isFinite(expiry) || expiry <= issued) return 0;
  return Math.max(0, Math.min(OFFLINE_GRACE_MS, expiry - issued - Math.max(0, requestElapsedMs)));
}

type LastValidCheck = {
  monotonicMs: number;
  wallMs: number;
  windowMs: number;
};

/** Remaining validity is bounded both by the server expiry and local receipt time.
 * Use monotonic and wall clocks: changing the phone clock must not extend a badge.
 */
export function remainingCredentialMs(lastCheck: LastValidCheck | null, nowMono: number, nowWall: number): number {
  if (!lastCheck) return 0;
  const elapsed = Math.max(0, nowMono - lastCheck.monotonicMs, nowWall - lastCheck.wallMs);
  return Math.max(0, lastCheck.windowMs - elapsed);
}

/**
 * Server-authoritative company ID. Never persists a credential to PWA caches,
 * React Query, IndexedDB or localStorage; rechecks on app resume.
 */
export function useDigitalCredential(userId: string) {
  const [credential, setCredential] = useState<DigitalIdCredential | null>(null);
  const [status, setStatus] = useState<DigitalIdDisplayStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const latestRequest = useRef(0);
  const lastCheck = useRef<LastValidCheck | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const requestEpoch = epoch.current;
    const requestNumber = ++latestRequest.current;
    const requestStarted = performance.now();
    try {
      const { data, error: rpcError } = await supabase
        .rpc("get_driver_digital_id", { p_user_id: userId });
      if (epoch.current !== requestEpoch || latestRequest.current !== requestNumber) return;
      if (rpcError) throw rpcError;
      if (!data) {
        lastCheck.current = null;
        setCredential(null);
        setStatus("missing");
        setError(null);
        return;
      }
      const next = data as unknown as DigitalIdCredential;
      if (next.status !== "active") {
        lastCheck.current = null;
        setCredential(next);
        setStatus("revoked");
        setError(null);
        return;
      }

      const receivedAtMonotonic = performance.now();
      const allowedWindowMs = credentialWindowMs(
        next.checked_at, next.valid_until, receivedAtMonotonic - requestStarted
      );
      if (allowedWindowMs <= 0) {
        throw new Error("Current authorisation cannot be confirmed");
      }

      lastCheck.current = {
        monotonicMs: receivedAtMonotonic,
        wallMs: Date.now(),
        windowMs: allowedWindowMs,
      };
      setCredential(next);
      setStatus(navigator.onLine ? "active" : "grace");
      setError(null);
    } catch (err) {
      if (epoch.current !== requestEpoch || latestRequest.current !== requestNumber) return;
      const message = err instanceof Error ? err.message : "Unable to check authorisation";
      setError(message);
      if (/ACCOUNT_INACTIVE|CREDENTIAL_UNAVAILABLE|NOT_AUTHORISED|UNAUTHENTICATED/.test(message)) {
        lastCheck.current = null;
        setCredential(null);
        setStatus("revoked");
        return;
      }
      const remaining = remainingCredentialMs(lastCheck.current, performance.now(), Date.now());
      setStatus(remaining > 0 ? "grace" : "unavailable");
    }
  }, [userId]);

  useEffect(() => {
    epoch.current += 1;
    latestRequest.current += 1;
    lastCheck.current = null;
    setCredential(null);
    setError(null);
    setStatus(userId ? "loading" : "missing");
    if (!userId) return;

    void refresh();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void refresh();
    }, POLL_MS);
    const expiry = window.setInterval(() => {
      if (!lastCheck.current) return;
      if (remainingCredentialMs(lastCheck.current, performance.now(), Date.now()) <= 0) {
        setStatus((current) => current === "active" || current === "grace" ? "unavailable" : current);
      }
    }, 500);
    const onOnline = () => void refresh();
    const onOffline = () => {
      setStatus((current) => current === "active" ? "grace" : current);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const remaining = remainingCredentialMs(lastCheck.current, performance.now(), Date.now());
      setStatus((current) =>
        current === "active" || current === "grace"
          ? (remaining > 0 ? "grace" : "unavailable")
          : current
      );
      void refresh();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      epoch.current += 1;
      latestRequest.current += 1;
      window.clearInterval(poll);
      window.clearInterval(expiry);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, userId]);

  return { credential, status, error, refresh };
}
