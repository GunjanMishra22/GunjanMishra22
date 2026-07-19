// sw.js — Service Worker: makes the entire app work with zero network
// connection after the first successful visit. Cache-first for the app
// shell (everything the app needs to run), with automatic cleanup of
// old versions on update.
//
// IMPORTANT: bump CACHE_VERSION whenever any shipped file changes, so
// returning users get the new version instead of a stale cached one.
const CACHE_VERSION = "novel-app-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./db.js",
  "./export.js",
  "./styles.css",
  "./manifest.json",
  "./fonts/crimson-pro-400.woff",
  "./fonts/crimson-pro-700.woff",
  "./fonts/crimson-pro-400-italic.woff",
  "./fonts/lora-400.woff",
  "./fonts/lora-500.woff",
  "./fonts/lora-400-italic.woff",
  "./fonts/libre-baskerville-400.woff",
  "./fonts/handwritten-600.woff",
  "./fonts/work-sans-500.woff",
  "./fonts/work-sans-600.woff",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // Cache each file individually rather than cache.addAll(), so one
      // missing/renamed file (e.g. during future edits) can't silently
      // fail the entire install and leave the app uncached.
      await Promise.all(
        APP_SHELL.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-cache" });
            if (res.ok) await cache.put(url, res);
          } catch (e) {
            console.warn("SW: failed to precache", url, e);
          }
        })
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(req, { ignoreSearch: true });

      // Cache-first: instant, fully offline. Refresh the cache in the
      // background when a connection happens to be available, so the
      // app quietly stays current without ever blocking on network.
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        networkFetch; // fire and forget refresh
        return cached;
      }

      const fresh = await networkFetch;
      if (fresh) return fresh;

      // Fully offline and not cached: for a navigation request, fall
      // back to the cached app shell so the app still opens.
      if (req.mode === "navigate") {
        const shell = await cache.match("./index.html");
        if (shell) return shell;
      }
      return new Response("Offline and this file isn't cached yet.", { status: 503 });
    })()
  );
});
