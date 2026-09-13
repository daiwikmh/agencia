import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { catalogEntry, priceFor } from "../../catalog.js";
import { askGraph, introspectSchema, queryGraph } from "../../capabilities/graph.js";
import { analyzeSubgraph } from "../../capabilities/graph-analyze.js";
import { runInference } from "../../capabilities/inference.js";
import { registerPaidTool } from "../../payments/paid-tool.js";

const model = async (prompt: string, maxTokens: number) =>
  (await runInference({ prompt, max_tokens: maxTokens })).text;

export function registerGraphTools(server: McpServer): void {
  const schema = catalogEntry("graph_schema");
  if (schema) {
    registerPaidTool(server, {
      name: schema.name,
      description: schema.description,
      inputSchema: {
        subgraph: z.string().describe("Full subgraph GraphQL endpoint URL, or a bare subgraph id"),
      },
      price: (args) => priceFor(schema.name, args),
      run: async (args) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(await introspectSchema(String(args.subgraph)), null, 2),
          },
        ],
      }),
    });
  }

  const ask = catalogEntry("graph_ask");
  if (ask) {
    registerPaidTool(server, {
      name: ask.name,
      description: ask.description,
      inputSchema: {
        subgraph: z.string().describe("Full subgraph GraphQL endpoint URL, or a bare subgraph id"),
        question: z.string().describe("Plain-English question about the subgraph's data"),
      },
      price: (args) => priceFor(ask.name, args),
      run: async (args) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              await askGraph(String(args.subgraph), String(args.question), model),
              null,
              2,
            ),
          },
        ],
      }),
    });
  }

  const analyze = catalogEntry("graph_analyze");
  if (analyze) {
    registerPaidTool(server, {
      name: analyze.name,
      description: analyze.description,
      inputSchema: {
        subgraph: z.string().describe("Full subgraph GraphQL endpoint URL, or a bare subgraph id"),
        goal: z.string().describe("The analytical question to work out from the data"),
        seconds: z.number().int().min(20).max(300).default(60).describe("Compute seconds to rent"),
      },
      price: (args) => priceFor(analyze.name, args),
      run: async (args, ctx) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              await analyzeSubgraph(
                {
                  subgraph: String(args.subgraph),
                  goal: String(args.goal),
                  seconds: Number(args.seconds ?? 60),
                  cpu: 1,
                  memMb: 512,
                  owner: ctx.payer,
                  agent: ctx.agent,
                  paidHbar: ctx.paidHbar,
                  ratePerSecondHbar: analyze.pricing.perSecondHbar ?? 0,
                },
                model,
              ),
              null,
              2,
            ),
          },
        ],
      }),
    });
  }

  const entry = catalogEntry("graph_query");
  if (!entry) return;
  registerPaidTool(server, {
    name: entry.name,
    description: entry.description,
    inputSchema: {
      subgraph: z.string().describe("Full subgraph GraphQL endpoint URL, or a bare subgraph id"),
      query: z.string().describe("GraphQL query text"),
      variables: z.string().optional().describe("Optional JSON-encoded GraphQL variables"),
    },
    price: (args) => priceFor(entry.name, args),
    run: async (args) => {
      const variables = args.variables
        ? (JSON.parse(String(args.variables)) as Record<string, unknown>)
        : undefined;
      const result = await queryGraph(String(args.subgraph), String(args.query), variables);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  });
}
