import type { Preferences } from "@/lib/types";

const KEY = "helloai.preferences.v1";
export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  model: "gpt-5.6-terra",
  systemPrompt: "You are a capable, accurate, and concise AI assistant.",
  maxOutputTokens: 1200,
  reasoning: "medium",
  fontSize: "medium",
  compact: false,
};

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<Preferences> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFERENCES;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      maxOutputTokens: Math.min(8000, Math.max(16, Number(parsed.maxOutputTokens) || DEFAULT_PREFERENCES.maxOutputTokens)),
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(value: Preferences): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("helloai:preferences", { detail: value }));
}

export function applyTheme(preferences: Preferences): void {
  if (typeof document === "undefined") return;
  const dark = preferences.theme === "dark" ||
    (preferences.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.fontSize = preferences.fontSize;
  document.documentElement.dataset.compact = preferences.compact ? "true" : "false";
}
