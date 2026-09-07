import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildManifest } from "../../manifest.js";

export function registerDiscoverTool(server: McpServer, origin: string): void {
  server.tool(
    "discover",
    "Return Agencia's x402 service manifest: priced tools, payTo account, pricing model, and facilitator.",
    {},
    async () => ({
      content: [{ type: "text", text: JSON.stringify(buildManifest(origin), null, 2) }],
    }),
  );
}
