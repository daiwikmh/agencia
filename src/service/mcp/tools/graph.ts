import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { catalogEntry, priceFor } from "../../catalog.js";
import { queryGraph } from "../../capabilities/graph.js";
import { registerPaidTool } from "../../payments/paid-tool.js";

export function registerGraphTools(server: McpServer): void {
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
