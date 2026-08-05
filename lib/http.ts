import { NextResponse } from "next/server";

export const MAX_CHAT_BODY_BYTES = 4_000_000;

export function jsonError(message: string, status: number, code: string, requestId?: string) {
  return NextResponse.json(
    { error: { message, code, requestId } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const requestOrigin = new URL(request.url).origin;
  if (!origin || origin !== requestOrigin) {
    throw Object.assign(new Error("Cross-origin requests are not allowed."), { statusCode: 403, code: "origin_denied" });
  }
}

export async function readBoundedJson(request: Request, maxBytes = MAX_CHAT_BODY_BYTES): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw Object.assign(new Error("Content-Type must be application/json."), { statusCode: 415, code: "content_type_invalid" });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw Object.assign(new Error("Request body is too large."), { statusCode: 413, code: "request_too_large" });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw Object.assign(new Error("Request body is too large."), { statusCode: 413, code: "request_too_large" });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw Object.assign(new Error("Request body must contain valid JSON."), { statusCode: 400, code: "json_invalid" });
  }
}

export function errorDetails(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown; statusCode?: unknown; code?: unknown };
    return {
      message: typeof candidate.message === "string" ? candidate.message : "Request failed.",
      status: typeof candidate.statusCode === "number" ? candidate.statusCode : 500,
      code: typeof candidate.code === "string" ? candidate.code : "internal_error",
    };
  }
  return { message: "Request failed.", status: 500, code: "internal_error" };
}
