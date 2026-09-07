import { config } from "../config.js";
import type { ServiceManifest } from "../service/manifest.js";

export interface DiscoveredService {
  service: string;
  description: string;
  network: string;
  facilitator: string;
  mcpUrl: string;
  resources: ServiceManifest["resources"];
}

export async function discover(
  serviceUrl = config.agent.serviceUrl,
): Promise<DiscoveredService> {
  const res = await fetch(`${serviceUrl}/.well-known/x402`);
  if (!res.ok) throw new Error(`discovery failed: ${res.status}`);
  const doc = (await res.json()) as ServiceManifest;

  return {
    service: doc.service,
    description: doc.description,
    network: doc.network,
    facilitator: doc.x402?.facilitatorHost ?? "unknown",
    mcpUrl: doc.mcp?.url ?? `${serviceUrl}/mcp`,
    resources: doc.resources ?? [],
  };
}
