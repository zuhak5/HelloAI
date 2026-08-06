# HelloAI PWA, UI/UX, Accessibility, and Responsive Audit

Date: 2026-08-06
Baseline: `main` at `95dc9a4ccb89dc5b2bb8a33d79c4fe16e36c14f9`
Scope: installability, service-worker lifecycle, browser/platform guidance, every application screen and state, keyboard/focus behavior, responsive layout, performance-related UX, and release QA.

## Executive summary

The application already had a web app manifest, icon files, an Apple touch icon, and a service worker, but installation was effectively undiscoverable. The UI only rendered an install action after Chromium emitted `beforeinstallprompt`, and responsive CSS hid that action below 900 pixels. Browsers that do not implement the event, users who had dismissed it, and mobile users therefore saw no install surface at all.

The remediation introduces a persistent, capability-aware install experience; validates and expands manifest metadata; manages the service-worker lifecycle without forced background reloads; provides Safari/iOS, Safari macOS, Chromium, Android Firefox, and Firefox desktop guidance; reports installed and update states; and verifies the production PWA surface through browser automation.

A second complete UI/UX pass found and corrected additional focus-management, heading, settings-form, responsive, notification, and capability-messaging issues. No known release-blocking PWA, accessibility, layout, route, or core interaction defects remain in the audited surface.

## PWA findings and fixes

| ID | Severity | Finding | Resolution |
|---|---:|---|---|
| PWA-01 | Critical | The only install control existed after `beforeinstallprompt`, an event limited to Chromium-derived browsers. | Added a persistent install entry point and a browser-aware installation dialog. |
| PWA-02 | Critical | Responsive CSS hid the install action below 900 px, making installation undiscoverable on phones and tablets. | Exposed the header install action at every viewport and added a labeled sidebar action. |
| PWA-03 | High | Safari, iOS/iPadOS, and Firefox users had no instructions when a native prompt was unavailable. | Added platform/browser detection and concise manual installation steps. |
| PWA-04 | High | The service-worker component silently swallowed registration failures and exposed no readiness state. | Centralized PWA state in a provider with checking, ready, development, insecure, unsupported, and error states. |
| PWA-05 | High | Every waiting service worker was told to skip waiting automatically, followed by an unconditional page reload. This could interrupt a draft or active generation. | Updates now wait for explicit user action and reload only during the chosen update flow. |
| PWA-06 | Medium | Installed state was not tracked across `display-mode`, iOS `navigator.standalone`, or `appinstalled`. | Added installed-state synchronization for standard and Apple standalone modes. |
| PWA-07 | Medium | Manifest metadata omitted a stable app `id`, language, and direction. | Added `id`, `lang`, and `dir`, and retained required `name`, `short_name`, `start_url`, `scope`, and standalone display metadata. |
| PWA-08 | Medium | Installation assets were not exercised by automated tests. | Added signature and dimension checks for 192×192, 512×512, 512×512 maskable, and 180×180 Apple icons. |
| PWA-09 | Medium | Manifest, icon, and worker cache/header behavior was implicit. | Added explicit manifest content type/cache headers, immutable icon caching, and no-cache worker delivery with `Service-Worker-Allowed: /`. |
| PWA-10 | Medium | The service worker activated immediately and could replace a running version without user context. | Removed install-time `skipWaiting`; retained explicit update messaging and safe activation cleanup. |
| PWA-11 | Medium | Offline navigation did not use navigation preload and update behavior was opaque. | Added navigation preload, network-first navigation, versioned shell cleanup, and stale-while-revalidate static assets. |
| PWA-12 | Low | Local development could retain a stale production worker. | Development mode unregisters workers and clearly reports that install/offline support is enabled in production builds. |
| PWA-13 | Low | Mobile web-app metadata did not explicitly suppress automatic telephone/address/email detection. | Added format detection and mobile web-app capability metadata. |
| PWA-14 | Low | Update and install outcomes were not communicated to assistive technology. | Added status cards, live notifications, and a keyboard-operable update banner. |

## UI/UX and accessibility findings and fixes

| ID | Severity | Finding | Resolution |
|---|---:|---|---|
| UX-01 | High | Opening Settings from the mobile sidebar left two modal focus-management layers active. | Close the sidebar before opening Settings or installation UI. |
| A11Y-01 | High | The off-canvas mobile sidebar did not fully isolate and trap focus as a modal surface. | Added dialog semantics, focus trap, Escape handling, focus restoration, backdrop close, and inert workspace behavior. |
| A11Y-02 | Medium | Conversation pages could lack a stable level-one heading once messages existed. | Promoted the workspace/conversation title to `h1` and kept state headings subordinate. |
| UX-02 | Medium | Maximum-token input clamped every change, preventing natural clearing and replacement while editing. | Added a numeric draft, blur/Enter validation, and explicit range guidance. |
| UX-03 | Medium | Image-oriented suggestions remained generic when the selected model did not support vision. | Suggestions now communicate model capability and avoid implying unavailable image input. |
| UX-04 | Medium | Installation and offline readiness were absent from Settings. | Added a scannable application-status card linked to the installation dialog. |
| UI-01 | Medium | The install action lacked visual priority despite being a missing primary capability. | Added an accent treatment while preserving the established design system. |
| UI-02 | Medium | Update and toast surfaces could overlap at the bottom edge. | Offset notifications while an update banner is present and account for safe-area insets. |
| A11Y-03 | Medium | Some icon and action controls relied on implicit button behavior. | Standardized explicit `type="button"`, accessible labels, disabled states, and focus treatment. |
| A11Y-04 | Low | Message timestamps exposed only abbreviated visible text. | Added complete date/time accessible labels. |
| UX-05 | Low | The settings layout lacked strong sectional scanning. | Added labeled Appearance/Responses and Application/Storage sections. |
| UI-03 | Low | Small search-clear controls were below comfortable touch size. | Increased the control footprint and retained coarse-pointer minimums. |
| RWD-01 | High | PWA install affordance disappeared on mobile. | Removed the mobile hide rule and verified 320 px through ultrawide widths. |
| RWD-02 | Medium | Low-height landscape layouts spent excessive vertical space on decorative onboarding content. | Reduced header/hero spacing and hid nonessential disclaimer content in constrained landscape mode. |
| RWD-03 | Medium | Ultrawide layouts allowed excessive reading width. | Added bounded message/composer widths and a proportionate sidebar token. |
| RWD-04 | Low | Dialog, toast, and update surfaces needed safer bottom-edge behavior on notched devices. | Applied dynamic viewport and safe-area-aware positioning. |
| PERF-01 | Medium | Automatic update reloads could destroy interaction continuity. | Updates are now user-controlled and announced. |
| PERF-02 | Low | The service worker did not refresh opportunistically after returning to the tab. | Added visibility-driven update checks without blocking interaction. |

## Device and browser test matrix

Automated Playwright coverage now runs against:

- Desktop Chromium, Firefox, and WebKit.
- Pixel 7-equivalent mobile Chromium.
- iPhone 13-equivalent mobile WebKit.
- Viewports: 320×568, 360×800, 390×844, 844×390 landscape, 768×1024, 1024×768, 1366×768, 1920×1080, and 2560×1080.
- A 200% CSS zoom overflow check.
- Console warnings/errors and uncaught page errors.
- Core chat, streamed response, keyboard search, modal focus, native install-event simulation, manual installation guidance, service-worker control, icon dimensions, manifest headers, and offline navigation.

These browser engines and emulated devices provide deterministic regression coverage. Physical-device checks remain advisable before a major public launch because operating-system share sheets, browser chrome, text rendering, virtual keyboards, and installation surfaces are controlled by the platform and cannot be reproduced perfectly by headless automation.

## Installability checklist

- [x] Manifest is linked from application metadata.
- [x] Manifest contains app identity, standalone display, start URL, scope, theme/background colors, and categories.
- [x] 192×192 and 512×512 `any` icons are declared.
- [x] A 512×512 maskable icon is declared.
- [x] A 180×180 Apple touch icon is linked.
- [x] Service worker is served from the root with root scope permission.
- [x] Service worker registers only in secure production contexts and is disabled safely during local development.
- [x] Navigation has an offline fallback and API traffic is never cached.
- [x] Chromium `beforeinstallprompt` is captured and invoked only from a user gesture.
- [x] Installed state and `appinstalled` are handled.
- [x] Safari/iOS and non-prompt browser guidance is available.
- [x] Update activation is explicit and does not unexpectedly reload active work.
- [x] Production E2E checks validate manifest, assets, worker registration, control, and offline navigation.

## QA gates

The branch must pass all of the following before merge:

1. Dependency audit at high severity.
2. ESLint.
3. TypeScript typecheck.
4. Unit tests, including PWA metadata/platform detection.
5. Production Next.js build.
6. Cross-browser Playwright suite against the production server.
7. Deployment status checks.
8. Post-merge verification on `main`.

## Remaining operational limitations

- Real browser installation prompts are subject to browser engagement heuristics, user policy, prior dismissal, and whether the app is already installed. The persistent HelloAI install UI provides a direct prompt when available and manual guidance otherwise.
- Firefox desktop does not currently expose manifest-based standalone PWA installation; the application explains this and remains fully usable as a website.
- Offline mode preserves the application shell and access to browser-local history; new AI generations still require the configured gateway and network access.
- A final manual pass on representative physical iOS, Android, Windows, and macOS devices is recommended for release certification, particularly for OS-controlled share/install sheets and virtual-keyboard behavior.
