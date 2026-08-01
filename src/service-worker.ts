/// <reference lib="webworker" />
/**
 * Axentra offline app shell.
 *
 * Scope is deliberately narrow: precache the BUILT SHELL (js/css/html/icons)
 * so the installed app opens with no signal, and serve document navigations
 * from that shell. There is NO runtime caching — Supabase REST/auth/storage,
 * edge functions and every other data request pass straight through to the
 * network (cross-origin requests are untouched by design, and same-origin
 * non-navigation requests only ever hit the precache by exact URL match).
 * Inspection evidence keeps its own offline queue in the app; the worker
 * never interferes with it.
 *
 * The push / notificationclick handlers land here in the push PR.
 */
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

declare let self: ServiceWorkerGlobalScope;

// Injected at build time by vite-plugin-pwa (injectManifest).
precacheAndRoute(self.__WB_MANIFEST);

// Old precache versions are deleted on activate, so a bad deploy is fully
// replaced by the next good one (recovery: ship a fix and the client swaps
// to it on the next update prompt; emergency: unregister via DevTools →
// Application → Service Workers, or push a build with a pass-through worker).
cleanupOutdatedCaches();

// SPA fallback: real page navigations get the cached shell, mirroring the
// vercel.json/_redirects rewrite. The denylist keeps anything API-shaped
// from ever receiving cached HTML.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//, /^\/functions\//, /^\/rest\//, /^\/auth\//, /^\/storage\//],
  }),
);

// The update prompt's "Update now" sends SKIP_WAITING; the page reloads once
// the new worker takes control. Never called while an inspection is active —
// the prompt itself is suppressed on those routes.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

// ── Web Push ────────────────────────────────────────────────────────────
// Payloads are validated (type whitelist, uuid job id, length caps) before
// anything is shown; the click destination is always an internal job route
// derived from the validated id — never a URL taken from the payload.
import { parsePushPayload, clickUrlFor } from "./lib/pushPayload";

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event.data?.text() ?? "");
  if (!payload) return;
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/axentra-app-icon.png",
      badge: "/axentra-app-icon.png",
      tag: `${payload.type}-${payload.jobId}`,
      data: { jobId: payload.jobId, type: payload.type },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { jobId?: unknown; type?: unknown };
  const url = clickUrlFor(data?.jobId, data?.type);
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prefer focusing an existing app window and navigating it.
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await (client as WindowClient).navigate(url);
            } catch {
              // Ignore — the window is focused either way.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
