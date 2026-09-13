import "../node-env.js";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PaymentRequired } from "@x402/core/types";
import { X402_ERROR_META, X402_PAYMENT_META, X402_RESPONSE_META } from "../x402.js";
import { discover } from "./discover.js";
import { agentIdentity } from "./identity.js";
import { AgentWallet } from "./wallet.js";

const AGENT_ID_META = "agencia/agent-id";

interface Receipt {
  transaction?: string;
  hcs?: { topicId: string; sequenceNumber: string } | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function textOf(result: CallToolResult): string {
  return (result.content as { type: string; text?: string }[])
    .map((c) => c.text ?? "")
    .join("\n");
}

async function main() {
  const seconds = Number(process.argv[2] ?? 30);
  const ticks = Number(process.argv[3] ?? 3);

  const identity = agentIdentity();
  const service = await discover();
  const wallet = new AgentWallet();

  console.log(`[agent] ${identity.aid}`);
  console.log(`[agent] discovered "${service.service}" on ${service.network}`);
  console.log(`[agent] wallet ${wallet.accountId}, budget ${wallet.remainingHbar} HBAR\n`);

  const mcp = new McpClient({ name: "agencia-lease-agent", version: "0.1.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(service.mcpUrl)));

  const callTool = async (
    name: string,
    args: Record<string, unknown>,
    payment?: string,
  ): Promise<CallToolResult> =>
    mcp.callTool({
      name,
      arguments: args,
      _meta: {
        [AGENT_ID_META]: identity.aid,
        ...(payment ? { [X402_PAYMENT_META]: payment } : {}),
      },
    }) as Promise<CallToolResult>;

  const paidCall = async (name: string, args: Record<string, unknown>) => {
    let result = await callTool(name, args);
    const challenge = result._meta?.[X402_ERROR_META] as PaymentRequired | undefined;
    if (result.isError && challenge?.accepts?.length) {
      const quote = wallet.quoteHbar(challenge);
      console.log(`[402] ${name} → ${quote} HBAR`);
      result = await callTool(name, args, await wallet.createPayment(challenge));
    }
    if (result.isError) throw new Error(`${name} failed: ${textOf(result)}`);
    const receipt = result._meta?.[X402_RESPONSE_META] as Receipt | undefined;
    if (receipt?.transaction) {
      console.log(
        `[settled] ${receipt.transaction}${receipt.hcs ? ` · HCS #${receipt.hcs.sequenceNumber}` : ""}`,
      );
    }
    return JSON.parse(textOf(result)) as Record<string, unknown>;
  };

  const providers = JSON.parse(
    textOf(await callTool("compute_providers", { cpu: 1, memMb: 512 })),
  ) as { considered: unknown[]; wouldRouteTo: string };
  console.log(`[agent] providers: ${JSON.stringify(providers.considered)}`);
  console.log(`[agent] routing to ${providers.wouldRouteTo}\n`);

  const lease = await paidCall("compute_lease", { seconds, cpu: 1, memMb: 512, provider: "auto" });
  const leaseId = String(lease.leaseId);
  console.log(`[lease] ${leaseId} on ${lease.providerLabel}, expires ${lease.expiresAt}\n`);

  const boot = JSON.parse(
    textOf(
      await callTool("compute_exec", {
        leaseId,
        command: "node -e \"console.log('agent runtime online:', process.version, require('os').cpus().length + ' cpu')\"",
      }),
    ),
  ) as { stdout: string; durationMs: number };
  console.log(`[exec] ${boot.stdout.trim()} (${boot.durationMs}ms)\n`);

  for (let i = 1; i <= ticks; i++) {
    await sleep(2000);
    const ticked = await paidCall("compute_tick", { leaseId });
    console.log(
      `[tick ${i}/${ticks}] purchased ${ticked.secondsPurchased}s · paid ${ticked.hbarPaid} HBAR · expires ${ticked.expiresAt}\n`,
    );
  }

  const summary = JSON.parse(textOf(await callTool("compute_end", { leaseId }))) as Record<
    string,
    unknown
  >;
  console.log(`[agent] --- lease summary ---`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n[agent] remaining budget: ${wallet.remainingHbar} HBAR`);

  await mcp.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
