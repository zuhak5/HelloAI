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
    const response = await fetch(`${config.baseUrl}/v1/models`, {
      headers: gatewayHeaders({ apiKey: config.apiKey, gatewaySecret: config.gatewaySecret }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
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
