# HelloAI

HelloAI is a no-login, local-first AI chat Progressive Web App. Open the site and start chatting immediately. Conversations, drafts, images, and preferences stay in browser-managed storage; the server stores no application data.

## Architecture

```text
Browser PWA
  ├─ IndexedDB: conversations, messages, compressed images
  ├─ localStorage: small preferences
  └─ service worker: app shell and offline navigation
          │
          ▼
Vercel /api/chat (stateless, same-origin proxy)
          │ server-only credentials
          ▼
HomePilot zrok → Nginx → CLIProxyAPI → AI provider
```

The Vercel route keeps the gateway API key and HomePilot secret out of browser code. It validates and forwards requests but writes no chats, files, telemetry, or settings to a database, Blob, KV, or filesystem.

## Included features

- Immediate no-login chat experience
- Streaming responses with stop and retry
- Edit, resend, regenerate, and branch flows
- Local conversation search, pinning, archive, rename, and deletion
- Image paste, drag/drop, upload, metadata stripping, resize, and WebP compression
- Markdown and GitHub-flavored tables/code
- Model selection and capability-aware controls
- Local drafts and multi-tab synchronization
- Strict JSON export/import for device backup and transfer
- Light, dark, and system themes
- Responsive desktop, tablet, mobile, landscape, and ultrawide layouts
- Installable PWA with offline shell, local-history access, update notifications, and cross-browser installation guidance
- Same-origin enforcement, request validation, model allowlist, body limits, concurrency limits, and best-effort in-memory throttling
- No application-level server persistence

## Requirements

- Node.js 24 or later
- A running HomePilot/CLIProxyAPI gateway
- A Vercel project connected to this repository

## Environment variables

Copy `.env.example` to `.env.local` for local development. Configure the same server-side variables in Vercel:

```text
GATEWAY_BASE_URL=https://homepilot-ai.shares.zrok.io
CLIPROXY_API_KEY=...
HOME_GATEWAY_SECRET=...
DEFAULT_GATEWAY_MODEL=gpt-5.6-terra
ALLOWED_GATEWAY_MODELS=gpt-5.4-mini,gpt-5.4,gpt-5.5,gpt-5.6-terra
VISION_GATEWAY_MODELS=gpt-5.4-mini,gpt-5.4,gpt-5.5,gpt-5.6-terra
REASONING_GATEWAY_MODELS=gpt-5.4,gpt-5.5,gpt-5.6-terra
CHAT_ENABLED=true
CHAT_RATE_LIMIT=20
CHAT_RATE_WINDOW_MS=300000
```

Do not use `NEXT_PUBLIC_` for gateway credentials. Values prefixed with `NEXT_PUBLIC_` are exposed to browsers.

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Service workers are intentionally removed in development to prevent stale cached bundles. Test the complete PWA lifecycle with a production build:

```bash
npm run build
npm run start
```

Run validation:

```bash
npm run check
PLAYWRIGHT_PRODUCTION=1 npm run test:e2e
```

## PWA installation

HelloAI shows an **Install app** action in the header, conversation sidebar, and Settings until the app is running in standalone mode.

- Chrome and Edge: select **Install app**, then **Install now**. The browser prompt is available after the browser confirms installability.
- iPhone and iPad: open the install dialog for guidance, then use the browser Share menu and **Add to Home Screen**. Safari is the most broadly compatible path.
- Safari 17+ on macOS: use **File → Add to Dock**.
- Firefox on Android: use the browser menu and **Install** or **Add to Home screen**.
- Firefox desktop: standalone manifest-based installation is not currently available; use Chrome, Edge, or Safari, or continue using HelloAI in Firefox.

The deployed application must use HTTPS. Localhost is treated as a secure context for development. The service worker caches the application shell, icons, privacy page, and offline fallback. API routes are never cached. Previously stored chats remain readable offline, but new model responses require connectivity.

When a new worker is ready, HelloAI displays an update action instead of forcing an unexpected reload. This protects drafts and in-progress work.

## Deploy to Vercel

1. Import `zuhak5/HelloAI` into Vercel.
2. Add all required environment variables for Production and Preview.
3. Set the Node.js runtime to 24.x if the project does not inherit it from `package.json`.
4. Deploy over HTTPS.
5. Verify `/api/health`, `/manifest.webmanifest`, `/sw.js`, and the declared icon URLs.
6. Open the app, send a small text prompt, and verify image input only with a confirmed vision-capable model.
7. Verify the Install app flow in Chromium and Add to Home Screen/Add to Dock guidance on Apple platforms.
8. Configure Vercel Firewall/rate limiting before sharing the URL publicly.

Vercel should not be connected to a database, Blob store, KV store, or analytics product for this application.

## Public no-login warning

Anyone who can access the deployed site can consume the shared gateway quota. The included in-memory limiter is only a per-instance safety layer and is not a durable global quota system. Use Vercel Firewall/rate limiting, provider budget alerts, strict model limits, and an emergency `CHAT_ENABLED=false` switch for public deployment.

## Local data and privacy

- Chats and images are stored in IndexedDB in the current browser profile.
- Small preferences are stored in localStorage.
- Clearing site data removes local HelloAI data, including installed-app storage.
- There is no cloud recovery or cross-device synchronization.
- Export/import is the supported backup and transfer method.
- The AI provider still receives the content needed to answer each request.
- Application code does not deliberately log prompts, responses, image content, or credentials.

## Repository documents

- [`HELLOAI_IMPLEMENTATION_PLAN.md`](./HELLOAI_IMPLEMENTATION_PLAN.md) — product and architecture plan
- [`UI_UX_AUDIT_REPORT.md`](./UI_UX_AUDIT_REPORT.md) — initial production-readiness audit
- [`PWA_UI_AUDIT_REPORT.md`](./PWA_UI_AUDIT_REPORT.md) — PWA/installability and second-pass UI/UX audit
- [`.env.example`](./.env.example) — deployment configuration template

## License

Private project unless the repository owner adds a license.
