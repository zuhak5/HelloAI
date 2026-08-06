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

test("opens directly into a usable local-first chat", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/HelloAI/);
  await expect(page.getByRole("heading", { name: "What can I help with?" })).toBeVisible();
  await expect(page.getByLabel("Message HelloAI")).toBeEditable();
  await expect(page.getByText("Private local workspace")).toBeVisible();
  await expect(page.getByRole("main")).not.toHaveAttribute("aria-busy", "true");
});

test("uses a suggestion and completes a streamed chat response", async ({ page }) => {
  await page.route("**/api/chat", (route) => route.fulfill({
    status: 200,
    contentType: "text/event-stream; charset=utf-8",
    body: [
      'data: {"delta":"A concise "}\n\n',
      'data: {"delta":"answer."}\n\n',
      'data: {"type":"response.completed","response":{"model":"gpt-5.6-terra","usage":{"input_tokens":8,"output_tokens":3}}}\n\n',
      "data: [DONE]\n\n",
    ].join(""),
  }));

  await page.goto("/");
  await page.getByRole("button", { name: /Explain a difficult idea simply/ }).click();
  const composer = page.getByLabel("Message HelloAI");
  await expect(composer).toHaveValue("Explain a difficult idea simply");
  await composer.press("Enter");
  await expect(page.getByText("A concise answer.")).toBeVisible();
  await expect(page.getByText(/3 tokens/)).toBeVisible();
});

test("traps focus in settings and restores it after Escape", async ({ page }) => {
  await page.goto("/");
  const settingsButton = page.getByRole("button", { name: "Open settings" });
  await settingsButton.focus();
  await settingsButton.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(settingsButton).toBeFocused();
});

test("supports keyboard search and a narrow mobile layout without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await expect(page.getByLabel("Message HelloAI")).toBeEditable();
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Search conversations")).toBeFocused();
  await expect(page.getByLabel("Conversation navigation")).toBeVisible();
  await page.getByRole("button", { name: "Close sidebar" }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByLabel("Message HelloAI")).toBeVisible();
});

test("provides install UI even when the browser does not expose a native prompt", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open conversation sidebar" }).click();
  await page.getByRole("button", { name: "Install app" }).click();
  const dialog = page.getByRole("dialog", { name: "Install HelloAI" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Manual installation available|Ready to install/)).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Install on this browser" })).toBeVisible();
});

test("uses a captured beforeinstallprompt event from the custom install action", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto("/");
  await expect(page.getByLabel("Message HelloAI")).toBeEditable();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt") as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" }>;
    };
    event.prompt = async () => { (window as Window & { __installPromptOpened?: boolean }).__installPromptOpened = true; };
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install HelloAI" }).click();
  await page.getByRole("button", { name: "Install now" }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __installPromptOpened?: boolean }).__installPromptOpened)).toBe(true);
});

test("removes queued images when switching to a text-only model", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Image capability transition is covered once in Chromium.");
  await page.goto("/");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64");
  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: /Remove sample\.webp/ })).toBeVisible();
  await page.getByLabel("Model").selectOption("text-only");
  await expect(page.getByRole("button", { name: /Remove sample\.webp/ })).toBeHidden();
  await expect(page.getByText(/removed because Text only is text-only/)).toBeVisible();
  await expect(page.getByText(/Text model · Enter to send/)).toBeVisible();
});

test("does not truncate a conversation when regeneration becomes unavailable", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "The destructive availability transition is covered once in Chromium.");
  await page.route("**/api/chat", (route) => route.fulfill({
    status: 200,
    contentType: "text/event-stream; charset=utf-8",
    body: 'data: {"delta":"Reply"}\n\ndata: [DONE]\n\n',
  }));
  await page.goto("/");
  const composer = page.getByLabel("Message HelloAI");
  await composer.fill("First prompt");
  await composer.press("Enter");
  await expect(page.getByText("Reply")).toBeVisible();
  await composer.fill("Second prompt remains");
  await composer.press("Enter");
  await expect(page.getByText("Second prompt remains")).toBeVisible();
  await page.getByRole("button", { name: "Regenerate" }).first().click();
  await expect(page.getByRole("alertdialog", { name: "Regenerate from this point?" })).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByText(/HelloAI is offline/)).toBeVisible();
  await page.getByRole("button", { name: "Regenerate response" }).click();
  await expect(page.getByText("Second prompt remains")).toBeVisible();
  await expect(page.getByText(/conversation was not changed/)).toBeVisible();
});

test("keeps core controls usable across target viewport classes", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "The exhaustive viewport matrix runs once on Chromium; engine coverage is provided by all other tests.");
  await page.goto("/");
  const viewports = [
    { width: 320, height: 568 },
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1080 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await expect(page.getByLabel("Message HelloAI")).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOverflow: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(dimensions.horizontalOverflow, `${viewport.width}x${viewport.height} document overflow`).toBeLessThanOrEqual(1);
    expect(dimensions.bodyOverflow, `${viewport.width}x${viewport.height} body overflow`).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 640, height: 700 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
