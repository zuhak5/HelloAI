import type { Preferences } from "@/lib/types";

const KEY = "helloai.preferences.v1";
const THEMES = new Set<Preferences["theme"]>(["system", "light", "dark"]);
const REASONING = new Set<Preferences["reasoning"]>(["off", "low", "medium", "high"]);
const FONT_SIZES = new Set<Preferences["fontSize"]>(["small", "medium", "large"]);

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  model: "gpt-5.6-luna",
  systemPrompt: "You are a capable, accurate, and concise AI assistant.",
  maxOutputTokens: 1200,
  reasoning: "medium",
  fontSize: "medium",
  compact: false,
};

function enumValue<T extends string>(value: unknown, allowed: Set<T>, fallback: T): T {
  return typeof value === "string" && allowed.has(value as T) ? value as T : fallback;
}

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<Preferences> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFERENCES;
    return {
      theme: enumValue(parsed.theme, THEMES, DEFAULT_PREFERENCES.theme),
      model: typeof parsed.model === "string" && parsed.model.length <= 100 ? parsed.model : DEFAULT_PREFERENCES.model,
      systemPrompt: typeof parsed.systemPrompt === "string" ? parsed.systemPrompt.slice(0, 10_000) : DEFAULT_PREFERENCES.systemPrompt,
      maxOutputTokens: Math.min(8000, Math.max(16, Number(parsed.maxOutputTokens) || DEFAULT_PREFERENCES.maxOutputTokens)),
      reasoning: enumValue(parsed.reasoning, REASONING, DEFAULT_PREFERENCES.reasoning),
      fontSize: enumValue(parsed.fontSize, FONT_SIZES, DEFAULT_PREFERENCES.fontSize),
      compact: typeof parsed.compact === "boolean" ? parsed.compact : DEFAULT_PREFERENCES.compact,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(value: Preferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("helloai:preferences", { detail: value }));
  } catch {
    // Preferences remain active for the current session when browser storage is unavailable.
  }
}

export function applyTheme(preferences: Preferences): void {
  if (typeof document === "undefined") return;
  const dark = preferences.theme === "dark" ||
    (preferences.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.fontSize = preferences.fontSize;
  document.documentElement.dataset.compact = preferences.compact ? "true" : "false";
}
