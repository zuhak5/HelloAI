import { expect, test } from "@playwright/test";

function pngDimensions(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(1, 4).toString()).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("serves a valid manifest, required icons, and service worker", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone" });

  for (const [path, expected] of [["/icon-192.png", 192], ["/icon-512.png", 512], ["/icon-maskable-512.png", 512], ["/apple-touch-icon.png", 180]] as const) {
    const response = await request.get(path);
    expect(response.ok(), path).toBeTruthy();
    const dimensions = pngDimensions(await response.body());
    expect(dimensions, path).toEqual({ width: expected, height: expected });
  }

  const workerResponse = await request.get("/sw.js");
  expect(workerResponse.ok()).toBeTruthy();
  expect(workerResponse.headers()["service-worker-allowed"]).toBe("/");
  expect(await workerResponse.text()).toContain('self.addEventListener("fetch"');

  await page.goto("/");
  const supported = await page.evaluate(() => "serviceWorker" in navigator);
  test.skip(!supported, "Service workers are unavailable in this browser runtime.");
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration("/"))), { timeout: 15000 }).toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15000 }).toBe(true);
});

test("opens the cached app shell while offline", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "Offline navigation smoke test is stabilized on Chromium.");
  await page.goto("/");
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration("/"))), { timeout: 15000 }).toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 15000 }).toBe(true);
  await context.setOffline(true);
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: /Privacy/i })).toBeVisible();
  await context.setOffline(false);
});
