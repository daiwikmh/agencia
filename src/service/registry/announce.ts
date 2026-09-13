import type { Client } from "@hashgraph/sdk";
import { config } from "../../config.js";
import { makeClient, submitHcsMessage } from "../../hedera.js";
import { buildManifest } from "../manifest.js";

export interface ServiceAnnouncement {
  type: "x402.service";
  standard: "HCS-14";
  service: string;
  description: string;
  network: string;
  origin: string;
  discovery: string;
  mcp: string;
  facilitator: string;
  payTo: string;
  asset: "HBAR";
  auditTopicId: string | null;
  toolCount: number;
  categories: string[];
  cheapestHbar: number;
  announcedAt: string;
}

export function buildAnnouncement(origin: string): ServiceAnnouncement {
  const manifest = buildManifest(origin);
  const description =
    manifest.description.length > 140
      ? `${manifest.description.slice(0, 137)}...`
      : manifest.description;
  return {
    type: "x402.service",
    standard: "HCS-14",
    service: manifest.service,
    description,
    network: manifest.network,
    origin,
    discovery: `${origin}/.well-known/x402`,
    mcp: manifest.mcp.url,
    facilitator: manifest.x402.facilitatorHost,
    payTo: config.service.payTo,
    asset: "HBAR",
    auditTopicId: config.service.hcsTopicId || null,
    toolCount: manifest.resources.length,
    categories: [...new Set(manifest.resources.map((r) => r.category))],
    cheapestHbar: Math.min(
      ...manifest.resources
        .filter((r) => r.pricing.perCallHbar > 0)
        .map((r) => r.pricing.perCallHbar),
    ),
    announcedAt: new Date().toISOString(),
  };
}

export async function announceService(
  origin: string,
): Promise<{ topicId: string; sequenceNumber: string } | null> {
  const topicId = config.registry.topicId;
  if (!topicId || !config.service.operatorId || !config.service.operatorKey) return null;

  let client: Client | null = null;
  try {
    client = makeClient(config.service.operatorId, config.service.operatorKey);
    const { sequenceNumber } = await submitHcsMessage(client, topicId, buildAnnouncement(origin));
    return { topicId, sequenceNumber };
  } catch {
    return null;
  } finally {
    client?.close();
  }
}
