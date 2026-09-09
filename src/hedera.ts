import {
  AccountId,
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import { config } from "./config.js";

export function parseKey(raw: string): PrivateKey {
  const attempts = [
    () => PrivateKey.fromStringECDSA(raw),
    () => PrivateKey.fromStringED25519(raw),
    () => PrivateKey.fromStringDer(raw),
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      continue;
    }
  }
  throw new Error("unrecognized Hedera private key format");
}

export function makeClient(operatorId: string, operatorKey: string): Client {
  if (!operatorId || !operatorKey) {
    throw new Error("Hedera operator id and key are required");
  }
  const client =
    config.network === "hedera:mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(operatorId), parseKey(operatorKey));
  return client;
}

export async function createHcsTopic(client: Client, memo: string): Promise<string> {
  const response = await new TopicCreateTransaction().setTopicMemo(memo).execute(client);
  const receipt = await response.getReceipt(client);
  if (!receipt.topicId) throw new Error("topic creation returned no id");
  return receipt.topicId.toString();
}

export async function submitHcsMessage(
  client: Client,
  topicId: string,
  message: unknown,
): Promise<{ sequenceNumber: string }> {
  const response = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(message))
    .execute(client);
  const receipt = await response.getReceipt(client);
  return { sequenceNumber: receipt.topicSequenceNumber?.toString() ?? "0" };
}

export function mirrorTopicMessagesUrl(topicId: string): string {
  return `${config.mirrorNodeUrl}/api/v1/topics/${topicId}/messages`;
}
