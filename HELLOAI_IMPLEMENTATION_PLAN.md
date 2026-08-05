# HelloAI — Full Product and Implementation Plan

**Repository:** `zuhak5/HelloAI`  
**Deployment:** Vercel  
**Application type:** Installable Progressive Web App (PWA)  
**Primary experience:** Open the website and immediately chat with AI  
**Authentication:** None  
**User-data persistence:** Browser-local only  
**Server persistence:** None  
**Gateway:** Existing HomePilot gateway through CLIProxyAPI  
**Plan status:** Initial architecture and delivery baseline  
**Prepared:** 2026-08-06

---

## 1. Product vision

HelloAI will be a fast, private-by-design AI chat application that works as a website and an installable PWA. A visitor opens the app and can start chatting immediately without creating an account, signing in, or accepting cloud synchronization.

Conversation history, preferences, prompt presets, attachments, and local metadata remain on the user’s device. The application will not operate an application database, user account system, analytics store, or server-side chat-history store.

The existing HomePilot gateway remains the AI execution path:

```text
HelloAI browser
  → same-origin Vercel Route Handler
  → HomePilot zrok endpoint
  → Nginx
  → CLIProxyAPI
  → authenticated AI provider/model
```

The Vercel Route Handler is mandatory even though the product has no server-side data storage. It acts only as a stateless security proxy so that `CLIPROXY_API_KEY` and `HOME_GATEWAY_SECRET` are never sent to the browser.

---

## 2. Non-negotiable architecture decisions

### 2.1 No account system

HelloAI will not include:

- registration;
- login;
- user profiles stored on a server;
- password recovery;
- cloud synchronization;
- server-side conversation ownership.

The user identity is effectively the current browser profile on the current device.

### 2.2 No application-level server persistence

Vercel Functions will not write chat content, images, settings, telemetry, or user identifiers to a database, Blob store, KV store, filesystem, or third-party analytics service.

The proxy will use `store: false` for upstream AI requests whenever the selected endpoint supports it.

Infrastructure providers may still produce normal operational logs. The application should minimize log content and never deliberately log prompts, responses, images, secrets, or full request bodies.

### 2.3 Browser-local storage means two browser technologies

“Local storage only” will mean all user data stays in browser-managed storage:

- **IndexedDB:** conversations, messages, images, attachments, prompt presets, branches, and export metadata.
- **`localStorage`:** small preferences only, such as theme, selected model, sidebar state, font size, and onboarding completion.

Using `localStorage` for full conversations or images is not acceptable because it is synchronous, string-only, and too small for a full chat application.

### 2.4 Stateless Vercel proxy is required

A pure static browser-only deployment would expose gateway credentials or fail because of CORS preflight. Therefore HelloAI will include same-origin Route Handlers that:

- validate requests;
- enforce size and model limits;
- attach gateway credentials from Vercel environment variables;
- forward streaming responses;
- return sanitized errors;
- persist nothing.

### 2.5 Offline scope

The PWA shell, local history, settings, drafts, and previously stored attachments will work offline. New AI responses require network access to the gateway.

The interface must clearly distinguish:

- **App available offline** — the PWA opens and local chats are readable.
- **AI unavailable offline** — sending a new prompt is disabled or queued as a local draft.

---

## 3. Recommended technical stack

### Core

- Current stable **Next.js App Router**
- **React**
- **TypeScript** with strict mode
- **Node.js 24.x** for Vercel Functions and CI
- **Tailwind CSS** for styling
- **Zod** for runtime validation

### Local persistence

- **IndexedDB**, accessed through a small typed wrapper such as Dexie or `idb`
- Native `localStorage` for small preferences
- `BroadcastChannel` for multi-tab synchronization
- `navigator.storage.persist()` for best-effort persistent browser storage
- `navigator.storage.estimate()` for storage usage and quota display

### Chat rendering

- `react-markdown`
- GitHub Flavored Markdown support
- HTML sanitization
- Lazy-loaded code highlighting
- Optional math rendering in a later phase

### PWA

- Next.js web app manifest support
- Service worker using either the current Next.js PWA guidance or Serwist
- Offline fallback route
- Install prompt UX
- Update-available notification

### Testing

- Vitest
- React Testing Library
- Playwright
- Lighthouse CI or equivalent PWA/accessibility checks

### Dependency policy

Use the smallest practical dependency set. Avoid an AI framework abstraction unless it clearly improves interoperability with the CLIProxyAPI Responses API. Direct `fetch`, `ReadableStream`, and explicit event parsing are preferred because the gateway is already OpenAI-compatible.

---

## 4. High-level application architecture

```text
┌───────────────────────────────────────────────────────────────┐
│ Browser                                                       │
│                                                               │
│  React UI                                                     │
│    ├─ Chat workspace                                          │
│    ├─ Conversation sidebar                                    │
│    ├─ Composer and attachments                                │
│    ├─ Settings                                                │
│    └─ PWA/offline controls                                    │
│                                                               │
│  Local data                                                   │
│    ├─ IndexedDB: chats, messages, images, presets             │
│    ├─ localStorage: preferences                               │
│    ├─ Cache API: application shell/static assets              │
│    └─ BroadcastChannel: multi-tab updates                     │
└───────────────────────┬───────────────────────────────────────┘
                        │ same-origin HTTPS
                        ▼
┌───────────────────────────────────────────────────────────────┐
│ Vercel                                                        │
│                                                               │
│  Next.js Route Handlers                                       │
│    ├─ POST /api/chat       streaming AI proxy                 │
│    ├─ GET  /api/models     sanitized available-model list     │
│    ├─ GET  /api/health     minimal gateway readiness          │
│    └─ optional /api/images only after capability verification │
│                                                               │
│  No database, Blob, KV, filesystem writes, or chat logs        │
└───────────────────────┬───────────────────────────────────────┘
                        │ authenticated server-to-server request
                        ▼
HomePilot zrok → Nginx → CLIProxyAPI → upstream AI
```

---

## 5. Security model

### 5.1 Secrets

Store these only as Vercel server-side environment variables:

```text
GATEWAY_BASE_URL
CLIPROXY_API_KEY
HOME_GATEWAY_SECRET
DEFAULT_GATEWAY_MODEL
ALLOWED_GATEWAY_MODELS
```

Rules:

- Never use `NEXT_PUBLIC_` for gateway secrets.
- Never embed credentials in JavaScript bundles, HTML, the service worker, source maps, or browser storage.
- Never return credential values from readiness endpoints.
- Redeploy after environment-variable changes.

### 5.2 Public, no-login abuse risk

Because the site has no login, anyone who can reach it can consume the owner’s AI quota. This is the largest product risk.

Mitigation layers:

1. Vercel Firewall/rate limiting at the platform level.
2. Per-IP short-window throttling where available without storing chat content.
3. Maximum concurrent requests per client session.
4. Maximum prompt, attachment, and output sizes.
5. Server-side model allowlist.
6. Daily or hourly budget alerting outside the app.
7. Optional invisible challenge or abuse protection if public traffic becomes significant.
8. Emergency environment flag to disable chat without redeploying, if supported by the selected deployment configuration.

A durable per-user quota cannot be enforced reliably without identity and persistence. The plan therefore treats platform rate limiting and strict request limits as mandatory before public launch.

### 5.3 Request validation

Every Route Handler must validate:

- same-origin browser requests where applicable;
- HTTP method and content type;
- prompt and system-message length;
- conversation message count;
- role values;
- model against an allowlist;
- maximum output tokens;
- temperature/reasoning values;
- image media type, dimensions, and encoded size;
- total request-body size;
- disallowed URL schemes and remote attachment URLs.

### 5.4 Logging policy

Application code must not log:

- prompts;
- responses;
- system instructions;
- image data;
- attachment contents;
- API keys or gateway secrets;
- full upstream error bodies when they may contain user content.

Allowed operational logs:

- generated request correlation ID;
- timestamp;
- sanitized error category;
- HTTP status;
- latency;
- selected model identifier;
- aggregate token counts when returned.

Logging should be minimal and optional. No application code will persist these records.

### 5.5 Browser security controls

Add:

- strict Content Security Policy;
- `Referrer-Policy`;
- `X-Content-Type-Options`;
- restrictive `Permissions-Policy`;
- secure same-origin fetches;
- sanitized Markdown rendering;
- safe links with `rel="noopener noreferrer"`;
- no execution of model-generated HTML or scripts;
- no automatic opening of model-generated URLs.

---

## 6. Core product experience

### 6.1 First launch

The first screen should be immediately usable:

- HelloAI logo/name;
- empty conversation state;
- prominent message composer;
- concise privacy statement: “Chats stay on this device”;
- no blocking onboarding;
- optional one-screen feature tips that can be dismissed.

### 6.2 Chat composer

Required features:

- multiline text input;
- Enter to send, Shift+Enter for newline;
- send button;
- stop-generation button;
- regenerate last answer;
- edit and resend a prior user message;
- draft autosave per conversation;
- drag-and-drop images;
- paste image from clipboard;
- mobile camera/file picker;
- attachment preview and removal;
- token/size warning before sending;
- offline state and disabled-send explanation.

### 6.3 Streaming response

The assistant response must render incrementally.

Required behavior:

- streaming text display;
- stop/cancel through `AbortController`;
- partial response retained locally when cancelled;
- clear retry action on transport failure;
- no duplicate message after reconnect/retry;
- generation status visible to screen readers;
- response metadata available in an expandable details area.

### 6.4 Message actions

Each message should support appropriate actions:

- copy text;
- copy code block;
- edit user message;
- regenerate assistant response;
- continue from this point / create branch;
- delete message and descendants with confirmation;
- read aloud where browser support exists;
- report rendering problem locally only—no server report submission in the initial product.

### 6.5 Conversation management

Required:

- new chat;
- automatic local title generation using the first user prompt or a local heuristic;
- rename;
- pin;
- archive;
- delete;
- clear all chats;
- search titles and message text locally;
- sort by recent activity;
- optional folders/tags in a later phase;
- confirmation and undo window for destructive actions.

### 6.6 Settings

Local settings should include:

- theme: system/light/dark;
- interface density;
- font size;
- selected model;
- default system instruction;
- default output-token limit;
- temperature or reasoning level when supported;
- streaming on/off only if non-stream mode is supported;
- code wrapping;
- auto-title behavior;
- local storage usage;
- export/import;
- clear chats;
- reset application;
- PWA installation status;
- application version.

---

## 7. AI and gateway integration

### 7.1 Primary endpoint

Use a same-origin endpoint:

```text
POST /api/chat
```

The browser sends a sanitized conversation request without gateway credentials. The Route Handler validates and converts it into the CLIProxyAPI/OpenAI Responses request.

### 7.2 Proposed browser request contract

```ts
interface ChatRequest {
  conversationId: string;
  requestId: string;
  model: string;
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          mediaType: "image/jpeg" | "image/png" | "image/webp";
          dataUrl: string;
          width: number;
          height: number;
        }
    >;
  }>;
  maxOutputTokens: number;
  temperature?: number;
  reasoning?: "low" | "medium" | "high";
}
```

The server must ignore any browser-supplied gateway URL, API key, gateway secret, provider header, or arbitrary upstream header.

### 7.3 Upstream Responses payload

The proxy will construct input content using explicit text and image items, for example:

```json
{
  "model": "selected-allowed-model",
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "Describe this image." },
        { "type": "input_image", "image_url": "data:image/webp;base64,..." }
      ]
    }
  ],
  "store": false,
  "stream": true
}
```

Exact fields must be verified against the live CLIProxyAPI version and the selected model before implementation is finalized.

### 7.4 Model management

Do not hardcode one model throughout the UI.

Implement:

- server-side default model;
- server-side allowlist;
- sanitized `/api/models` endpoint;
- client-side cached model catalog;
- capability flags per model: text, image input, reasoning, image generation;
- graceful fallback when a saved model is no longer available;
- clear error when a model is not permitted or unavailable.

Initial recommended configuration:

```text
DEFAULT_GATEWAY_MODEL=gpt-5.6-terra
ALLOWED_GATEWAY_MODELS=gpt-5.4-mini,gpt-5.4,gpt-5.5,gpt-5.6-terra
```

The actual allowlist must be based on the live `/v1/models` output from the deployed CLIProxyAPI instance.

### 7.5 Image support

Image input is an initial release requirement, subject to live model verification.

Client requirements:

- JPEG, PNG, and WebP;
- reject unsupported formats;
- strip EXIF metadata by decoding and re-encoding client-side;
- resize large images before sending;
- default maximum long edge around 1600–2048 pixels;
- convert to WebP or JPEG with configurable quality;
- show compressed size before send;
- store the local original or compressed copy based on a privacy/storage preference.

Transport limit:

- Vercel Functions currently impose a request-body limit around 4.5 MB.
- Base64 encoding increases data size.
- Keep the final complete request comfortably below the platform limit.
- Initial policy: target no more than approximately 2.5 MB of compressed raw image data per request, with a lower default for mobile networks.

No image data will be persisted by the Vercel application.

### 7.6 Image generation

Image generation should not be promised for the first release until the live CLIProxyAPI provider/account is verified to support it.

If verified, add a separate endpoint and UI mode in a later phase:

```text
POST /api/images
```

Generated images will be returned to the browser and saved only when the user chooses to retain them locally.

### 7.7 Tools and web search

Do not represent general web search, browsing, or arbitrary tool execution as available unless a verified upstream capability exists.

Potential client-local tools for a later phase:

- calculator;
- date/time helper;
- local text-file extraction;
- local image resizing;
- local conversation search.

Any external tool requiring a secret must execute through a stateless Vercel proxy and requires a separate security review.

---

## 8. Local data architecture

### 8.1 IndexedDB database

Proposed database name:

```text
helloai-local-v1
```

Object stores:

#### `conversations`

```ts
interface ConversationRecord {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  model: string;
  systemPrompt?: string;
  pinned: boolean;
  archived: boolean;
  activeBranchId: string;
  draft?: string;
  schemaVersion: number;
}
```

#### `messages`

```ts
interface MessageRecord {
  id: string;
  conversationId: string;
  parentMessageId: string | null;
  branchId: string;
  role: "user" | "assistant" | "system";
  text: string;
  status: "draft" | "streaming" | "complete" | "cancelled" | "error";
  createdAt: string;
  updatedAt: string;
  model?: string;
  responseId?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  attachmentIds: string[];
  errorCode?: string;
  schemaVersion: number;
}
```

#### `attachments`

```ts
interface AttachmentRecord {
  id: string;
  conversationId: string;
  messageId: string;
  kind: "image";
  name: string;
  mediaType: string;
  blob: Blob;
  thumbnail?: Blob;
  width?: number;
  height?: number;
  byteLength: number;
  createdAt: string;
  schemaVersion: number;
}
```

#### `presets`

Stores local system-prompt and generation presets.

#### `appMetadata`

Stores database schema version, last export date, and migration state.

### 8.2 Preferences in `localStorage`

One namespaced JSON value:

```text
helloai.preferences.v1
```

Only small values are permitted. Large chat or attachment data must never be placed here.

### 8.3 Multi-tab behavior

Use `BroadcastChannel` to notify other tabs about:

- new/updated/deleted conversation;
- active generation lock;
- settings changes;
- clear-all operation;
- database migration.

Only one tab should generate a response for the same conversation/request ID.

### 8.4 Storage persistence and quota

On first meaningful use, request persistent storage using `navigator.storage.persist()` and report whether the browser granted it.

Settings should display:

- current usage;
- estimated quota;
- persistent/best-effort status;
- attachment usage;
- clear-data controls.

The app must handle `QuotaExceededError` without losing the active conversation. It should stop saving new attachments, preserve text where possible, and offer export/cleanup actions.

### 8.5 Data export and import

Export format:

```text
helloai-export-YYYY-MM-DD.zip
```

Contents:

```text
manifest.json
conversations.json
messages.json
presets.json
attachments/<attachment-id>.<ext>
```

Requirements:

- schema version included;
- integrity validation on import;
- preview counts before import;
- merge or replace option;
- no execution of imported HTML/scripts;
- reject oversized or malformed archives;
- migration support for older exports.

### 8.6 Optional local encryption

Later phase only:

- user-selected local passphrase;
- Web Crypto API;
- encryption before writing sensitive text and attachments to IndexedDB;
- no password recovery;
- explicit warning that losing the passphrase loses access.

This is not required for the first release because it materially increases complexity and migration risk.

---

## 9. PWA behavior

### 9.1 Manifest

Provide:

- name: HelloAI;
- short name: HelloAI;
- description;
- `start_url: "/"`;
- `display: "standalone"`;
- theme and background colors;
- 192×192 and 512×512 icons;
- maskable icon;
- Apple touch icon;
- screenshots when available;
- shortcuts for New Chat and Search.

### 9.2 Service-worker cache rules

Precache:

- application shell;
- fonts hosted by the app;
- icons;
- offline page;
- core static JavaScript and CSS.

Runtime cache:

- static assets using cache-first with versioning;
- navigations using network-first with offline fallback;
- model catalog using short network-first caching.

Never cache:

- `POST /api/chat`;
- AI response streams;
- prompts;
- gateway headers;
- image request bodies;
- error responses containing user content.

### 9.3 Offline UX

When offline:

- app opens;
- local conversations are readable and searchable;
- drafts are editable;
- export works;
- settings work;
- sending is disabled with a precise explanation;
- unsent prompt remains as a draft;
- do not silently auto-send when connectivity returns unless the user enables that behavior.

### 9.4 Update UX

When a new service worker is ready:

- show “Update available”;
- let the user apply it explicitly;
- save active drafts before reload;
- reload only after storage transactions finish;
- show current version in Settings.

---

## 10. User-interface structure

### Desktop

```text
┌────────────────┬─────────────────────────────────────────────┐
│ Sidebar        │ Conversation header                         │
│                ├─────────────────────────────────────────────┤
│ New chat       │                                             │
│ Search         │ Message list                                │
│ Pinned         │                                             │
│ Recent chats   │                                             │
│ Archived       │                                             │
│                ├─────────────────────────────────────────────┤
│ Settings       │ Attachments + composer + send/stop          │
└────────────────┴─────────────────────────────────────────────┘
```

### Mobile/PWA standalone

- full-width conversation;
- sidebar as drawer;
- composer respects keyboard and safe-area insets;
- attachment tray scrolls horizontally;
- controls have touch-friendly sizes;
- no layout jump while streaming.

### Main components

```text
AppShell
ConversationSidebar
ConversationHeader
MessageList
MessageBubble
MarkdownRenderer
CodeBlock
AttachmentPreview
ChatComposer
ModelSelector
GenerationControls
OfflineBanner
InstallPrompt
UpdatePrompt
SettingsDialog
StorageManagerPanel
ImportExportDialog
ConfirmDialog
ToastRegion
```

---

## 11. Accessibility requirements

Target WCAG 2.2 AA.

Required:

- complete keyboard navigation;
- visible focus states;
- semantic landmarks;
- proper labels for icon buttons;
- screen-reader announcement for generation status;
- reduced-motion support;
- sufficient color contrast;
- no color-only status meaning;
- mobile zoom allowed;
- logical focus after deleting or switching chats;
- accessible dialogs and drawers;
- code blocks readable without horizontal page overflow.

---

## 12. Performance requirements

Targets:

- fast first load on mobile;
- usable PWA shell on repeat visit offline;
- no full rerender for every streaming token;
- smooth conversations with hundreds of messages;
- lazy-load syntax highlighting and secondary dialogs;
- thumbnail large images;
- release object URLs when no longer needed;
- virtualize very long message lists if measurement confirms a need;
- avoid storing duplicate Base64 copies of images in IndexedDB.

Streaming updates should be buffered into small intervals rather than committing React state for every received character.

---

## 13. Proposed repository structure

```text
HelloAI/
├─ app/
│  ├─ api/
│  │  ├─ chat/route.ts
│  │  ├─ health/route.ts
│  │  └─ models/route.ts
│  ├─ offline/page.tsx
│  ├─ manifest.ts
│  ├─ layout.tsx
│  ├─ page.tsx
│  ├─ globals.css
│  └─ sw.ts
├─ components/
│  ├─ app-shell/
│  ├─ chat/
│  ├─ conversations/
│  ├─ attachments/
│  ├─ settings/
│  ├─ pwa/
│  └─ ui/
├─ lib/
│  ├─ gateway/
│  │  ├─ config.ts
│  │  ├─ request.ts
│  │  ├─ stream.ts
│  │  └─ errors.ts
│  ├─ storage/
│  │  ├─ db.ts
│  │  ├─ schema.ts
│  │  ├─ migrations.ts
│  │  ├─ export.ts
│  │  └─ quota.ts
│  ├─ chat/
│  │  ├─ reducer.ts
│  │  ├─ branching.ts
│  │  ├─ titles.ts
│  │  └─ validation.ts
│  ├─ images/
│  │  ├─ validate.ts
│  │  ├─ compress.ts
│  │  └─ metadata.ts
│  ├─ security/
│  │  ├─ headers.ts
│  │  ├─ rate-limit.ts
│  │  └─ sanitize.ts
│  └─ shared/
├─ public/
│  ├─ icons/
│  └─ screenshots/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/
│  └─ fixtures/
├─ .github/workflows/ci.yml
├─ next.config.ts
├─ package.json
├─ tsconfig.json
├─ vercel.json
├─ README.md
└─ HELLOAI_IMPLEMENTATION_PLAN.md
```

---

## 14. API behavior and failure handling

### `/api/chat`

Responsibilities:

1. Reject invalid method/content type.
2. Validate body size before expensive parsing where possible.
3. Parse strict schema.
4. Validate selected model against server allowlist.
5. Enforce attachment limits.
6. Build upstream request.
7. Attach both gateway authentication headers.
8. Forward to `/v1/responses`.
9. Stream the upstream response without buffering the full completion.
10. Abort upstream work when the browser disconnects where supported.
11. Return sanitized errors.
12. Persist nothing.

### `/api/models`

Responsibilities:

- fetch the live CLIProxyAPI model list server-to-server;
- filter it against `ALLOWED_GATEWAY_MODELS`;
- attach safe capability metadata maintained by the application;
- cache briefly in memory/CDN only if no secret or user data is included;
- return a safe fallback catalog if the upstream model endpoint is temporarily unavailable.

### `/api/health`

Return only:

```json
{
  "status": "healthy",
  "gatewayReachable": true,
  "defaultModel": "gpt-5.6-terra"
}
```

Do not expose infrastructure IPs, secrets, raw upstream headers, or detailed internal errors to public users.

### Error categories

Use stable client-safe codes:

```text
offline
request_invalid
request_too_large
image_invalid
image_too_large
model_not_allowed
model_unavailable
rate_limited
gateway_timeout
gateway_unreachable
upstream_rejected
stream_interrupted
internal_error
```

The client should retain the user message and present retry/edit options.

---

## 15. Testing strategy

### Unit tests

- request schemas;
- model allowlist;
- image validation/compression decisions;
- local database migrations;
- branching logic;
- conversation deletion;
- export/import validation;
- error mapping;
- Markdown sanitization;
- storage quota handling.

### Integration tests

- Route Handler → mocked CLIProxyAPI stream;
- abort propagation;
- Responses stream parsing;
- image request transformation;
- no secret leakage in responses;
- no prompt logging;
- model-catalog filtering;
- offline database reads.

### End-to-end tests

- open and send first message without login;
- streamed answer;
- stop generation;
- regenerate;
- edit and branch;
- create/search/rename/delete conversation;
- refresh and recover history locally;
- image upload and vision response;
- installable manifest;
- offline shell and history access;
- export, clear, and import;
- mobile layout;
- keyboard-only operation.

### Security tests

- client bundle contains no secret names with values;
- arbitrary model rejected;
- arbitrary gateway URL ignored;
- oversized payload rejected;
- malicious Markdown sanitized;
- data URL media type validated;
- prompt not included in server logs during test;
- service worker does not cache API POST bodies or responses.

### PWA acceptance

- valid manifest;
- service worker active in production;
- installable on supported Chromium browsers;
- standalone launch works;
- offline shell works;
- update flow preserves drafts;
- Lighthouse PWA/accessibility checks meet agreed thresholds.

---

## 16. CI/CD and Vercel deployment

### GitHub Actions

On pull request and push to `main`:

```text
npm ci
npm audit --omit=dev --audit-level=high
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e (on selected branches or preview)
```

Use Node.js 24 and locked dependencies.

### Vercel environments

Configure separately for Development, Preview, and Production.

Production variables:

```text
GATEWAY_BASE_URL=https://homepilot-ai.shares.zrok.io/v1
CLIPROXY_API_KEY=<secret>
HOME_GATEWAY_SECRET=<secret>
DEFAULT_GATEWAY_MODEL=gpt-5.6-terra
ALLOWED_GATEWAY_MODELS=<comma-separated allowlist>
```

Optional operational variables:

```text
CHAT_ENABLED=true
MAX_PROMPT_CHARS=20000
MAX_MESSAGES_PER_REQUEST=100
MAX_OUTPUT_TOKENS=8000
MAX_IMAGE_BYTES=2500000
GATEWAY_TIMEOUT_MS=120000
```

### Deployment rules

- Preview deployments use separate secrets where possible.
- No production secret in GitHub Actions logs.
- Environment changes require a new deployment.
- Production promotion only after CI and a live gateway smoke test pass.
- Prefer a Vercel function region close to the gateway VM to reduce latency.

---

## 17. Delivery phases

## Phase 0 — Gateway capability verification

Before UI implementation:

- confirm `/v1/models` output;
- confirm selected text model;
- test streaming Responses API;
- test `store: false`;
- test cancellation behavior;
- test image input with a small JPEG/WebP;
- measure maximum practical request size through Vercel → zrok → Nginx → CLIProxyAPI;
- confirm whether image generation is available;
- document exact live request/response event format.

**Exit criteria:** verified gateway contract and supported capability matrix.

## Phase 1 — Foundation and secure text chat

- initialize Next.js/TypeScript project;
- add lint, tests, CI, security headers;
- create stateless `/api/chat` proxy;
- implement model allowlist;
- implement basic streaming chat;
- implement stop/retry;
- create responsive shell;
- ensure no secrets in client bundle.

**Exit criteria:** public preview can open and chat with text safely without login.

## Phase 2 — Local conversation system

- IndexedDB schema;
- conversation CRUD;
- message persistence;
- drafts;
- search;
- rename/pin/archive/delete;
- settings persistence;
- multi-tab synchronization;
- storage quota UI;
- export/import;
- clear all data.

**Exit criteria:** reload/browser restart preserves chats locally and no server data store exists.

## Phase 3 — PWA

- manifest and icons;
- service worker;
- offline shell;
- offline conversation reading;
- install UX;
- update UX;
- standalone mobile polish;
- PWA tests.

**Exit criteria:** installable PWA with reliable offline shell and local history access.

## Phase 4 — Image input and rich chat

- image paste/drop/picker;
- local validation;
- EXIF removal;
- client compression;
- IndexedDB Blob storage;
- gateway `input_image` conversion;
- model capability guard;
- attachment export/import;
- mobile camera testing.

**Exit criteria:** verified vision model can analyze an uploaded image without server persistence.

## Phase 5 — Full chat ergonomics

- Markdown/GFM;
- code blocks and copy;
- message editing;
- branching;
- regenerate variants;
- response details;
- read-aloud;
- prompt presets;
- improved title generation;
- keyboard shortcuts;
- accessibility hardening.

**Exit criteria:** feature-complete daily-use chat experience.

## Phase 6 — Public launch hardening

- platform rate limiting/firewall;
- concurrency controls;
- budget monitoring;
- load testing;
- error observability without content logging;
- dependency audit;
- CSP verification;
- privacy documentation;
- data-loss warnings;
- production smoke tests.

**Exit criteria:** controlled public launch with abuse and cost safeguards.

## Phase 7 — Optional advanced features

Only after the core product is stable:

- image generation if verified;
- local passphrase encryption;
- folders/tags;
- local prompt library;
- local document text extraction;
- speech input/output using browser capabilities;
- multilingual UI and RTL;
- share/export one conversation as Markdown/PDF;
- install shortcuts and share target;
- local-only usage statistics.

---

## 18. Acceptance criteria for version 1.0

Version 1.0 is complete when all statements below are true:

1. A new visitor can open the production URL and send a message without login.
2. Gateway secrets never enter browser code or storage.
3. Text responses stream through the existing HomePilot path.
4. The user can stop, retry, regenerate, edit, and branch conversations.
5. Conversations survive reload and browser restart through IndexedDB.
6. No application database, Blob store, KV store, or server-side chat storage exists.
7. The user can search, rename, pin, archive, delete, export, import, and clear chats.
8. The PWA is installable and opens in standalone mode.
9. The app shell and local history work offline.
10. New AI prompts clearly require connectivity.
11. Image input works with at least one verified allowed model.
12. Images are compressed client-side and remain within transport limits.
13. User content is not written to application logs.
14. Markdown output is sanitized.
15. Public rate limiting and model/output limits are active.
16. The application meets agreed accessibility, performance, unit, integration, E2E, and PWA checks.
17. Clearing browser site data removes all local HelloAI user data.
18. Export/import is the documented method for moving chats between devices.

---

## 19. Explicit limitations to communicate to users

The product should state clearly:

- Chats are stored only on this device/browser profile.
- Clearing browser data, using private browsing, uninstalling in some environments, or browser eviction can delete chats.
- There is no password recovery or cloud restore.
- Export is required to back up or transfer chats.
- The PWA can open offline, but AI generation requires internet connectivity.
- The owner’s shared gateway powers all requests; availability and model access may change.
- Local privacy does not mean the AI provider never processes the submitted content; prompts and images must travel through the gateway to the selected provider to generate a response.

---

## 20. Principal risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Public endpoint abuse | Unexpected quota/cost or service exhaustion | Vercel Firewall/rate limits, strict model/output limits, concurrency caps, budget alerts |
| Secret exposure | Gateway compromise | Server-only variables, stateless same-origin proxy, bundle scanning, no direct browser gateway calls |
| Browser storage loss | User loses history | Persistent-storage request, quota UI, export reminders, clear limitation messaging |
| Large image payload | HTTP 413 or slow mobile experience | Client resize/compression, encoded-size check, low default limits |
| Unsupported model capability | Failed image or reasoning request | Live model catalog, capability matrix, server allowlist, graceful fallback |
| Service-worker stale version | Broken UI or schema mismatch | versioned caches, explicit update flow, IndexedDB migrations |
| Malicious model output | XSS/phishing | sanitized Markdown, CSP, safe links, no raw HTML execution |
| Multi-tab duplicate generation | Duplicate usage and inconsistent local state | BroadcastChannel generation lock and request IDs |
| No durable quota identity | Weak per-user enforcement | platform IP/device rate controls; acknowledge limitation or add identity later |
| Provider/infrastructure logging | Privacy expectations mismatch | accurate privacy notice, minimized application logs, `store: false` where supported |

---

## 21. Initial implementation backlog

### Architecture and setup

- [ ] Initialize Next.js App Router project with strict TypeScript.
- [ ] Configure Node.js 24, ESLint, formatting, Vitest, Playwright, and CI.
- [ ] Add security headers and environment validation.
- [ ] Create gateway capability test scripts.

### Gateway

- [ ] Implement server-only gateway configuration.
- [ ] Implement allowed-model parser.
- [ ] Implement `/api/models`.
- [ ] Implement streaming `/api/chat`.
- [ ] Implement sanitized errors and abort propagation.
- [ ] Add request/body/concurrency limits.

### Local data

- [ ] Define IndexedDB schema and migrations.
- [ ] Implement conversation and message repositories.
- [ ] Implement drafts and multi-tab sync.
- [ ] Add export/import and storage usage UI.

### Chat UI

- [ ] Build responsive shell and sidebar.
- [ ] Build composer and streamed message list.
- [ ] Add stop, retry, regenerate, edit, and branch.
- [ ] Add Markdown, code blocks, copy actions, and sanitization.

### PWA

- [ ] Add manifest, icons, offline route, and service worker.
- [ ] Define cache exclusions for API requests.
- [ ] Add install and update prompts.
- [ ] Test standalone and offline behavior.

### Images

- [ ] Verify live model vision support.
- [ ] Add image validation, metadata stripping, resize, and compression.
- [ ] Store images as IndexedDB Blobs.
- [ ] Convert images to upstream `input_image` format.
- [ ] Test mobile camera, paste, drag/drop, and export/import.

### Launch

- [ ] Configure Vercel project and environment variables.
- [ ] Configure platform rate limiting/firewall.
- [ ] Run security, accessibility, PWA, and load checks.
- [ ] Add README, privacy statement, limitations, and recovery/export guidance.

---

## 22. Recommended first implementation decision

Begin with **Phase 0 and Phase 1 only**. Do not build the complete local database or image UI until the live gateway’s streaming and image contracts are verified through the exact production route.

The first technical deliverable should prove:

```text
HelloAI browser
  → Vercel /api/chat
  → HomePilot gateway
  → CLIProxyAPI
  → selected model
  → streamed response back to browser
```

with no login, no persistence, no exposed credentials, and no CORS problem. Once that path is stable, add IndexedDB and the PWA layers incrementally.

---

## 23. Reference documentation

- Next.js PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps
- Next.js Route Handlers: https://nextjs.org/docs/app/getting-started/route-handlers
- Vercel Functions: https://vercel.com/docs/functions
- Vercel environment variables: https://vercel.com/docs/environment-variables
- Vercel Function request-body limit guidance: https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions
- MDN installable PWA guide: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- MDN storage quotas and eviction: https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- MDN persistent storage: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
- MDN IndexedDB: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
- Serwist Next.js integration: https://serwist.pages.dev/docs/next

---

## 24. Final architecture statement

HelloAI will be a **local-first, no-login PWA with no application-level server persistence**. Browser storage owns user data. Vercel hosts the app and a minimal stateless security proxy. The existing HomePilot/CLIProxyAPI installation owns AI execution. This design preserves the “open and chat” experience while preventing gateway-secret exposure and avoiding the CORS failure inherent in direct browser-to-zrok calls.
