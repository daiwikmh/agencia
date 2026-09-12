import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { catalogEntry, priceFor } from "../../catalog.js";
import {
  accountSnapshot,
  networkStats,
  nftInfo,
  tokenInfo,
  topicMessages,
  transactionInfo,
} from "../../capabilities/hedera-data.js";
import { registerPaidTool } from "../../payments/paid-tool.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerHederaTools(server: McpServer): void {
  const account = catalogEntry("hedera_account");
  if (account) {
    registerPaidTool(server, {
      name: account.name,
      description: account.description,
      inputSchema: { accountId: z.string().describe("Hedera account id, e.g. 0.0.1234") },
      price: (args) => priceFor(account.name, args),
      run: async (args) => jsonResult(await accountSnapshot(String(args.accountId))),
    });
  }

  const token = catalogEntry("hedera_token");
  if (token) {
    registerPaidTool(server, {
      name: token.name,
      description: token.description,
      inputSchema: { tokenId: z.string().describe("HTS token id, e.g. 0.0.1234") },
      price: (args) => priceFor(token.name, args),
      run: async (args) => jsonResult(await tokenInfo(String(args.tokenId))),
    });
  }

  const topic = catalogEntry("hedera_topic");
  if (topic) {
    registerPaidTool(server, {
      name: topic.name,
      description: topic.description,
      inputSchema: {
        topicId: z.string().describe("HCS topic id, e.g. 0.0.1234"),
        limit: z.number().int().min(1).max(50).default(10).describe("How many recent messages"),
      },
      price: (args) => priceFor(topic.name, args),
      run: async (args) =>
        jsonResult(await topicMessages(String(args.topicId), Number(args.limit ?? 10))),
    });
  }

  const transaction = catalogEntry("hedera_transaction");
  if (transaction) {
    registerPaidTool(server, {
      name: transaction.name,
      description: transaction.description,
      inputSchema: { transactionId: z.string().describe("Hedera transaction id") },
      price: (args) => priceFor(transaction.name, args),
      run: async (args) => jsonResult(await transactionInfo(String(args.transactionId))),
    });
  }

  const nft = catalogEntry("hedera_nft");
  if (nft) {
    registerPaidTool(server, {
      name: nft.name,
      description: nft.description,
      inputSchema: {
        tokenId: z.string().describe("HTS token id of the NFT collection"),
        serial: z.number().int().min(1).optional().describe("Serial number; omit for the first serials"),
      },
      price: (args) => priceFor(nft.name, args),
      run: async (args) =>
        jsonResult(
          await nftInfo(String(args.tokenId), args.serial != null ? Number(args.serial) : undefined),
        ),
    });
  }

  const network = catalogEntry("hedera_network");
  if (network) {
    registerPaidTool(server, {
      name: network.name,
      description: network.description,
      inputSchema: {},
      price: (args) => priceFor(network.name, args),
      run: async () => jsonResult(await networkStats()),
    });
  }
}
