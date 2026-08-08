import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextStaticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const swPath = path.join(publicDir, "sw.js");
const buildInfoPath = path.join(publicDir, "pwa-build.json");

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

async function digestStaticAssets(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const relative = toPosix(path.relative(nextStaticDir, file));
    hash.update(relative);
    hash.update("\0");
    hash.update(await fs.readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function readGitRevision() {
  try {
    const value = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return /^[0-9a-f]{40}$/i.test(value) ? value : "";
  } catch {
    return "";
  }
}

async function resolveRevision(staticDigest) {
  for (const value of [process.env.VERCEL_GIT_COMMIT_SHA, process.env.GITHUB_SHA]) {
    const revision = value?.trim();
    if (revision) return revision;
  }
  const gitRevision = readGitRevision();
  if (gitRevision) return gitRevision;
  try {
    const buildId = (await fs.readFile(path.join(root, ".next", "BUILD_ID"), "utf8")).trim();
    if (buildId) return buildId;
  } catch {
    // The static digest below is deterministic and always available after next build.
  }
  return staticDigest;
}

function renderServiceWorker({ revision, appShell }) {
  const cacheSuffix = revision.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 48) || "unknown";
  return `/* GENERATED FILE. DO NOT EDIT.\n * Source: tool/build_pwa.mjs\n * Build revision: ${revision}\n */\nconst PWA_BUILD_REVISION = ${JSON.stringify(revision)};\nconst PRECACHE_NAME = ${JSON.stringify(`helloai-precache-${cacheSuffix}`)};\nconst APP_SHELL = ${JSON.stringify(appShell, null, 2)};\nconst APP_SHELL_PATHS = new Set(APP_SHELL);\nconst SHELL_DOCUMENTS = new Set([\"/\", \"/privacy\", \"/offline\"]);\nconst HELLOAI_CACHE = /^helloai-(?:shell-v\\d+|precache-|runtime-)/;\n\nfunction absoluteUrl(value) {\n  return new URL(value, self.location.origin).href;\n}\n\nasync function matchPrecache(value) {\n  const cache = await caches.open(PRECACHE_NAME);\n  return cache.match(absoluteUrl(value));\n}\n\nself.addEventListener(\"install\", (event) => {\n  event.waitUntil((async () => {\n    const cache = await caches.open(PRECACHE_NAME);\n    const requests = APP_SHELL.map((url) => new Request(absoluteUrl(url), { cache: \"reload\" }));\n    await cache.addAll(requests);\n  })());\n});\n\nself.addEventListener(\"activate\", (event) => {\n  event.waitUntil((async () => {\n    const keys = await caches.keys();\n    await Promise.all(keys\n      .filter((key) => key !== PRECACHE_NAME && HELLOAI_CACHE.test(key))\n      .map((key) => caches.delete(key)));\n    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();\n    await self.clients.claim();\n  })());\n});\n\nself.addEventListener(\"message\", (event) => {\n  if (event.data === \"SKIP_WAITING\" || event.data?.type === \"SKIP_WAITING\") self.skipWaiting();\n});\n\nasync function networkNavigation(event) {\n  try {\n    const preload = await event.preloadResponse;\n    if (preload) return preload;\n    return await fetch(event.request);\n  } catch {\n    return await matchPrecache(\"/offline.html\") || new Response(\"HelloAI is offline.\", {\n      status: 503,\n      headers: { \"Content-Type\": \"text/plain; charset=utf-8\" },\n    });\n  }\n}\n\nasync function shellNavigation(event, pathname) {\n  const cached = await matchPrecache(pathname);\n  return cached || networkNavigation(event);\n}\n\nself.addEventListener(\"fetch\", (event) => {\n  const request = event.request;\n  if (request.method !== \"GET\") return;\n\n  const url = new URL(request.url);\n  if (url.origin !== self.location.origin) return;\n  if (url.pathname.startsWith(\"/api/\")) return;\n\n  if (request.mode === \"navigate\") {\n    const shellPath = SHELL_DOCUMENTS.has(url.pathname) ? url.pathname : null;\n    event.respondWith(shellPath ? shellNavigation(event, shellPath) : networkNavigation(event));\n    return;\n  }\n\n  if (APP_SHELL_PATHS.has(url.pathname)) {\n    event.respondWith((async () => {\n      const cached = await matchPrecache(url.pathname);\n      return cached || fetch(request);\n    })());\n  }\n});\n`;
}

await fs.mkdir(publicDir, { recursive: true });
const staticFiles = (await walkFiles(nextStaticDir)).sort((a, b) => a.localeCompare(b));
if (staticFiles.length === 0) throw new Error("No Next.js static assets were found under .next/static.");

const staticAssets = staticFiles.map((file) => `/_next/static/${toPosix(path.relative(nextStaticDir, file))}`);
const staticDigest = await digestStaticAssets(staticFiles);
const revision = await resolveRevision(staticDigest);
const appShell = [...REQUIRED_SHELL_URLS, ...staticAssets];

await fs.writeFile(swPath, renderServiceWorker({ revision, appShell }), "utf8");
await fs.writeFile(buildInfoPath, `${JSON.stringify({
  revision,
  staticDigest,
  staticAssetCount: staticAssets.length,
  appShellCount: appShell.length,
  staticAssets,
}, null, 2)}\n`, "utf8");

process.stdout.write(`Generated HelloAI PWA worker for ${revision} with ${staticAssets.length} Next assets.\n`);
