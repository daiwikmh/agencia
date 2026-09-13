import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDiscoverTool } from "./tools/discover.js";
import { registerInferTool } from "./tools/infer.js";
import { registerOpenAITool } from "./tools/openai.js";
import { registerHederaTools } from "./tools/hedera.js";
import { registerPriceTools } from "./tools/price.js";
import { registerExternalTools } from "./tools/external.js";
import { registerGraphTools } from "./tools/graph.js";
import { registerComputeTools } from "./tools/compute.js";

export function buildMcpServer(origin: string): McpServer {
  const server = new McpServer({ name: "agencia", version: "0.1.0" });
  registerDiscoverTool(server, origin);
  registerInferTool(server);
  registerOpenAITool(server);
  registerHederaTools(server);
  registerPriceTools(server);
  registerExternalTools(server);
  registerGraphTools(server);
  registerComputeTools(server);
  return server;
}
