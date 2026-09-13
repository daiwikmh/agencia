import "../node-env.js";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PaymentRequired } from "@x402/core/types";
import { X402_ERROR_META, X402_PAYMENT_META, X402_RESPONSE_META } from "../x402.js";
import { discover, type DiscoveredService } from "./discover.js";
import { agentIdentity } from "./identity.js";
import { AgentWallet } from "./wallet.js";

const AGENT_ID_META = "agencia/agent-id";
const BRAIN = "infer";
const MAX_TURNS = 6;

interface Decision {
  thought?: string;
  tool?: string;
  args?: Record<string, unknown>;
  answer?: string;
}

interface Observation {
  tool: string;
  args: Record<string, unknown>;
  hbar: number;
  result: string;
}

function textOf(result: CallToolResult): string {
  return (result.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("\n");
}

function parseDecision(raw: string): Decision | null {
  const fenced = raw.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < fenced.length; i++) {
    if (fenced[i] === "{") depth++;
    if (fenced[i] === "}") depth--;
    if (depth === 0) {
      try {
        return JSON.parse(fenced.slice(start, i + 1)) as Decision;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function catalogFor(service: DiscoveredService): string {
  return service.resources
    .filter((r) => r.tool !== BRAIN)
    .map((r) => {
      const params = (r.params ?? [])
        .map((p) => `${p.name}:${p.type}${p.required ? "*" : ""}`)
        .join(", ");
      const price = [
        r.pricing.perCallHbar != null ? `${r.pricing.perCallHbar} base` : "",
        r.pricing.perSecondHbar != null ? `${r.pricing.perSecondHbar}/s` : "",
        r.pricing.per1kTokenHbar != null ? `${r.pricing.per1kTokenHbar}/1k tok` : "",
      ]
        .filter(Boolean)
        .join(" + ");
      return `- ${r.tool}(${params}) — ${r.description} [${price} HBAR]`;
    })
    .join("\n");
}

function prompt(goal: string, service: DiscoveredService, seen: Observation[], budget: number) {
  const history = seen.length
    ? seen
        .map(
          (o, i) =>
            `${i + 1}. called ${o.tool}(${JSON.stringify(o.args)}) — paid ${o.hbar} HBAR — result: ${o.result.slice(0, 600)}`,
        )
        .join("\n")
    : "(nothing yet)";

  return `GOAL: ${goal}

You are an autonomous agent with a Hedera wallet and no API keys. Every tool below costs HBAR, charged per call through x402. Your remaining budget is ${budget.toFixed(4)} HBAR.

CATALOG (discovered at runtime from ${service.service}):
${catalogFor(service)}

WHAT YOU HAVE ALREADY DONE:
${history}

Decide the single next step. Reply with ONE JSON object and nothing else.
To buy a tool call: {"thought":"why","tool":"tool_name","args":{...}}
To finish: {"thought":"why","answer":"the answer for the user"}
Prefer the cheapest tool that answers the goal. Never repeat an identical call. Finish as soon as you can answer.`;
}

async function main() {
  const goal =
    process.argv.slice(2).join(" ") ||
    "Find out what HBAR is worth right now and how much HBAR account 0.0.10500124 holds.";

  const identity = agentIdentity();
  const wallet = new AgentWallet();
  console.log(`[agent] ${identity.aid}`);
  console.log(`[agent] wallet ${wallet.accountId}, budget ${wallet.remainingHbar} HBAR`);
  console.log(`[agent] goal: ${goal}\n`);

  const service = await discover();
  console.log(
    `[discover] ${service.service} on ${service.network} — ${service.resources.length} priced tools, no API key required\n`,
  );

  const mcp = new McpClient({ name: "agencia-goal-agent", version: "0.1.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(service.mcpUrl)));

  const raw = (tool: string, args: Record<string, unknown>, payment?: string) =>
    mcp.callTool({
      name: tool,
      arguments: args,
      _meta: {
        [AGENT_ID_META]: identity.aid,
        ...(payment ? { [X402_PAYMENT_META]: payment } : {}),
      },
    }) as Promise<CallToolResult>;

  const buy = async (tool: string, args: Record<string, unknown>) => {
    const first = await raw(tool, args);
    const challenge = first._meta?.[X402_ERROR_META] as PaymentRequired | undefined;
    if (!first.isError || !challenge?.accepts?.length) {
      throw new Error(`${tool}: no 402 challenge — ${textOf(first)}`);
    }
    const quoted = wallet.quoteHbar(challenge);
    const token = await wallet.createPayment(challenge);
    const result = await raw(tool, args, token);
    if (result.isError) throw new Error(`${tool} failed: ${textOf(result)}`);
    const receipt = result._meta?.[X402_RESPONSE_META] as
      | { transaction?: string; hcs?: { sequenceNumber: string } | null }
      | undefined;
    return { text: textOf(result), quoted, receipt };
  };

  const seen: Observation[] = [];
  let spent = 0;

  try {
    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const think = await buy(BRAIN, {
        prompt: prompt(goal, service, seen, wallet.remainingHbar),
        max_tokens: 400,
      });
      spent += think.quoted;
      console.log(
        `[turn ${turn}] bought its own reasoning — ${think.quoted} HBAR${think.receipt?.hcs ? ` · HCS #${think.receipt.hcs.sequenceNumber}` : ""}`,
      );

      const decision = parseDecision(think.text);
      if (!decision) {
        console.log(`[turn ${turn}] could not parse a decision, stopping`);
        break;
      }
      if (decision.thought) console.log(`[turn ${turn}] thought: ${decision.thought}`);

      if (decision.answer || !decision.tool) {
        console.log(`\n[agent] --- answer ---\n${decision.answer ?? think.text}\n`);
        break;
      }

      if (!service.resources.some((r) => r.tool === decision.tool)) {
        seen.push({
          tool: decision.tool,
          args: decision.args ?? {},
          hbar: 0,
          result: `ERROR: "${decision.tool}" is not in the catalog`,
        });
        continue;
      }

      console.log(`[turn ${turn}] chose ${decision.tool}(${JSON.stringify(decision.args ?? {})})`);
      try {
        const bought = await buy(decision.tool, decision.args ?? {});
        spent += bought.quoted;
        console.log(
          `[turn ${turn}] paid ${bought.quoted} HBAR${bought.receipt?.hcs ? ` · HCS #${bought.receipt.hcs.sequenceNumber}` : ""}`,
        );
        seen.push({
          tool: decision.tool,
          args: decision.args ?? {},
          hbar: bought.quoted,
          result: bought.text,
        });
      } catch (err) {
        seen.push({
          tool: decision.tool,
          args: decision.args ?? {},
          hbar: 0,
          result: `ERROR: ${String(err instanceof Error ? err.message : err)}`,
        });
      }
      console.log();
    }
  } finally {
    console.log(`[agent] spent ${spent.toFixed(6)} HBAR across ${seen.length + 1} paid calls`);
    console.log(`[agent] remaining budget ${wallet.remainingHbar} HBAR`);
    await mcp.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
