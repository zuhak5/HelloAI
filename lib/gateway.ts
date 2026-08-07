import "server-only";
import { z } from "zod";
import { MODEL_PATTERN, parseModelList } from "@/lib/model-utils";
const DEFAULT_BASE_URL = "https://ai.safenetvpn.dedyn.io";
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_ALLOWED_MODELS = ["gpt-5.6-luna"];

function cleanUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error("GATEWAY_BASE_URL must use HTTPS outside local development.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function getGatewayConfig() {
  const baseUrl = cleanUrl(process.env.GATEWAY_BASE_URL?.trim() || DEFAULT_BASE_URL);
  const apiKey = process.env.CLIPROXY_API_KEY?.trim();
  const gatewaySecret = process.env.HOME_GATEWAY_SECRET?.trim();
  const defaultModel = (
    process.env.DEFAULT_GATEWAY_MODEL?.trim() ||
    process.env.GATEWAY_MODEL?.trim() ||
    DEFAULT_MODEL
  );
  if (!MODEL_PATTERN.test(defaultModel)) throw new Error("The configured default model is invalid.");

  const allowedModels = parseModelList(process.env.ALLOWED_GATEWAY_MODELS, DEFAULT_ALLOWED_MODELS);
  if (!allowedModels.includes(defaultModel)) allowedModels.unshift(defaultModel);

  return {
    baseUrl,
    apiKey,
    gatewaySecret,
    defaultModel,
    allowedModels,
    visionModels: new Set(parseModelList(process.env.VISION_GATEWAY_MODELS)),
    reasoningModels: new Set(parseModelList(process.env.REASONING_GATEWAY_MODELS)),
    enabled: (process.env.CHAT_ENABLED ?? "true").toLowerCase() !== "false",
  };
}

export function requireGatewaySecrets() {
  const config = getGatewayConfig();
  if (!config.apiKey || !config.gatewaySecret) {
    throw new Error("Gateway credentials are not configured.");
  }
  return config as typeof config & { apiKey: string; gatewaySecret: string };
}

export function gatewayHeaders(config: { apiKey: string; gatewaySecret: string }, requestId?: string): HeadersInit {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "X-HomePilot-Gateway-Secret": config.gatewaySecret,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(requestId ? { "X-Client-Request-Id": requestId } : {}),
  };
}

const imageDataUrlSchema = z
  .string()
  .max(1_700_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);

const textPartSchema = z.object({ type: z.literal("text"), text: z.string().max(30_000) }).strict();
const imagePartSchema = z
  .object({
    type: z.literal("image"),
    mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    dataUrl: imageDataUrlSchema,
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
  })
  .strict();

const messageSchema = z
  .object({
    id: z.string().uuid(),
    role: z.enum(["system", "user", "assistant"]),
    content: z.array(z.union([textPartSchema, imagePartSchema])).min(1).max(6),
  })
  .strict();

export const chatRequestSchema = z
  .object({
    conversationId: z.string().uuid(),
    requestId: z.string().uuid(),
    model: z.string().regex(MODEL_PATTERN),
    messages: z.array(messageSchema).min(1).max(60),
    maxOutputTokens: z.number().int().min(16).max(8000),
    reasoning: z.enum(["low", "medium", "high"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    let imageCount = 0;
    let textChars = 0;
    for (const message of value.messages) {
      for (const part of message.content) {
        if (part.type === "image") imageCount += 1;
        else textChars += part.text.length;
      }
    }
    if (imageCount > 3) ctx.addIssue({ code: "custom", message: "A request may contain at most three images." });
    if (textChars > 80_000) ctx.addIssue({ code: "custom", message: "The conversation is too large." });
  });

export type ValidatedChatRequest = z.infer<typeof chatRequestSchema>;

export function toUpstreamInput(input: ValidatedChatRequest) {
  const instructions = input.messages
    .filter((message) => message.role === "system")
    .flatMap((message) => message.content)
    .filter((part): part is z.infer<typeof textPartSchema> => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");

  const messages = input.messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      const content = message.content.map((part) =>
        part.type === "text"
          ? { type: "input_text", text: part.text }
          : { type: "input_image", image_url: part.dataUrl, detail: "auto" },
      );
      if (message.role === "assistant" && content.every((part) => part.type === "input_text")) {
        return {
          role: "assistant" as const,
          content: content.map((part) => ("text" in part ? part.text : "")).join("\n"),
        };
      }
      return { role: message.role as "user", content };
    });

  return {
    model: input.model,
    input: messages,
    ...(instructions ? { instructions } : {}),
    max_output_tokens: input.maxOutputTokens,
    ...(input.reasoning ? { reasoning: { effort: input.reasoning } } : {}),
    stream: true,
    store: false,
  };
}
