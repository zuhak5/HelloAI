import { z } from "zod";
import { importLocalData } from "@/lib/db";

const uuid = z.string().uuid();
const isoDate = z.string().datetime({ offset: true });
const mediaType = z.enum(["image/jpeg", "image/png", "image/webp"]);

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().max(30_000),
}).strict();

const imagePartSchema = z.object({
  type: z.literal("image"),
  attachmentId: uuid,
  name: z.string().min(1).max(255),
  mediaType,
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
}).strict();

const conversationSchema = z.object({
  id: uuid,
  title: z.string().min(1).max(100),
  createdAt: isoDate,
  updatedAt: isoDate,
  pinned: z.boolean(),
  archived: z.boolean(),
  model: z.string().min(1).max(100),
  draft: z.string().max(30_000),
}).strict();

const messageSchema = z.object({
  id: uuid,
  conversationId: uuid,
  role: z.enum(["system", "user", "assistant"]),
  parts: z.array(z.union([textPartSchema, imagePartSchema])).min(1).max(6),
  createdAt: isoDate,
  status: z.enum(["complete", "streaming", "cancelled", "error"]),
  error: z.string().max(2_000).optional(),
  requestId: uuid.optional(),
  model: z.string().max(100).optional(),
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
}).strict();

const attachmentSchema = z.object({
  id: uuid,
  conversationId: uuid,
  messageId: uuid,
  name: z.string().min(1).max(255),
  mediaType,
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  size: z.number().int().min(1).max(1_700_000),
  createdAt: isoDate,
  dataUrl: z.string()
    .max(2_300_000)
    .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Attachment data is invalid."),
}).strict();

const backupSchema = z.object({
  format: z.literal("helloai-export"),
  version: z.literal(1),
  exportedAt: isoDate,
  conversations: z.array(conversationSchema).max(5_000),
  messages: z.array(messageSchema).max(100_000),
  attachments: z.array(attachmentSchema).max(5_000),
}).strict().superRefine((backup, context) => {
  const conversationIds = new Set(backup.conversations.map((conversation) => conversation.id));
  const messageById = new Map(backup.messages.map((message) => [message.id, message]));
  const attachmentById = new Map(backup.attachments.map((attachment) => [attachment.id, attachment]));

  if (conversationIds.size !== backup.conversations.length) {
    context.addIssue({ code: "custom", path: ["conversations"], message: "Conversation IDs must be unique." });
  }
  if (messageById.size !== backup.messages.length) {
    context.addIssue({ code: "custom", path: ["messages"], message: "Message IDs must be unique." });
  }
  if (attachmentById.size !== backup.attachments.length) {
    context.addIssue({ code: "custom", path: ["attachments"], message: "Attachment IDs must be unique." });
  }

  for (const [index, message] of backup.messages.entries()) {
    if (!conversationIds.has(message.conversationId)) {
      context.addIssue({ code: "custom", path: ["messages", index, "conversationId"], message: "Message references an unknown conversation." });
    }
    for (const [partIndex, part] of message.parts.entries()) {
      if (part.type !== "image") continue;
      const attachment = attachmentById.get(part.attachmentId);
      if (!attachment || attachment.messageId !== message.id || attachment.conversationId !== message.conversationId) {
        context.addIssue({ code: "custom", path: ["messages", index, "parts", partIndex], message: "Image references an invalid attachment." });
      }
    }
  }

  for (const [index, attachment] of backup.attachments.entries()) {
    const message = messageById.get(attachment.messageId);
    if (!conversationIds.has(attachment.conversationId) || !message || message.conversationId !== attachment.conversationId) {
      context.addIssue({ code: "custom", path: ["attachments", index], message: "Attachment references invalid local records." });
    }
  }
});

export type ValidatedBackup = z.infer<typeof backupSchema>;

export function validateBackupPayload(text: string): ValidatedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  const result = backupSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(first?.message || "The backup file is invalid.");
  }
  return result.data;
}

export async function importValidatedBackup(text: string): Promise<void> {
  validateBackupPayload(text);
  await importLocalData(text);
}
