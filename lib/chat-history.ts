import { getAttachment } from "@/lib/db";
import { blobToDataUrl } from "@/lib/images";
import { messageText } from "@/lib/chat-utils";
import type { BrowserChatMessage, ChatMessage } from "@/lib/types";

export async function serializeHistory(history: ChatMessage[], systemPrompt: string): Promise<BrowserChatMessage[]> {
  const eligible = history
    .filter((message) => message.status !== "streaming" && (messageText(message).trim() || message.parts.some((part) => part.type === "image")))
    .slice(-40);
  const allowedImageIds = new Set<string>();

  for (const message of [...eligible].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type === "image" && allowedImageIds.size < 3) allowedImageIds.add(part.attachmentId);
    }
  }

  const serialized: BrowserChatMessage[] = [];
  if (systemPrompt.trim()) {
    serialized.push({ id: crypto.randomUUID(), role: "system", content: [{ type: "text", text: systemPrompt.trim() }] });
  }

  for (const message of eligible) {
    const content: BrowserChatMessage["content"] = [];
    for (const part of message.parts) {
      if (part.type === "text" && part.text.trim()) content.push({ type: "text", text: part.text });
      if (part.type !== "image") continue;
      if (!allowedImageIds.has(part.attachmentId)) {
        content.push({ type: "text", text: `[Earlier image omitted from this request: ${part.name}]` });
        continue;
      }
      const attachment = await getAttachment(part.attachmentId);
      if (!attachment) continue;
      content.push({
        type: "image",
        mediaType: attachment.mediaType,
        dataUrl: await blobToDataUrl(attachment.blob),
        width: attachment.width,
        height: attachment.height,
      });
    }
    if (content.length) serialized.push({ id: message.id, role: message.role, content });
  }

  return serialized;
}
