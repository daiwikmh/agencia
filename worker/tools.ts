import { CATALOG, priceFor } from "../src/service/catalog.js";
import {
  accountSnapshot,
  networkStats,
  nftInfo,
  tokenInfo,
  topicMessages,
  transactionInfo,
} from "../src/service/capabilities/hedera-data.js";
import { coinPrice, hbarPrice } from "../src/service/capabilities/price.js";
import { dnsLookup, githubRepo, readUrl } from "../src/service/capabilities/external.js";
import { askGraph, introspectSchema, queryGraph } from "../src/service/capabilities/graph.js";
import { runInference } from "../src/service/capabilities/inference.js";
import { runOpenAIInference } from "../src/service/capabilities/openai.js";

export type ToolRunner = (args: Record<string, unknown>) => Promise<unknown>;

const str = (v: unknown, fallback = "") => (v == null ? fallback : String(v));
const num = (v: unknown, fallback: number) => (v == null ? fallback : Number(v));

export const RUNNERS: Record<string, ToolRunner> = {
  infer: async (a) =>
    runInference({
      prompt: str(a.prompt),
      max_tokens: num(a.max_tokens, 256),
      system: a.system ? str(a.system) : undefined,
    }),
  infer_openai: async (a) =>
    runOpenAIInference({
      prompt: str(a.prompt),
      max_tokens: num(a.max_tokens, 256),
      system: a.system ? str(a.system) : undefined,
    }),
  hedera_account: async (a) => accountSnapshot(str(a.accountId)),
  hedera_token: async (a) => tokenInfo(str(a.tokenId)),
  hedera_topic: async (a) => topicMessages(str(a.topicId), num(a.limit, 10)),
  hedera_transaction: async (a) => transactionInfo(str(a.transactionId)),
  hedera_nft: async (a) => nftInfo(str(a.tokenId), a.serial != null ? Number(a.serial) : undefined),
  hedera_network: async () => networkStats(),
  hbar_price: async (a) => hbarPrice(str(a.vs, "usd")),
  crypto_price: async (a) =>
    coinPrice(str(a.ids, "bitcoin,ethereum,hedera-hashgraph"), str(a.vs, "usd")),
  web_read: async (a) => readUrl(str(a.url)),
  dns_lookup: async (a) => dnsLookup(str(a.name), str(a.type, "A")),
  github_repo: async (a) => githubRepo(str(a.owner), str(a.repo)),
  graph_query: async (a) =>
    queryGraph(str(a.subgraph), str(a.query), a.variables ? str(a.variables) : undefined),
  graph_schema: async (a) => introspectSchema(str(a.subgraph)),
  graph_ask: async (a) =>
    askGraph(str(a.subgraph), str(a.question), async (prompt, maxTokens) =>
      (await runInference({ prompt, max_tokens: maxTokens })).text,
    ),
};

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  priced: boolean;
}

export function toolDefinitions(): ToolDef[] {
  return CATALOG.filter((entry) => RUNNERS[entry.name]).map((entry) => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of entry.params) {
      properties[p.name] = {
        type: p.type === "number" ? "number" : "string",
        description: p.label,
        ...(p.default != null ? { default: p.default } : {}),
      };
      if (p.required) required.push(p.name);
    }
    return {
      name: entry.name,
      description: `${entry.description} [paid: x402 v2 / HBAR]`,
      inputSchema: { type: "object" as const, properties, ...(required.length ? { required } : {}) },
      priced: true,
    };
  });
}

export function quoteFor(tool: string, args: Record<string, unknown>): number {
  return priceFor(tool, args);
}
