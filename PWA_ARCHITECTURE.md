# HelloAI PWA architecture

HelloAI uses a build-generated, revision-aware application shell. The service worker is **not** a hand-maintained list of files: `npm run build` runs the normal Next.js production build and then the npm `postbuild` lifecycle generates `public/sw.js` from the actual `.next/static` inventory.

## Release identity

`tool/build_pwa.mjs` resolves the PWA revision in this order:

1. `VERCEL_GIT_COMMIT_SHA`
2. `GITHUB_SHA`
3. `git rev-parse HEAD`
4. `.next/BUILD_ID`
5. deterministic SHA-256 digest of the generated Next static assets

The resolved revision is embedded in the service-worker source and in the versioned `helloai-precache-*` cache name. A new application revision therefore produces new service-worker bytes and a new cache namespace.

## Application shell

The generated precache contains:

- `/`
- `/privacy`
- `/offline`
- `/offline.html`
- the web-app manifest and install icons
- every file emitted under `.next/static`, exposed as `/_next/static/...`

Installation uses `cache.addAll()`. If any required shell resource cannot be fetched, the new worker installation fails and the previously active worker remains available. The generated worker never uses best-effort `Promise.allSettled()` shell installation.

Known application navigations (`/`, `/privacy`, and `/offline`) are served from the active revision's precache. Query strings such as `/?new=1` resolve to the cached `/` document, so manifest shortcuts continue to work offline without creating a separate HTML cache entry for every query string.

Unknown navigations use the network and fall back to the static `/offline.html` emergency document when the network is unavailable.

## Data boundaries

The PWA cache is only the executable/application shell. Conversation state remains in the existing `helloai-local` IndexedDB database.

`/api/*` is explicitly excluded from service-worker interception. Chat streaming, model discovery, and health checks therefore remain network-only and can never be satisfied from stale PWA cache entries.

## Updates

The worker does not call `skipWaiting()` during installation. A new revision installs and waits while the old revision remains active. `PwaProvider` detects the waiting worker and exposes the existing Update action. When the user chooses Update, HelloAI sends the structured `{ type: "SKIP_WAITING" }` message and the legacy string form for migration compatibility. The initiating tab reloads only after `controllerchange`.

## Cache ownership and migration

Activation removes only HelloAI-owned cache names matching the old `helloai-shell-v*` family or the generated `helloai-precache-*` / reserved `helloai-runtime-*` families. It never globally deletes Cache Storage, IndexedDB, or localStorage.

This migrates existing `helloai-shell-v3` installations without deleting local conversations.

## Development

Service workers remain disabled in development. `PwaProvider` unregisters existing workers when `NODE_ENV !== "production"` to prevent a previously installed production worker from masking `next dev` changes.

Use a production build when testing the PWA locally:

```bash
npm ci
npm run build
PLAYWRIGHT_PRODUCTION=1 npm run test:e2e
```

## Validation

`tool/validate_pwa.mjs` is a release gate. It checks that:

- a build revision is present;
- the generated worker is tied to that revision;
- every current `.next/static` file is listed in the application shell;
- required documents, manifest, icons, and emergency fallback are present;
- installation uses `cache.addAll()` and not `Promise.allSettled()`;
- API routes are excluded;
- cache cleanup is HelloAI-namespaced;
- explicit update activation is wired between `PwaProvider` and the worker.

The Chromium PWA E2E additionally clears the normal HTTP browser cache, takes the browser offline, cold-loads the app, verifies generated Next JS/CSS are present in Cache Storage, verifies IndexedDB survives, exercises Settings, checks `/?new=1`, and opens `/privacy` offline.
