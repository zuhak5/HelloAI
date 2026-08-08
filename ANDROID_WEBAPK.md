# Android WebAPK installation

HelloAI targets the full Android WebAPK installation path when opened in Google Chrome.

A WebAPK is minted and signed by a trusted Android/browser provider; the web application cannot directly create or sideload that APK. On supported Android devices, Google Chrome normally uses Google Play Services and the WebAPK minting service. When that path succeeds, HelloAI appears in the app drawer and Android Settings → Apps and launches in standalone display mode without Chrome's address bar.

## HelloAI policy

HelloAI intentionally does **not** present a shortcut fallback to Android Chrome users while Chrome has not exposed the native `beforeinstallprompt` event.

The install dialog has three Android states:

- **Ready for Android app install** — Chrome exposed the native PWA prompt. Use **Install Android app**.
- **Waiting for Chrome app install** — Chrome has not exposed the native prompt yet. Do not create a shortcut.
- **Google Chrome required for WebAPK** — the current Android browser is not Google Chrome, so HelloAI directs the user to Chrome instead of suggesting a shortcut.

The browser still controls WebAPK minting. A supported Chrome version, HTTPS, an installable manifest, sufficient browser engagement, and a working Android WebAPK provider are required.

## Manifest contract

The manifest explicitly provides:

- stable `id`, `start_url`, and root `scope`;
- `display: "standalone"` and a standalone display override;
- 192 px, 512 px, and maskable icons;
- `prefer_related_applications: false` so Chrome installs the web app instead of redirecting to a native-store application;
- a stable application name, short name, description, colors, and shortcut.

## Native prompt capture

The root HTML installs a tiny `beforeinstallprompt` listener before React hydrates. It stores Chrome's one-shot install event on `window.__helloaiInstallPrompt`. `PwaProvider` consumes that event whether it fires before or after React mounts, preventing a race where Chrome considered HelloAI installable but the application missed the prompt and incorrectly fell back to manual guidance.

## Android test procedure

1. Remove any old browser-badged HelloAI shortcuts.
2. Use Google Chrome on Android.
3. Open the production HelloAI URL over HTTPS.
4. Tap/interact with the page and keep it open long enough for Chrome's installability heuristics.
5. Open HelloAI → **Install app**.
6. Continue only when the dialog says **Ready for Android app install**.
7. Tap **Install Android app** and accept Chrome's native prompt.
8. Verify HelloAI appears in the launcher and Settings → Apps and opens without browser chrome.

If Chrome remains on **Waiting for Chrome app install**, the web page has deliberately refused to create a shortcut. Check Chrome version, Google Play Services, device policy, network access to the WebAPK minting service, and whether the application is already installed in that Chrome profile.
