import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PaymentRequired } from "@x402/core/types";
import {
  X402_ERROR_META,
  X402_PAYMENT_META,
  X402_RESPONSE_META,
} from "../x402.js";
import { discover } from "./discover.js";
import { agentIdentity, publishIdentity } from "./identity.js";
import { AgentWallet } from "./wallet.js";

const AGENT_ID_META = "agencia/agent-id";

async function main() {
  const prompt =
    process.argv.slice(2).join(" ") ||
    "Explain the x402 payment standard in two sentences.";

  const identity = agentIdentity();
  console.log(`[agent] identity ${identity.aid} (${identity.did})`);
  const published = await publishIdentity();
  if (published) {
    console.log(`[agent] identity profile on HCS topic ${published.topicId} #${published.sequenceNumber}`);
  }

  const service = await discover();
  console.log(`[agent] discovered "${service.service}" on ${service.network}, facilitator ${service.facilitator}`);
  console.log(`[agent] priced tools: ${service.resources.map((r) => r.tool).join(", ")}`);

  const wallet = new AgentWallet();
  console.log(`[agent] wallet ${wallet.accountId}, budget ${wallet.remainingHbar} HBAR`);

  const mcp = new McpClient({ name: "agencia-agent", version: "0.1.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(service.mcpUrl)));

  const call = (payment?: string): Promise<CallToolResult> =>
    mcp.callTool({
      name: "infer",
      arguments: { prompt, max_tokens: 256 },
      _meta: {
        [AGENT_ID_META]: identity.aid,
        ...(payment ? { [X402_PAYMENT_META]: payment } : {}),
      },
    }) as Promise<CallToolResult>;

  let result = await call();
  const challenge = result._meta?.[X402_ERROR_META] as PaymentRequired | undefined;

  if (result.isError && challenge?.accepts?.length) {
    const req = challenge.accepts[0];
    console.log(
      `[agent] 402 — building payment of ${wallet.quoteHbar(challenge)} HBAR to ${req.payTo} (feePayer ${(req.extra as { feePayer?: string }).feePayer})`,
    );
    const payment = await wallet.createPayment(challenge);
    console.log(`[agent] partially-signed transfer built, retrying with X-PAYMENT`);
    result = await call(payment);
  }

  if (result.isError) {
    console.error(`[agent] call failed:`, JSON.stringify(result._meta?.[X402_ERROR_META] ?? result.content, null, 2));
    await mcp.close();
    process.exit(1);
  }

  const text = (result.content as { type: string; text?: string }[])
    .map((c) => c.text ?? "")
    .join("\n");
  const receipt = result._meta?.[X402_RESPONSE_META];

  console.log(`\n[agent] --- result ---\n${text}\n`);
  console.log(`[agent] --- settlement receipt ---`);
  console.log(JSON.stringify(receipt, null, 2));
  console.log(`\n[agent] remaining budget: ${wallet.remainingHbar} HBAR`);

  await mcp.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
