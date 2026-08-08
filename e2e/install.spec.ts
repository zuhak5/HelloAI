import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("Android Chrome does not offer a shortcut fallback before native install is ready", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "Android WebAPK UX is verified with the Pixel/Chrome project.");
  await page.goto("/");
  await page.getByRole("button", { name: "Open conversation sidebar" }).click();
  await page.getByRole("button", { name: "Install app" }).click();

  const dialog = page.getByRole("dialog", { name: "Install as an Android app" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Waiting for Chrome app install")).toBeVisible();
  await expect(dialog.getByText(/Do not choose Create shortcut/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Install Android app" })).toBeHidden();
});

test("Android Chrome consumes a pre-captured native install prompt", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "Android WebAPK UX is verified with the Pixel/Chrome project.");
  await page.addInitScript(() => {
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" }>;
    };
    event.prompt = async () => {
      (window as Window & { __installPromptOpened?: boolean }).__installPromptOpened = true;
    };
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    (window as Window & { __helloaiInstallPrompt?: Event }).__helloaiInstallPrompt = event;
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open conversation sidebar" }).click();
  await page.getByRole("button", { name: "Install app" }).click();

  const dialog = page.getByRole("dialog", { name: "Install as an Android app" });
  await expect(dialog.getByText("Ready for Android app install")).toBeVisible();
  await dialog.getByRole("button", { name: "Install Android app" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __installPromptOpened?: boolean }).__installPromptOpened)).toBe(true);
});
