const CACHE_VERSION = "helloai-shell-v3";
const OFFLINE_URL = "/offline";
const SHELL = [
  "/",
  OFFLINE_URL,
  "/privacy",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

async function cacheShell() {
  const cache = await caches.open(CACHE_VERSION);
  await Promise.allSettled(SHELL.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    if (response.ok && response.type === "basic") await cache.put(url, response);
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => undefined);
    await self.clients.claim();
  })());
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
        const preload = await event.preloadResponse;
        const response = preload || await fetch(request);
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(CACHE_VERSION);
          event.waitUntil(cache.put(request, response.clone()));
        }
        return response;
      } catch {
        return (await caches.match(request)) || (await caches.match("/")) || (await caches.match(OFFLINE_URL));
      }
    })());
    return;
  }

  if (["style", "script", "font", "image", "manifest"].includes(request.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const network = fetch(request).then(async (response) => {
        if (response.ok && response.type === "basic") {
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
