import { config } from "../config.js";
import { facilitatorName } from "../facilitator.js";
import { mirrorTopicMessagesUrl } from "../hedera.js";
import { CATALOG, type ToolParam, type ToolPricing } from "./catalog.js";

export interface ServiceManifest {
  service: string;
  description: string;
  network: string;
  x402: { version: 2; scheme: "exact"; facilitator: string; facilitatorHost: string };
  mcp: { url: string; transport: "streamable-http" };
  resources: Array<{
    resource: string;
    tool: string;
    title: string;
    category: string;
    description: string;
    featured: boolean;
    params: ToolParam[];
    asset: string;
    payTo: string;
    pricing: ToolPricing & { settledUnit: "tinybar" };
  }>;
  audit: { type: "hcs"; topicId: string; mirror: string } | null;
}

export function buildManifest(origin: string): ServiceManifest {
  return {
    service: "Agencia",
    description:
      "Pay-per-call services on Hedera — inference, on-chain data and price feeds — gated by x402 and settled through Blocky402.",
    network: config.network,
    x402: {
      version: 2,
      scheme: "exact",
      facilitator: config.facilitatorUrl,
      facilitatorHost: facilitatorName,
    },
    mcp: { url: `${origin}/mcp`, transport: "streamable-http" },
    resources: CATALOG.map((t) => ({
      resource: `agencia://${t.name}`,
      tool: t.name,
      title: t.title,
      category: t.category,
      description: t.description,
      featured: t.featured ?? false,
      params: t.params,
      asset: "0.0.0",
      payTo: config.service.payTo,
      pricing: { ...t.pricing, settledUnit: "tinybar" },
    })),
    audit: config.service.hcsTopicId
      ? {
          type: "hcs",
          topicId: config.service.hcsTopicId,
          mirror: mirrorTopicMessagesUrl(config.service.hcsTopicId),
        }
      : null,
  };
}
