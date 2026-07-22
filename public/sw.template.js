/*
 * Heirloom service worker. App-shell + offline fallback + Web Push.
 *
 *  - Static fingerprinted assets (Next.js _next/static, icons, fonts):
 *    cache-first.
 *  - Everything else (pages, /api/*): network-first with stale fallback.
 *  - POST/PUT/PATCH/DELETE: never cached.
 */

const VERSION = "heirloom-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IS_DEV = new URL(self.location.href).searchParams.get("dev") === "1";

const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/seal.png",
];

self.addEventListener("install", (event) => {
  if (IS_DEV) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_ASSETS).catch(() => {
        // tolerate partial failures; the precache is a best-effort warm-up
      })
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  // In dev the SW exists only to wire push + notificationclick. Don't
  // intercept fetches, so Next HMR + content-addressed chunks aren't
  // shadowed by a stale cache.
  if (IS_DEV) return;

  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // SSE / long-running streams must always go straight to the network.
  if (req.headers.get("accept")?.includes("text/event-stream")) return;

  // Static, fingerprinted Next.js assets - cache-first.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    /\.(png|svg|woff2?|ico|webp|jpg)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Everything else (pages, JSON) - network-first with a stale fallback.
  event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return hit ?? Response.error();
  }
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && req.url.startsWith(self.location.origin)) {
      cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    const fallback = await cache.match(req);
    if (fallback) return fallback;
    if (req.mode === "navigate") {
      const shell = await caches.open(SHELL_CACHE);
      const home = await shell.match("/");
      if (home) return home;
    }
    return Response.error();
  }
}

// Web Push - sealed-letter unlocks + daily memory.
// Payload (JSON, server-supplied): { title, body, url?, tag? }
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Heirloom", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Heirloom";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if ("focus" in w) {
            w.navigate(target);
            return w.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      })
  );
});
