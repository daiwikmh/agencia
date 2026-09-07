import { config } from "../config.js";
import { facilitatorName } from "../facilitator.js";
import { mirrorTopicMessagesUrl } from "../hedera.js";

export interface ServiceManifest {
  service: string;
  description: string;
  network: string;
  x402: { version: 2; scheme: "exact"; facilitator: string; facilitatorHost: string };
  mcp: { url: string; transport: "streamable-http" };
  resources: Array<{
    resource: string;
    tool: string;
    asset: string;
    payTo: string;
    pricing: Record<string, unknown>;
  }>;
  audit: { type: "hcs"; topicId: string; mirror: string } | null;
}

export function buildManifest(origin: string): ServiceManifest {
  return {
    service: "Agencia",
    description:
      "Pay-per-call AI inference on Hedera, gated by x402 and settled through Blocky402.",
    network: config.network,
    x402: {
      version: 2,
      scheme: "exact",
      facilitator: config.facilitatorUrl,
      facilitatorHost: facilitatorName,
    },
    mcp: { url: `${origin}/mcp`, transport: "streamable-http" },
    resources: [
      {
        resource: "agencia://infer",
        tool: "infer",
        asset: "0.0.0",
        payTo: config.service.payTo,
        pricing: {
          model: "per-call + per-token",
          perCallHbar: config.pricing.perCallHbar,
          per1kTokenHbar: config.pricing.per1kTokenHbar,
          unit: "HBAR",
          settledUnit: "tinybar",
        },
      },
    ],
    audit: config.service.hcsTopicId
      ? {
          type: "hcs",
          topicId: config.service.hcsTopicId,
          mirror: mirrorTopicMessagesUrl(config.service.hcsTopicId),
        }
      : null,
  };
}
