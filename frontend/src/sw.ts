/// <reference lib="webworker" />
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { StaleWhileRevalidate, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

declare const self: ServiceWorkerGlobalScope;

const manifest = self.__WB_MANIFEST;
precacheAndRoute(manifest);

// SPA navigation fallback: any route (e.g. /tasks) that isn't itself precached still
// resolves to the cached app shell offline, instead of failing to load entirely.
// NavigationRoute only matches page navigations (mode: "navigate"), never the app's
// data fetches to the API's separate origin, so those still surface a real network error.
// createHandlerBoundToURL throws synchronously if its URL isn't in the precache manifest,
// which is empty in dev mode (devOptions doesn't generate one) — guard so dev doesn't crash
// the whole service worker at evaluation time.
if (manifest.length > 0) {
  registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));
}

// Google Fonts: stylesheet checked fresh when online (falls back to cache offline),
// the actual font files cached long-term since they're immutable per URL.
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({ cacheName: "google-fonts-stylesheets" }),
);
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 365, maxEntries: 30 }),
    ],
  }),
);

self.skipWaiting();
self.addEventListener("activate", () => {
  self.clients.claim();
});

// Push notification groundwork: no backend push infrastructure exists yet
// (no VAPID keys, no subscription storage, nothing sends a real push). This
// listener proves the display pipeline end to end so a later phase only has
// to wire up the sending side.
self.addEventListener("push", (event: PushEvent) => {
  let title = "LifeOs";
  let body = "You have a new notification.";
  if (event.data) {
    try {
      const payload = event.data.json();
      title = payload.title ?? title;
      body = payload.body ?? body;
    } catch {
      body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("/");
    }),
  );
});
