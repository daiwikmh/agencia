import { config } from "../src/config.js";

let clientPromise: Promise<unknown> | null = null;
export let lastError: string | null = null;

async function webClient() {
  if (!config.service.operatorId || !config.service.operatorKey) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      const sdk = (await import("@hashgraph/sdk")) as unknown as {
        Client: {
          forTestnet(): { setOperator(id: unknown, key: unknown): unknown };
          forMainnet(): { setOperator(id: unknown, key: unknown): unknown };
        };
        AccountId: { fromString(v: string): unknown };
        PrivateKey: {
          fromStringECDSA(v: string): unknown;
          fromStringED25519(v: string): unknown;
          fromStringDer(v: string): unknown;
        };
      };
      const client =
        config.network === "hedera:mainnet" ? sdk.Client.forMainnet() : sdk.Client.forTestnet();
      let key: unknown;
      for (const parse of [
        () => sdk.PrivateKey.fromStringECDSA(config.service.operatorKey),
        () => sdk.PrivateKey.fromStringED25519(config.service.operatorKey),
        () => sdk.PrivateKey.fromStringDer(config.service.operatorKey),
      ]) {
        try {
          key = parse();
          break;
        } catch {
          continue;
        }
      }
      if (!key) throw new Error("unrecognized operator key format");
      client.setOperator(sdk.AccountId.fromString(config.service.operatorId), key);
      return client;
    })();
  }
  return clientPromise;
}

export async function recordSettlement(
  receipt: Record<string, unknown>,
): Promise<{ topicId: string; sequenceNumber: string } | null> {
  if (!config.service.hcsTopicId) return null;
  try {
    const client = await webClient();
    if (!client) return null;
    const sdk = (await import("@hashgraph/sdk")) as unknown as {
      TopicMessageSubmitTransaction: new () => {
        setTopicId(id: string): {
          setMessage(msg: string): {
            execute(client: unknown): Promise<{
              getReceipt(client: unknown): Promise<{ topicSequenceNumber?: { toString(): string } }>;
            }>;
          };
        };
      };
    };

    const response = await new sdk.TopicMessageSubmitTransaction()
      .setTopicId(config.service.hcsTopicId)
      .setMessage(JSON.stringify({ type: "agencia.payment", ...receipt }))
      .execute(client);
    const confirmed = await response.getReceipt(client);
    return {
      topicId: config.service.hcsTopicId,
      sequenceNumber: confirmed.topicSequenceNumber?.toString() ?? "0",
    };
  } catch (err) {
    lastError = String(err instanceof Error ? (err.stack ?? err.message) : err);
    console.error("hcs receipt failed:", lastError);
    return null;
  }
}
