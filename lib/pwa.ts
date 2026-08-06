export type PwaPlatform = "ios" | "android" | "macos" | "windows" | "linux" | "other";
export type PwaBrowser = "safari" | "chromium" | "firefox" | "other";

export interface PwaClientInfo {
  platform: PwaPlatform;
  browser: PwaBrowser;
}

export interface PwaDetectionInput {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}

export function detectPwaClient({ userAgent, platform = "", maxTouchPoints = 0 }: PwaDetectionInput): PwaClientInfo {
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
  else if (/edg|chrome|chromium|crios|opr\//.test(ua)) browser = "chromium";
  else if (/safari/.test(ua) && !/android/.test(ua)) browser = "safari";

  return { platform: detectedPlatform, browser };
}

export function getPwaInstallInstructions({ platform, browser }: PwaClientInfo): string[] {
  if (platform === "ios") {
    return [
      "Open HelloAI in Safari.",
      "Tap the Share button in Safari's toolbar.",
      "Choose Add to Home Screen, then tap Add.",
    ];
  }

  if (platform === "macos" && browser === "safari") {
    return [
      "Open HelloAI in Safari 17 or later.",
      "Choose File, then Add to Dock.",
      "Confirm the app name and select Add.",
    ];
  }

  if (browser === "chromium") {
    return [
      "Use the Install now button when it is available.",
      "You can also open the browser menu and choose Install HelloAI or Apps → Install this site as an app.",
      "Confirm the installation dialog.",
    ];
  }

  if (platform === "android" && browser === "firefox") {
    return [
      "Open the Firefox menu.",
      "Choose Install or Add to Home screen.",
      "Confirm the installation.",
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
    "Look for Install app, Add to Home screen, or Create shortcut.",
    "Use Chrome, Edge, or Safari if your browser does not offer an installation action.",
  ];
}

export function isStandaloneDisplay(displayModeStandalone: boolean, navigatorStandalone = false): boolean {
  return displayModeStandalone || navigatorStandalone;
}
