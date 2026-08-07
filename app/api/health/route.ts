import { gatewayHeaders, getGatewayConfig } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getGatewayConfig();
  if (!config.enabled) {
    return Response.json({ status: "disabled", configured: Boolean(config.apiKey && config.gatewaySecret) }, { status: 503 });
  }
  if (!config.apiKey || !config.gatewaySecret) {
    return Response.json({ status: "unconfigured", configured: false }, { status: 503 });
  }

  try {
    // Caddy intentionally exposes only POST /v1/responses, so health uses the same
    // end-to-end path as chat instead of probing the blocked /v1/models endpoint.
    const response = await fetch(`${config.baseUrl}/v1/responses`, {
      method: "POST",
      headers: gatewayHeaders({ apiKey: config.apiKey, gatewaySecret: config.gatewaySecret }),
      body: JSON.stringify({
        model: config.defaultModel,
        input: "Reply with exactly: HELLOAI_OK",
        max_output_tokens: 16,
        stream: false,
        store: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    return Response.json(
      { status: response.ok ? "healthy" : "degraded", configured: true, gatewayStatus: response.status },
      { status: response.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "down", configured: true },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
