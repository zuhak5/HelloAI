export const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function parseModelList(value: string | undefined, fallback: string[] = []): string[] {
  const models = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => MODEL_PATTERN.test(item));
  return [...new Set(models.length ? models : fallback)];
}
