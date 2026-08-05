import { ZodError } from "zod";
import { chatRequestSchema, gatewayHeaders, requireGatewaySecrets, toUpstreamInput } from "@/lib/gateway";
import { assertSameOrigin, errorDetails, jsonError, readBoundedJson } from "@/lib/http";
import { beginRequest, clientKey } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function sanitizedUpstreamMessage(status: number): string {
  if (status === 401 || status === 403) return "The AI gateway rejected its server credentials.";
  if (status === 404) return "The selected gateway endpoint or model was not found.";
  if (status === 408 || status === 504) return "The AI gateway timed out.";
  if (status === 429) return "The AI provider is rate limited. Try again shortly.";
  if (status >= 500) return "The AI gateway is temporarily unavailable.";
  return "The AI gateway rejected the request.";
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let release: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const upstreamAbort = new AbortController();

  try {
    assertSameOrigin(request);
    release = beginRequest(clientKey(request));

    const config = requireGatewaySecrets();
    if (!config.enabled) {
      release();
      release = undefined;
      return jsonError("Chat is temporarily disabled.", 503, "chat_disabled", requestId);
    }

    const input = chatRequestSchema.parse(await readBoundedJson(request));
    if (!config.allowedModels.includes(input.model)) {
      release();
      release = undefined;
      return jsonError("The selected model is not allowed.", 400, "model_not_allowed", requestId);
    }

    const hasImage = input.messages.some((message) => message.content.some((part) => part.type === "image"));
    if (hasImage && !config.visionModels.has(input.model)) {
      release();
      release = undefined;
      return jsonError("The selected model is not configured for image input.", 400, "vision_not_enabled", requestId);
    }
    if (input.reasoning && !config.reasoningModels.has(input.model)) {
      release();
      release = undefined;
      return jsonError("The selected model is not configured for reasoning controls.", 400, "reasoning_not_enabled", requestId);
    }

    const abortFromClient = () => upstreamAbort.abort(request.signal.reason);
    request.signal.addEventListener("abort", abortFromClient, { once: true });
    timeout = setTimeout(() => upstreamAbort.abort(new Error("Gateway timeout")), 115_000);

    const upstream = await fetch(`${config.baseUrl}/v1/responses`, {
      method: "POST",
      headers: gatewayHeaders(config, input.requestId),
      body: JSON.stringify(toUpstreamInput(input)),
      cache: "no-store",
      signal: upstreamAbort.signal,
    });

    if (!upstream.ok || !upstream.body) {
      clearTimeout(timeout);
      release();
      release = undefined;
      return jsonError(sanitizedUpstreamMessage(upstream.status), upstream.status || 502, "gateway_rejected", requestId);
    }

    const reader = upstream.body.getReader();
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            clearTimeout(timeout);
            release?.();
            release = undefined;
            request.signal.removeEventListener("abort", abortFromClient);
            return;
          }
          if (value) controller.enqueue(value);
        } catch (error) {
          controller.error(error);
          clearTimeout(timeout);
          release?.();
          release = undefined;
          request.signal.removeEventListener("abort", abortFromClient);
        }
      },
      async cancel(reason) {
        upstreamAbort.abort(reason);
        await reader.cancel(reason).catch(() => undefined);
        clearTimeout(timeout);
        release?.();
        release = undefined;
        request.signal.removeEventListener("abort", abortFromClient);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-HelloAI-Request-Id": requestId,
      },
    });
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    release?.();
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message || "The request is invalid.", 400, "validation_failed", requestId);
    }
    if (upstreamAbort.signal.aborted || request.signal.aborted) {
      return jsonError("The AI request was cancelled or timed out.", 408, "request_aborted", requestId);
    }
    const details = errorDetails(error);
    return jsonError(details.status >= 500 ? "The AI request could not be completed." : details.message, details.status, details.code, requestId);
  }
}
