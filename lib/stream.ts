import type { ChatStreamMeta } from "@/lib/types";

export interface StreamCallbacks {
  onText: (delta: string) => void;
  onMeta?: (meta: ChatStreamMeta) => void;
}

function extractMeta(value: Record<string, unknown>): ChatStreamMeta {
  const response = (value.response && typeof value.response === "object" ? value.response : value) as Record<string, unknown>;
  const usage = response.usage && typeof response.usage === "object" ? response.usage as Record<string, unknown> : {};
  return {
    responseId: typeof response.id === "string" ? response.id : undefined,
    model: typeof response.model === "string" ? response.model : undefined,
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
  };
}

export function parseEventData(raw: string, callbacks: StreamCallbacks): void {
  const data = raw.trim();
  if (!data || data === "[DONE]") return;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return;
  }

  if (typeof value.delta === "string") callbacks.onText(value.delta);
  const choices = Array.isArray(value.choices) ? value.choices : [];
  const first = choices[0] as { delta?: { content?: unknown }; message?: { content?: unknown } } | undefined;
  if (typeof first?.delta?.content === "string") callbacks.onText(first.delta.content);
  if (typeof first?.message?.content === "string") callbacks.onText(first.message.content);

  if (value.type === "response.completed" || value.type === "response.done" || value.response) {
    callbacks.onMeta?.(extractMeta(value));
  }
}

export async function consumeGatewayStream(response: Response, callbacks: StreamCallbacks): Promise<void> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || `Request failed with HTTP ${response.status}.`);
  }
  if (!response.body) throw new Error("The gateway returned no response stream.");

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") && !contentType.includes("stream")) {
    const value = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!value) throw new Error("The gateway returned an unreadable response.");
    const outputText = typeof value.output_text === "string" ? value.output_text : "";
    if (outputText) callbacks.onText(outputText);
    callbacks.onMeta?.(extractMeta(value));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || "";
    for (const event of events) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      parseEventData(data, callbacks);
    }
  }
  if (buffer.trim()) {
    const data = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    parseEventData(data, callbacks);
  }
}
