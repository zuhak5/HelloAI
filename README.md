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

The Vercel route is required to keep the gateway API key and HomePilot secret out of browser code. It validates and forwards requests but writes no chats, files, telemetry, or settings to a database, Blob, KV, or filesystem.

## Included features

- Immediate no-login chat experience
- Streaming responses with stop and retry
- Edit and resend user messages
- Regenerate assistant answers
- Branch a conversation from any message
- Local conversation search
- Rename, pin, archive, restore, and delete
- Image paste, drag/drop, file upload, metadata stripping, resize, and WebP compression
- Markdown and GitHub-flavored tables/code
- Model selection and capability-aware controls
- Local drafts and multi-tab synchronization
- JSON export/import for device backup and transfer
- Light, dark, and system themes
- Responsive desktop/mobile layout
- Installable PWA with offline shell and local-history access
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

`VISION_GATEWAY_MODELS` and `REASONING_GATEWAY_MODELS` are explicit capability allowlists. Only list models you have verified through the live gateway.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Run validation:

```bash
npm run check
npm run test:e2e
```

## Deploy to Vercel

1. Import `zuhak5/HelloAI` into Vercel.
2. Add all required environment variables for Production and Preview.
3. Set the Node.js runtime to 24.x if the project does not inherit it from `package.json`.
4. Deploy.
5. Verify `/api/health`, then open the app and send a small text prompt.
6. Verify image input only after the selected model is confirmed to support vision.
7. Configure Vercel Firewall/rate limiting before sharing the URL publicly.

Vercel should not be connected to a database, Blob store, KV store, or analytics product for this application.

## Public no-login warning

Anyone who can access the deployed site can consume the shared gateway quota. The included in-memory limiter is only a per-instance safety layer and is not a durable global quota system. Use Vercel Firewall/rate limiting, provider budget alerts, strict model limits, and an emergency `CHAT_ENABLED=false` switch for public deployment.

## Local data and privacy

- Chats and images are stored in IndexedDB in the current browser profile.
- Small preferences are stored in localStorage.
- Clearing site data removes local HelloAI data.
- There is no cloud recovery or cross-device synchronization.
- Export/import is the supported backup and transfer method.
- The AI provider still receives the content needed to answer each request.
- Application code does not deliberately log prompts, responses, image content, or credentials.

## PWA behavior

The service worker caches the app shell, icons, privacy page, and offline fallback. API routes are never cached. Previously stored chats remain readable offline, but new model responses require connectivity.

## Repository documents

- [`HELLOAI_IMPLEMENTATION_PLAN.md`](./HELLOAI_IMPLEMENTATION_PLAN.md) — full product and architecture plan
- [`.env.example`](./.env.example) — deployment configuration template

## License

Private project unless the repository owner adds a license.
