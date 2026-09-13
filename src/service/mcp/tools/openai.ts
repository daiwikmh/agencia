import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { catalogEntry, priceFor } from "../../catalog.js";
import { runOpenAIInference } from "../../capabilities/openai.js";
import { registerPaidTool } from "../../payments/paid-tool.js";

export function registerOpenAITool(server: McpServer): void {
  const entry = catalogEntry("infer_openai");
  if (!entry) return;
  registerPaidTool(server, {
    name: entry.name,
    description: entry.description,
    inputSchema: {
      prompt: z.string().describe("User prompt"),
      max_tokens: z
        .number()
        .int()
        .min(1)
        .max(2048)
        .default(256)
        .describe("Max completion tokens; also sets the payment ceiling"),
      system: z.string().optional().describe("Optional system prompt"),
    },
    price: (args) => priceFor(entry.name, args),
    run: async (args) => {
      const result = await runOpenAIInference({
        prompt: String(args.prompt),
        max_tokens: Number(args.max_tokens ?? 256),
        system: args.system ? String(args.system) : undefined,
      });
      return {
        content: [{ type: "text", text: result.text }],
        _meta: { usage: result.usage },
      };
    },
  });
}
