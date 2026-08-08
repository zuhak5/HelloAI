import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { detectPwaClient, getPwaInstallInstructions, isAndroidChromeWebApkTarget, isStandaloneDisplay } from "@/lib/pwa";

describe("PWA manifest", () => {
  it("contains the required standalone installability metadata", () => {
    const value = manifest();
    expect(value.id).toBe("/");
    expect(value.start_url).toBe("/");
    expect(value.scope).toBe("/");
    expect(value.display).toBe("standalone");
    expect(value.display_override).toContain("standalone");
    expect(value.prefer_related_applications).toBe(false);
    expect(value.name).toBeTruthy();
    expect(value.short_name).toBeTruthy();
    expect(value.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any" }),
      expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
    ]));
  });
});

describe("PWA client guidance", () => {
  it("detects iPadOS desktop-mode Safari", () => {
    const client = detectPwaClient({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    expect(client).toEqual({ platform: "ios", browser: "safari" });
    expect(getPwaInstallInstructions(client).join(" ")).toMatch(/Add to Home Screen/);
  });

  it("identifies Google Chrome on Android as the WebAPK target", () => {
    const client = detectPwaClient({
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
    });
    expect(client).toEqual({ platform: "android", browser: "chrome" });
    expect(isAndroidChromeWebApkTarget(client)).toBe(true);
    expect(getPwaInstallInstructions(client).join(" ")).toMatch(/Do not choose Create shortcut/);
  });

  it("does not mislabel Android Edge or Brave as the Chrome WebAPK target", () => {
    const edge = detectPwaClient({
      userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/148.0.0.0 Mobile Safari/537.36 EdgA/148.0.0.0",
    });
    const brave = detectPwaClient({
      userAgent: "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/148.0.0.0 Mobile Safari/537.36",
      isBrave: true,
    });
    expect(edge.browser).toBe("edge");
    expect(brave.browser).toBe("brave");
    expect(isAndroidChromeWebApkTarget(edge)).toBe(false);
    expect(isAndroidChromeWebApkTarget(brave)).toBe(false);
  });

  it("provides an explicit Firefox desktop limitation", () => {
    const client = detectPwaClient({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0",
      platform: "Linux x86_64",
    });
    expect(client).toEqual({ platform: "linux", browser: "firefox" });
    expect(getPwaInstallInstructions(client).join(" ")).toMatch(/does not currently expose standalone web-app installation/);
  });

  it("recognizes browser and navigator standalone modes", () => {
    expect(isStandaloneDisplay(true, false)).toBe(true);
    expect(isStandaloneDisplay(false, true)).toBe(true);
    expect(isStandaloneDisplay(false, false)).toBe(false);
  });
});
