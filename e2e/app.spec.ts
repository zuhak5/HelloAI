import { expect, test } from "@playwright/test";

const modelsPayload = {
  defaultModel: "gpt-5.6-terra",
  enabled: true,
  models: [{ id: "gpt-5.6-terra", name: "gpt-5.6-terra", vision: true, reasoning: true, available: true }],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/models", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(modelsPayload),
  }));
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
  const composer = page.getByLabel("Message HelloAI");
  await expect(composer).toBeVisible();
  await composer.focus();
  await page.keyboard.press("Control+k");
  await expect(page.getByLabel("Search conversations")).toBeFocused();
  await expect(page.getByLabel("Conversation navigation")).toBeVisible();
  await page.getByRole("button", { name: "Close sidebar" }).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(composer).toBeVisible();
});
