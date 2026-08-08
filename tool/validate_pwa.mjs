import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextStaticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");

const REQUIRED_SHELL_URLS = [
  "/",
  "/privacy",
  "/offline",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

async function walkFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function assert(condition, message) {
  if (!condition) throw new Error(`PWA validation failed: ${message}`);
}

const [worker, buildInfoText, offlineHtml, providerSource, nextConfigSource] = await Promise.all([
  fs.readFile(path.join(publicDir, "sw.js"), "utf8"),
  fs.readFile(path.join(publicDir, "pwa-build.json"), "utf8"),
  fs.readFile(path.join(publicDir, "offline.html"), "utf8"),
  fs.readFile(path.join(root, "components", "PwaProvider.tsx"), "utf8"),
  fs.readFile(path.join(root, "next.config.ts"), "utf8"),
]);

const buildInfo = JSON.parse(buildInfoText);
const staticFiles = (await walkFiles(nextStaticDir)).sort((a, b) => a.localeCompare(b));
const staticAssets = staticFiles.map((file) => `/_next/static/${toPosix(path.relative(nextStaticDir, file))}`);

assert(typeof buildInfo.revision === "string" && buildInfo.revision.length > 0, "missing build revision");
assert(buildInfo.staticAssetCount === staticAssets.length, "static asset count does not match .next/static");
assert(buildInfo.appShellCount === REQUIRED_SHELL_URLS.length + staticAssets.length, "app shell count is inconsistent");
assert(Array.isArray(buildInfo.staticAssets), "static asset inventory is missing");
assert(JSON.stringify(buildInfo.staticAssets) === JSON.stringify(staticAssets), "static asset inventory differs from .next/static");
assert(worker.includes(`const PWA_BUILD_REVISION = ${JSON.stringify(buildInfo.revision)};`), "worker is not tied to the current build revision");
assert(worker.includes("helloai-precache-"), "worker does not use a versioned HelloAI precache");
assert(worker.includes("await cache.addAll(requests);"), "worker installation is not all-or-nothing");
assert(!worker.includes("Promise.allSettled"), "worker still uses best-effort shell installation");
assert(worker.includes('url.pathname.startsWith("/api/")'), "worker does not explicitly exclude API routes");
assert(worker.includes('event.data?.type === "SKIP_WAITING"'), "worker does not support explicit update activation");
assert(worker.includes("helloai-(?:shell-v\\d+|precache-|runtime-)"), "worker does not namespace cache cleanup");
assert(worker.includes("navigationPreload.enable()"), "navigation preload is not enabled");
assert(providerSource.includes('waiting.postMessage({ type: "SKIP_WAITING" })'), "PwaProvider does not send the structured update message");
assert(providerSource.includes('waiting.postMessage("SKIP_WAITING")'), "PwaProvider does not retain legacy update compatibility");
assert(nextConfigSource.includes('source: "/sw.js"'), "service-worker response headers are missing");
assert(nextConfigSource.includes('source: "/pwa-build.json"'), "PWA build metadata response headers are missing");
assert(offlineHtml.includes("HelloAI is offline"), "offline fallback does not identify the offline state");

for (const url of [...REQUIRED_SHELL_URLS, ...staticAssets]) {
  assert(worker.includes(JSON.stringify(url)), `worker app shell is missing ${url}`);
}

assert(!buildInfo.staticAssets.some((url) => url.startsWith("/api/")), "API route entered the static asset inventory");
assert(!worker.includes('"/api/chat"') && !worker.includes('"/api/models"') && !worker.includes('"/api/health"'), "API endpoint entered the precache list");

process.stdout.write(`Validated HelloAI PWA revision ${buildInfo.revision}: ${staticAssets.length} Next assets, ${buildInfo.appShellCount} total shell URLs.\n`);
