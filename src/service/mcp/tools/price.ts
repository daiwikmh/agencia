import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { catalogEntry, priceFor } from "../../catalog.js";
import { coinPrice, hbarPrice } from "../../capabilities/price.js";
import { registerPaidTool } from "../../payments/paid-tool.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function registerPriceTools(server: McpServer): void {
  const hbar = catalogEntry("hbar_price");
  if (hbar) {
    registerPaidTool(server, {
      name: hbar.name,
      description: hbar.description,
      inputSchema: { vs: z.string().default("usd").describe("Quote currency, e.g. usd, eur") },
      price: (args) => priceFor(hbar.name, args),
      run: async (args) => jsonResult(await hbarPrice(String(args.vs ?? "usd"))),
    });
  }

  const crypto = catalogEntry("crypto_price");
  if (crypto) {
    registerPaidTool(server, {
      name: crypto.name,
      description: crypto.description,
      inputSchema: {
        ids: z
          .string()
          .default("bitcoin,ethereum,hedera-hashgraph")
          .describe("Comma-separated CoinGecko ids"),
        vs: z.string().default("usd").describe("Quote currency"),
      },
      price: (args) => priceFor(crypto.name, args),
      run: async (args) =>
        jsonResult(
          await coinPrice(
            String(args.ids ?? "bitcoin,ethereum,hedera-hashgraph"),
            String(args.vs ?? "usd"),
          ),
        ),
    });
  }
}
