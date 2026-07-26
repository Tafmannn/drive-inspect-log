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
