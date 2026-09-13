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

export interface OnChainService {
  service: string;
  description: string;
  network: string;
  origin: string;
  discovery: string;
  mcp: string;
  payTo: string;
  facilitator: string;
  auditTopicId: string | null;
  toolCount: number;
  categories: string[];
  cheapestHbar: number;
  announcedAt: string;
  sequenceNumber: number;
}

/**
 * Find x402 services without being told a URL: read announcements straight off a
 * Hedera consensus topic via the mirror node. Latest announcement per origin wins.
 */
export async function discoverOnChain(
  topicId = config.registry.topicId,
  limit = 50,
): Promise<OnChainService[]> {
  if (!topicId) throw new Error("no registry topic configured (AGENCIA_REGISTRY_TOPIC_ID)");

  const url = `${config.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`mirror node ${res.status}`);

  const body = (await res.json()) as {
    messages?: { sequence_number: number; message: string }[];
  };

  const byOrigin = new Map<string, OnChainService>();
  for (const m of body.messages ?? []) {
    try {
      const decoded = JSON.parse(Buffer.from(m.message, "base64").toString("utf8")) as
        Record<string, unknown>;
      if (decoded.type !== "x402.service" || typeof decoded.origin !== "string") continue;
      if (byOrigin.has(decoded.origin)) continue;
      byOrigin.set(decoded.origin, {
        service: String(decoded.service ?? "unknown"),
        description: String(decoded.description ?? ""),
        network: String(decoded.network ?? ""),
        origin: decoded.origin,
        discovery: String(decoded.discovery ?? `${decoded.origin}/.well-known/x402`),
        mcp: String(decoded.mcp ?? `${decoded.origin}/mcp`),
        payTo: String(decoded.payTo ?? ""),
        facilitator: String(decoded.facilitator ?? ""),
        auditTopicId: decoded.auditTopicId ? String(decoded.auditTopicId) : null,
        toolCount: Number(decoded.toolCount ?? 0),
        categories: Array.isArray(decoded.categories) ? (decoded.categories as string[]) : [],
        cheapestHbar: Number(decoded.cheapestHbar ?? 0),
        announcedAt: String(decoded.announcedAt ?? ""),
        sequenceNumber: m.sequence_number,
      });
    } catch {
      continue;
    }
  }
  return [...byOrigin.values()];
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
