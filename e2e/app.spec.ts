import { expect, test } from "@playwright/test";

test("opens directly into a usable local-first chat", async ({ page }) => {
  await page.route("**/api/models", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ defaultModel: "gpt-5.6-terra", enabled: true, models: [{ id: "gpt-5.6-terra", name: "gpt-5.6-terra", vision: true, reasoning: true, available: true }] }),
  }));
  await page.goto("/");
  await expect(page).toHaveTitle(/HelloAI/);
  await expect(page.getByRole("heading", { name: "What can I help with?" })).toBeVisible();
  await expect(page.getByLabel("Message HelloAI")).toBeEditable();
  await expect(page.getByText("Private local workspace")).toBeVisible();
});
