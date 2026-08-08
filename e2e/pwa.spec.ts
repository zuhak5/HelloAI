import { expect, test, type Page } from "@playwright/test";

function pngDimensions(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(1, 4).toString()).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function waitForControlledWorker(page: Page) {
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration("/"))), { timeout: 15000 }).toBe(true);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 30000 }).toBe(true);
}

async function seedOfflineConversation(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("helloai-local", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = new Date().toISOString();
    const transaction = db.transaction("conversations", "readwrite");
    transaction.objectStore("conversations").put({
      id: "pwa-offline-fixture",
      title: "Offline PWA fixture",
      createdAt: now,
      updatedAt: now,
      pinned: false,
      archived: false,
      model: "gpt-5.6-luna",
      draft: "Saved locally before going offline",
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    db.close();
  });
}

test("serves a revisioned PWA release, valid manifest, icons, and service worker", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone" });

  for (const [path, expected] of [["/icon-192.png", 192], ["/icon-512.png", 512], ["/icon-maskable-512.png", 512], ["/apple-touch-icon.png", 180]] as const) {
    const response = await request.get(path);
    expect(response.ok(), path).toBeTruthy();
    expect(response.headers()["cache-control"], path).not.toContain("immutable");
    const dimensions = pngDimensions(await response.body());
    expect(dimensions, path).toEqual({ width: expected, height: expected });
  }

  const buildResponse = await request.get("/pwa-build.json");
  expect(buildResponse.ok()).toBeTruthy();
  expect(buildResponse.headers()["cache-control"]).toContain("no-store");
  const buildInfo = await buildResponse.json() as {
    revision: string;
    staticAssetCount: number;
    appShellCount: number;
    staticAssets: string[];
  };
  expect(buildInfo.revision.length).toBeGreaterThan(0);
  expect(buildInfo.staticAssetCount).toBeGreaterThan(0);
  expect(buildInfo.appShellCount).toBeGreaterThan(buildInfo.staticAssetCount);
  expect(buildInfo.staticAssets.some((url) => url.startsWith("/_next/static/") && url.endsWith(".js"))).toBeTruthy();
  expect(buildInfo.staticAssets.some((url) => url.startsWith("/_next/static/") && url.endsWith(".css"))).toBeTruthy();

  const workerResponse = await request.get("/sw.js");
  expect(workerResponse.ok()).toBeTruthy();
  expect(workerResponse.headers()["service-worker-allowed"]).toBe("/");
  expect(workerResponse.headers()["cache-control"]).toContain("no-store");
  const worker = await workerResponse.text();
  expect(worker).toContain("GENERATED FILE. DO NOT EDIT.");
  expect(worker).toContain(`const PWA_BUILD_REVISION = ${JSON.stringify(buildInfo.revision)};`);
  expect(worker).toContain("helloai-precache-");
  expect(worker).toContain("await cache.addAll(requests);");
  expect(worker).toContain('url.pathname.startsWith("/api/")');
  expect(worker).toContain('event.data?.type === "SKIP_WAITING"');
  for (const url of buildInfo.staticAssets.slice(0, 10)) expect(worker).toContain(JSON.stringify(url));

  await page.goto("/");
  const supported = await page.evaluate(() => "serviceWorker" in navigator);
  test.skip(!supported, "Service workers are unavailable in this browser runtime.");
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration("/"))), { timeout: 15000 }).toBe(true);
});

test("cold-boots the complete app shell and preserves IndexedDB while offline", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Cold-offline cache verification runs once on desktop Chromium.");
  await page.goto("/");
  await expect(page.getByLabel("Message HelloAI")).toBeVisible();
  await waitForControlledWorker(page);
  await seedOfflineConversation(page);

  const cacheSnapshot = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith("helloai-"));
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return { names, urls };
  });
  expect(cacheSnapshot.names.some((name) => name.startsWith("helloai-precache-"))).toBeTruthy();
  expect(cacheSnapshot.urls.some((url) => new URL(url).pathname.startsWith("/_next/static/") && new URL(url).pathname.endsWith(".js"))).toBeTruthy();
  expect(cacheSnapshot.urls.some((url) => new URL(url).pathname.startsWith("/_next/static/") && new URL(url).pathname.endsWith(".css"))).toBeTruthy();
  expect(cacheSnapshot.urls.some((url) => new URL(url).pathname.startsWith("/api/"))).toBeFalsy();

  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.clearBrowserCache");

  await context.setOffline(true);
  try {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Message HelloAI")).toBeVisible();
    const storedConversation = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("helloai-local", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const transaction = db.transaction("conversations");
      const value = await new Promise<{ title?: string; draft?: string } | undefined>((resolve, reject) => {
        const request = transaction.objectStore("conversations").get("pwa-offline-fixture");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return value;
    });
    expect(storedConversation).toMatchObject({ title: "Offline PWA fixture", draft: "Saved locally before going offline" });

    await page.getByRole("button", { name: "Open settings" }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
    await page.getByRole("button", { name: "Close settings" }).click();

    await page.goto("/?new=1", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Message HelloAI")).toBeVisible();

    await page.goto("/privacy", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Local-first by design" })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
