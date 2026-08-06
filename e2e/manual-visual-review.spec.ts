import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const modelsPayload = {
  defaultModel: "gpt-5.6-terra",
  enabled: true,
  configured: true,
  models: [
    { id: "gpt-5.6-terra", name: "gpt-5.6-terra", vision: true, reasoning: true, available: true },
    { id: "text-only", name: "Text only", vision: false, reasoning: false, available: true },
  ],
};

const consoleProblems = new WeakMap<Page, string[]>();

test.beforeAll(async () => {
  await mkdir("manual-qa", { recursive: true });
});

test.beforeEach(async ({ page }) => {
  const problems: string[] = [];
  consoleProblems.set(page, problems);
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "warning" && text === "Service Worker registration blocked by Playwright") return;
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await page.route("**/api/models", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(modelsPayload),
  }));
});

test.afterEach(async ({ page }) => {
  expect(consoleProblems.get(page) || []).toEqual([]);
});

test("captures desktop light mode in each browser engine", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What can I help with?" })).toBeVisible();
  await expect(page.getByLabel("Message HelloAI")).toBeEditable();
  await page.screenshot({ path: `manual-qa/${testInfo.project.name}-desktop-light.png`, fullPage: true });
});

test("captures dark, dialog, install, mobile navigation, and offline states", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Representative state matrix is captured once in Chromium.");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByLabel("Message HelloAI")).toBeEditable();
  await page.screenshot({ path: "manual-qa/chromium-desktop-dark.png", fullPage: true });

  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.screenshot({ path: "manual-qa/chromium-settings-dark.png", fullPage: true });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Install app" }).click();
  await expect(page.getByRole("dialog", { name: "Install HelloAI" })).toBeVisible();
  await page.screenshot({ path: "manual-qa/chromium-install-dialog-dark.png", fullPage: true });
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.reload();
  await expect(page.getByLabel("Message HelloAI")).toBeEditable();
  await page.screenshot({ path: "manual-qa/chromium-mobile-light.png", fullPage: true });

  await page.getByRole("button", { name: "Open conversation sidebar" }).click();
  await expect(page.getByPlaceholder("Search local chats")).toBeVisible();
  await page.screenshot({ path: "manual-qa/chromium-mobile-sidebar-light.png", fullPage: true });
  await page.keyboard.press("Escape");

  await context.setOffline(true);
  try {
    await expect(page.getByText(/HelloAI is offline/)).toBeVisible();
    await page.screenshot({ path: "manual-qa/chromium-mobile-offline-light.png", fullPage: true });
  } finally {
    await context.setOffline(false);
  }
});
