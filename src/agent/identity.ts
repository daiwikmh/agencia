import { createHash } from "node:crypto";
import { config } from "../config.js";
import { makeClient, submitHcsMessage } from "../hedera.js";

const NETWORK_SLUG = config.network === "hedera:mainnet" ? "mainnet" : "testnet";

export interface AgentIdentity {
  aid: string;
  did: string;
  canonical: Record<string, unknown>;
}

export function agentIdentity(): AgentIdentity {
  const canonical = {
    registry: "agencia",
    name: "agencia-agent",
    version: "0.1.0",
    protocol: "x402",
    nativeId: `hedera:${NETWORK_SLUG}:${config.agent.accountId}`,
    skills: ["discover", "pay", "infer"],
  };
  const hash = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
    .slice(0, 32);
  return {
    aid: `hcs-14:${hash}`,
    did: `did:hedera:${NETWORK_SLUG}:${config.agent.accountId}`,
    canonical,
  };
}

export async function publishIdentity(): Promise<{ topicId: string; sequenceNumber: string } | null> {
  const topicId = config.agent.identityTopicId;
  if (!topicId || !config.agent.accountId || !config.agent.privateKey) return null;
  const identity = agentIdentity();
  const client = makeClient(config.agent.accountId, config.agent.privateKey);
  try {
    const { sequenceNumber } = await submitHcsMessage(client, topicId, {
      type: "agencia.agent-profile",
      standard: "HCS-14",
      ...identity,
      publishedAt: new Date().toISOString(),
    });
    return { topicId, sequenceNumber };
  } finally {
    client.close();
  }
}
