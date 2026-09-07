import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDiscoverTool } from "./tools/discover.js";
import { registerInferTool } from "./tools/infer.js";

export function buildMcpServer(origin: string): McpServer {
  const server = new McpServer({ name: "agencia", version: "0.1.0" });
  registerDiscoverTool(server, origin);
  registerInferTool(server);
  return server;
}
