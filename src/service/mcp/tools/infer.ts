import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { priceInHbar, runInference } from "../../capabilities/inference.js";
import { registerPaidTool } from "../../payments/paid-tool.js";

export function registerInferTool(server: McpServer): void {
  registerPaidTool(server, {
    name: "infer",
    description:
      "Run a chat completion on Agencia's hosted model. Priced from max_tokens: perCall + per-1k-token, in HBAR.",
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
    price: (args) => priceInHbar(Number(args.max_tokens ?? 256)),
    run: async (args) => {
      const result = await runInference({
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
