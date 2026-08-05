export type MessageRole = "system" | "user" | "assistant";
export type MessageStatus = "complete" | "streaming" | "cancelled" | "error";

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image";
  attachmentId: string;
  name: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
}

export type MessagePart = TextPart | ImagePart;

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
  model: string;
  draft: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  parts: MessagePart[];
  createdAt: string;
  status: MessageStatus;
  error?: string;
  requestId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

export interface AttachmentRecord {
  id: string;
  conversationId: string;
  messageId: string;
  name: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  size: number;
  blob: Blob;
  createdAt: string;
}

export interface PendingImage {
  id: string;
  name: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  size: number;
  blob: Blob;
  previewUrl: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  vision: boolean;
  reasoning: boolean;
  available: boolean;
}

export interface Preferences {
  theme: "system" | "light" | "dark";
  model: string;
  systemPrompt: string;
  maxOutputTokens: number;
  reasoning: "off" | "low" | "medium" | "high";
  fontSize: "small" | "medium" | "large";
  compact: boolean;
}

export interface BrowserTextPart {
  type: "text";
  text: string;
}

export interface BrowserImagePart {
  type: "image";
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  dataUrl: string;
  width: number;
  height: number;
}

export interface BrowserChatMessage {
  id: string;
  role: MessageRole;
  content: Array<BrowserTextPart | BrowserImagePart>;
}

export interface ChatRequestPayload {
  conversationId: string;
  requestId: string;
  model: string;
  messages: BrowserChatMessage[];
  maxOutputTokens: number;
  reasoning?: "low" | "medium" | "high";
}

export interface ChatStreamMeta {
  responseId?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}
