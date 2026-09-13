import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { serverConfig } from "./config.js";
import { AGENT_ID_META, fetchManifest } from "./pay-flow.js";

export async function runFreeTool(
  tool: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const manifest = await fetchManifest();
  const mcp = new McpClient({ name: "agencia-web-agent", version: "0.1.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(manifest.mcp.url)));

  try {
    const result = (await mcp.callTool({
      name: tool,
      arguments: args,
      _meta: { [AGENT_ID_META]: `hcs-14:web:${serverConfig.agent.accountId}` },
    })) as CallToolResult;

    const text = (result.content as { type: string; text?: string }[])
      .map((c) => c.text ?? "")
      .join("\n");
    if (result.isError) throw new Error(text || `${tool} failed`);

    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { text };
    }
  } finally {
    await mcp.close();
  }
}
