export type PwaPlatform = "ios" | "android" | "macos" | "windows" | "linux" | "other";
export type PwaBrowser = "safari" | "chrome" | "edge" | "opera" | "samsung" | "brave" | "chromium" | "firefox" | "other";

export interface PwaClientInfo {
  platform: PwaPlatform;
  browser: PwaBrowser;
}

export interface PwaDetectionInput {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  isBrave?: boolean;
}

export function detectPwaClient({ userAgent, platform = "", maxTouchPoints = 0, isBrave = false }: PwaDetectionInput): PwaClientInfo {
  const ua = userAgent.toLowerCase();
  const platformValue = platform.toLowerCase();
  const ipadDesktopMode = platformValue === "macintel" && maxTouchPoints > 1;

  let detectedPlatform: PwaPlatform = "other";
  if (/iphone|ipad|ipod/.test(ua) || ipadDesktopMode) detectedPlatform = "ios";
  else if (/android/.test(ua)) detectedPlatform = "android";
  else if (/macintosh|mac os x/.test(ua) || platformValue.startsWith("mac")) detectedPlatform = "macos";
  else if (/windows/.test(ua) || platformValue.startsWith("win")) detectedPlatform = "windows";
  else if (/linux/.test(ua) || platformValue.startsWith("linux")) detectedPlatform = "linux";

  let browser: PwaBrowser = "other";
  if (/firefox|fxios/.test(ua)) browser = "firefox";
  else if (/samsungbrowser/.test(ua)) browser = "samsung";
  else if (/edga|edgios|edg\//.test(ua)) browser = "edge";
  else if (/opr\//.test(ua)) browser = "opera";
  else if (isBrave) browser = "brave";
  else if (/chrome|crios/.test(ua)) browser = "chrome";
  else if (/chromium/.test(ua)) browser = "chromium";
  else if (/safari/.test(ua) && !/android/.test(ua)) browser = "safari";

  return { platform: detectedPlatform, browser };
}

export function isAndroidChromeWebApkTarget({ platform, browser }: PwaClientInfo): boolean {
  return platform === "android" && browser === "chrome";
}

export function getPwaInstallInstructions(client: PwaClientInfo): string[] {
  const { platform, browser } = client;

  if (platform === "ios") {
    return [
      "Open HelloAI in Safari.",
      "Tap the Share button in Safari's toolbar.",
      "Choose Add to Home Screen, then tap Add.",
    ];
  }

  if (platform === "android" && browser === "chrome") {
    return [
      "Keep HelloAI open in Google Chrome for at least 30 seconds and tap the page at least once.",
      "Wait until this dialog says Ready for Android app install, then use Install Android app.",
      "Accept Chrome's native installation prompt. Do not choose Create shortcut.",
      "If Chrome never offers app installation, confirm Google Play Services is enabled and Chrome is up to date.",
    ];
  }

  if (platform === "android") {
    return [
      "Open this same HelloAI URL in Google Chrome.",
      "Use HelloAI in Chrome until Chrome exposes its native app installation prompt.",
      "Install only from Chrome's Install app flow; do not use Create shortcut.",
      "A WebAPK requires a supported browser/device minting service, normally Google Chrome with Google Play Services.",
    ];
  }

  if (platform === "macos" && browser === "safari") {
    return [
      "Open HelloAI in Safari 17 or later.",
      "Choose File, then Add to Dock.",
      "Confirm the app name and select Add.",
    ];
  }

  if (["chrome", "edge", "opera", "brave", "chromium"].includes(browser)) {
    return [
      "Use the Install now button when it is available.",
      "You can also open the browser menu and choose Install HelloAI or Install this site as an app.",
      "Confirm the browser installation dialog.",
    ];
  }

  if (browser === "firefox") {
    return [
      "Firefox desktop does not currently expose standalone web-app installation.",
      "Open HelloAI in Chrome, Edge, or Safari to install it as an app.",
      "You can still bookmark or pin this page in Firefox.",
    ];
  }

  return [
    "Open your browser's main menu.",
    "Look for Install app or Install this site as an app.",
    "Use Chrome, Edge, or Safari if your browser does not offer an installation action.",
  ];
}

export function isStandaloneDisplay(displayModeStandalone: boolean, navigatorStandalone = false): boolean {
  return displayModeStandalone || navigatorStandalone;
}
