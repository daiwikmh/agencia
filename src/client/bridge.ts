import "../node-env.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z, type ZodRawShape } from "zod";
import { AgenciaClient } from "./index.js";
import { config } from "../config.js";
import { mcpInstructions } from "../service/banner.js";

/**
 * A local MCP server that any client can add — Claude Desktop, Claude Code,
 * Cursor — which pays Agencia's 402s on their behalf.
 *
 * Those clients speak MCP but not x402, so against Agencia directly they can
 * quote and never buy. This bridge holds the wallet, so from the client's side
 * the tools simply work and the receipt comes back in the result.
 *
 * stdout belongs to the protocol. Everything human goes to stderr.
 */
const log = (line: string) => process.stderr.write(`${line}\n`);

function hashscanUrl(txId: string, network: string): string {
  const net = network.includes("mainnet") ? "mainnet" : "testnet";
  return `https://hashscan.io/${net}/transaction/${txId.replace("@", "-").replace(/\.(\d+)$/, "-$1")}`;
}

/**
 * The receipt is the proof the payment settled, so it is rendered as a block
 * rather than a trailing clause — clients were paraphrasing the transaction id
 * out of their answers entirely.
 */
function receiptBlock(
  receipt: { quotedHbar: number; transaction?: string; hcs?: { topicId: string; sequenceNumber: string } | null },
  agencia: { accountId: string; remainingHbar: number; manifest: { network: string } },
): string {
  const lines = [`PAID ${receipt.quotedHbar} HBAR from ${agencia.accountId}`];
  if (receipt.transaction) {
    lines.push(`tx        ${receipt.transaction}`);
    lines.push(`hashscan  ${hashscanUrl(receipt.transaction, agencia.manifest.network)}`);
  }
  if (receipt.hcs) lines.push(`receipt   HCS ${receipt.hcs.topicId}#${receipt.hcs.sequenceNumber}`);
  lines.push(`budget    ${agencia.remainingHbar} HBAR left`);
  return ["```", ...lines, "```"].join("\n");
}

function shapeFor(params: { name: string; type: string; label: string; required?: boolean }[]): ZodRawShape {
  const shape: ZodRawShape = {};
  for (const p of params) {
    const base = p.type === "number" ? z.number() : z.string();
    shape[p.name] = (p.required ? base : base.optional()).describe(p.label);
  }
  return shape;
}

async function main() {
  const serviceUrl = process.env.AGENCIA_SERVICE_URL ?? config.agent.serviceUrl;
  log(`[bridge] connecting to ${serviceUrl}`);

  const agencia = await AgenciaClient.connect({
    serviceUrl,
    onStep: (step) => log(`[bridge] ${step}`),
  });

  log(`[bridge] wallet ${agencia.accountId} · budget ${agencia.remainingHbar} HBAR`);
  log(`[bridge] ${agencia.manifest.resources.length} priced tools ready — payments handled locally`);

  const server = new McpServer(
    { name: "agencia-bridge", version: "0.1.0" },
    {
      instructions: `${mcpInstructions(serviceUrl, agencia.manifest.resources.length)}

YOU ARE TALKING TO THE BRIDGE
Payments are handled here, locally, with the operator's own Hedera wallet. Call
any tool normally — no 402 handling is required of you.

ALWAYS SHOW THE RECEIPT
Every paid result ends with a fenced receipt block containing the transaction
id, a HashScan link and the HCS sequence number. Reproduce that block verbatim
in your reply. Do not summarise it, shorten it, or replace it with a sentence
like "cost 0.003 HBAR" — the transaction id is the proof the payment settled,
and the user needs to be able to click it.`,
    },
  );

  for (const resource of agencia.manifest.resources) {
    server.tool(
      resource.tool,
      `${resource.description ?? resource.tool} [paid automatically: ${JSON.stringify(resource.pricing)}]`,
      shapeFor(resource.params ?? []),
      async (args: Record<string, unknown>) => {
        const cleaned = Object.fromEntries(
          Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== ""),
        );
        try {
          const result = await agencia.call(resource.tool, cleaned);
          const receipt = result.receipt;
          const footer = receipt ? `\n\n${receiptBlock(receipt, agencia)}` : "";
          log(`[bridge] ${resource.tool} → paid ${receipt?.quotedHbar ?? 0} HBAR`);
          return { content: [{ type: "text" as const, text: `${result.text}${footer}` }] };
        } catch (err) {
          const message = String(err instanceof Error ? err.message : err);
          log(`[bridge] ${resource.tool} failed: ${message}`);
          return { isError: true, content: [{ type: "text" as const, text: message }] };
        }
      },
    );
  }

  server.tool(
    "wallet_status",
    "Show the bridge wallet: which account is paying, and how much budget is left this session.",
    {},
    async () => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              payingAccount: agencia.accountId,
              remainingBudgetHbar: agencia.remainingHbar,
              service: serviceUrl,
              network: agencia.manifest.network,
              pricedTools: agencia.manifest.resources.length,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  await server.connect(new StdioServerTransport());
  log(`[bridge] ready on stdio`);
}

main().catch((err) => {
  log(`[bridge] failed to start: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
