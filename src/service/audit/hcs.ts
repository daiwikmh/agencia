import type { Client } from "@hashgraph/sdk";
import { config } from "../../config.js";
import { makeClient, submitHcsMessage } from "../../hedera.js";

let client: Client | null = null;

function auditClient(): Client | null {
  if (client) return client;
  if (!config.service.operatorId || !config.service.operatorKey) return null;
  client = makeClient(config.service.operatorId, config.service.operatorKey);
  return client;
}

export async function recordSettlement(
  receipt: Record<string, unknown>,
): Promise<{ topicId: string; sequenceNumber: string } | null> {
  const c = auditClient();
  if (!c || !config.service.hcsTopicId) return null;
  try {
    const { sequenceNumber } = await submitHcsMessage(c, config.service.hcsTopicId, {
      type: "agencia.payment",
      ...receipt,
    });
    return { topicId: config.service.hcsTopicId, sequenceNumber };
  } catch {
    return null;
  }
}
