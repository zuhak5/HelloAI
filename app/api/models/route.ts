import { getGatewayConfig } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getGatewayConfig();
  const configured = Boolean(config.apiKey && config.gatewaySecret);

  // The hardened public Caddy origin intentionally exposes only POST /v1/responses.
  // Model discovery therefore comes from the server-side allowlist instead of /v1/models.
  const models = config.allowedModels.map((id) => ({
    id,
    name: id,
    vision: config.visionModels.has(id),
    reasoning: config.reasoningModels.has(id),
    available: config.enabled && configured,
  }));

  return Response.json(
    { defaultModel: config.defaultModel, enabled: config.enabled, configured, models },
    { headers: { "Cache-Control": "no-store" } },
  );
}
