import { gatewayHeaders, getGatewayConfig } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpstreamModel {
  id?: unknown;
}

export async function GET() {
  const config = getGatewayConfig();
  const configured = Boolean(config.apiKey && config.gatewaySecret);
  let availableIds = new Set<string>();

  if (configured) {
    try {
      const response = await fetch(`${config.baseUrl}/v1/models`, {
        headers: gatewayHeaders({ apiKey: config.apiKey!, gatewaySecret: config.gatewaySecret! }),
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      if (response.ok) {
        const body = (await response.json()) as { data?: UpstreamModel[] };
        availableIds = new Set(
          (Array.isArray(body.data) ? body.data : [])
            .map((model) => (typeof model.id === "string" ? model.id : ""))
            .filter(Boolean),
        );
      }
    } catch {
      // The configured allowlist remains usable as a safe fallback.
    }
  }

  const models = config.allowedModels.map((id) => ({
    id,
    name: id,
    vision: config.visionModels.has(id),
    reasoning: config.reasoningModels.has(id),
    available: availableIds.size === 0 || availableIds.has(id),
  }));

  return Response.json(
    { defaultModel: config.defaultModel, enabled: config.enabled, configured, models },
    { headers: { "Cache-Control": "no-store" } },
  );
}
