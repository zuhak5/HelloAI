const CACHE_VERSION = "helloai-shell-v2";
const SHELL = ["/", "/offline", "/privacy", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

async function cacheShell() {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.allSettled(SHELL.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    if (response.ok) await cache.put(url, response);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("/")) || (await caches.match("/offline"));
      }
    })());
    return;
  }

  if (["style", "script", "font", "image"].includes(request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const network = fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }
        return response;
      });
      if (cached) {
        event.waitUntil(network.catch(() => undefined));
        return cached;
      }
      return network;
    })());
  }
});
