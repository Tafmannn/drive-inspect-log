import { pass, fail, notExecuted } from "../lib/types.mjs";
import { liveEnv, missingLiveReason } from "../lib/env.mjs";

// Suite 15 — Realtime reachability smoke (LIVE, HTTP/WebSocket).
// The admin attention queues subscribe to postgres_changes on
// public.attention_acknowledgements. This suite confirms the Realtime endpoint
// is reachable and accepts a websocket upgrade with the anon key. It does NOT
// assert end-to-end delivery (that needs a seeded mutation + signed-in admin);
// that remains a manual staging check, flagged below.
export default {
  id: "15",
  name: "Realtime reachability (live)",
  critical: false,
  requiresLiveEnv: true,
  async run() {
    const env = liveEnv();
    const reason = missingLiveReason({ http: true, anonKey: true });
    if (reason) return { checks: [notExecuted("Realtime endpoint reachable", reason)], note: reason };

    const checks = [];
    const wsBase = env.supabaseUrl.replace(/^http/, "ws").replace(/\/+$/, "");
    const wsUrl = `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(env.anonKey)}&vsn=1.0.0`;

    if (typeof WebSocket === "undefined") {
      return {
        checks: [
          notExecuted(
            "Realtime endpoint reachable",
            "global WebSocket not available in this Node runtime — run on Node 22+ or provide a ws polyfill",
          ),
        ],
        note: "no WebSocket global",
      };
    }

    const result = await new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      let sock;
      try {
        sock = new WebSocket(wsUrl);
      } catch (e) {
        return done({ ok: false, detail: String(e?.message || e) });
      }
      const t = setTimeout(() => {
        try {
          sock.close();
        } catch {}
        done({ ok: false, detail: "timed out waiting for websocket open (8s)" });
      }, 8000);
      sock.onopen = () => {
        clearTimeout(t);
        try {
          sock.close();
        } catch {}
        done({ ok: true, detail: "websocket upgrade accepted" });
      };
      sock.onerror = (e) => {
        clearTimeout(t);
        done({ ok: false, detail: `websocket error: ${e?.message || "connection failed"}` });
      };
    });

    checks.push(
      result.ok
        ? pass("Realtime endpoint reachable", result.detail)
        : fail("Realtime endpoint reachable", result.detail),
    );
    checks.push(
      notExecuted(
        "End-to-end attention_acknowledgements delivery",
        "MANUAL: insert an acknowledgement on staging and confirm an admin queue updates live",
      ),
    );
    return { checks };
  },
};
