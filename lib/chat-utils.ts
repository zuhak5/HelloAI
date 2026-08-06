import type { ChatMessage } from "@/lib/types";

export function messageText(message: ChatMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export function titleFromText(text: string, hasImage: boolean): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return hasImage ? "Image chat" : "New chat";
  return compact.length > 46 ? `${compact.slice(0, 43)}…` : compact;
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
