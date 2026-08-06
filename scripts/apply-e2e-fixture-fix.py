from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "e2e/app.spec.ts",
    '''test("removes queued images when switching to a text-only model", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Image capability transition is covered once in Chromium.");
  await page.goto("/");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64");
  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({ name: "sample.png", mimeType: "image/png", buffer: png });
''',
    '''test("removes queued images when switching to a text-only model", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Image capability transition is covered once in Chromium.");
  await page.goto("/");
  const pngBytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.fillStyle = "#4f46e5";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG fixture creation failed.")), "image/png");
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: "sample.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngBytes),
  });
''',
)

replace_once(
    "e2e/app.spec.ts",
    '''test("does not truncate a conversation when regeneration becomes unavailable", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "The destructive availability transition is covered once in Chromium.");
''',
    '''test("does not truncate a conversation when regeneration becomes unavailable", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The destructive availability transition is covered once in Chromium.");
''',
)
