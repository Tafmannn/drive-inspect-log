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
  | "loading"
  | "active"
  | "grace"
  | "unavailable"
  | "revoked"
  | "missing";

const POLL_MS = 15_000;
export const OFFLINE_GRACE_MS = 30_000;

/**
 * Authenticated, server-authoritative digital-ID lookup.
 * No credentials are persisted in React Query, localStorage, IndexedDB, or
 * service-worker caches; page resume always requests a fresh server result.
 */
export function useDigitalCredential(userId: string) {
  const [credential, setCredential] = useState<DigitalIdCredential | null>(null);
  const [status, setStatus] = useState<DigitalIdDisplayStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const checkedAtMonotonic = useRef<number | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId || inFlight.current) return;
    const requestGeneration = generation.current;
    inFlight.current = true;
    try {
      // RPC is intentionally scoped to authenticated users. Server verifies
      // account/organisation permissions and computes status on every call.
      const { data, error: rpcError } = await (supabase as any)
        .rpc("get_driver_digital_id", { p_user_id: userId });
      if (generation.current !== requestGeneration) return;
      if (rpcError) throw rpcError;
      if (!data) {
        setCredential(null);
        setStatus("missing");
        setError(null);
        checkedAtMonotonic.current = null;
        return;
      }

      const next = data as DigitalIdCredential;
      if (next.status !== "active") {
        setCredential(next);
        setStatus("revoked");
        checkedAtMonotonic.current = null;
        setError(null);
        return;
      }
      // A successful network response is the only way to grant "active".
      if (!next.valid_until || Date.parse(next.valid_until) <= Date.parse(next.checked_at)) {
        throw new Error("Invalid credential validity window");
      }
      checkedAtMonotonic.current = performance.now();
      setCredential(next);
      setStatus("active");
      setError(null);
    } catch (err) {
      if (generation.current !== requestGeneration) return;
      const message = err instanceof Error ? err.message : "Unable to check authorisation";
      setError(message);
      if (/ACCOUNT_INACTIVE|CREDENTIAL_UNAVAILABLE|NOT_AUTHORISED|UNAUTHENTICATED/.test(message)) {
        checkedAtMonotonic.current = null;
        setCredential(null);
        setStatus("revoked");
        return;
      }
      setStatus((previous) => {
        if (checkedAtMonotonic.current == null) return "unavailable";
        return previous === "revoked" ? previous : "grace";
      });
    } finally {
      inFlight.current = false;
    }
  }, [userId]);

  useEffect(() => {
    generation.current += 1;
    checkedAtMonotonic.current = null;
    inFlight.current = false;
    setCredential(null);
    setError(null);
    setStatus("loading");
    if (!userId) {
      setStatus("missing");
      return;
    }

    void refresh();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void refresh();
      }
    }, POLL_MS);
    const expire = window.setInterval(() => {
      if (checkedAtMonotonic.current === null) return;
      if (performance.now() - checkedAtMonotonic.current >= OFFLINE_GRACE_MS) {
        setStatus((previous) =>
          previous === "active" || previous === "grace" ? "unavailable" : previous
        );
      }
    }, 500);
    const onOnline = () => void refresh();
    const onOffline = () => {
      setStatus((previous) => previous === "active" ? "grace" : previous);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Never show a stale green status after the app resumes.
        setStatus((previous) => previous === "active" ? "grace" : previous);
        void refresh();
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      generation.current += 1;
      window.clearInterval(poll);
      window.clearInterval(expire);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh, userId]);

  return { credential, status, error, refresh };
}
