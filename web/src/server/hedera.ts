import { serverConfig } from "./config.js";

export function toMirrorTxId(txId: string): string {
  return txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
}

export function hashscanTxUrl(txId: string): string {
  return `${serverConfig.hashscanBase}/transaction/${toMirrorTxId(txId)}`;
}

export interface HcsMessage {
  consensus_timestamp: string;
  sequence_number: number;
  message: string;
  payload: unknown;
}

export async function fetchTopicMessages(
  topicId: string,
  limit = 25,
): Promise<HcsMessage[]> {
  const url = `${serverConfig.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?limit=${limit}&order=desc`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mirror node ${res.status}`);
  const body = (await res.json()) as {
    messages?: { consensus_timestamp: string; sequence_number: number; message: string }[];
  };
  return (body.messages ?? []).map((m) => {
    const decoded = Buffer.from(m.message, "base64").toString("utf8");
    let payload: unknown = decoded;
    try {
      payload = JSON.parse(decoded);
    } catch {
      /* keep raw string */
    }
    return { ...m, message: decoded, payload };
  });
}
