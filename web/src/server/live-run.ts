import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PaymentRequired } from "@x402/core/types";
import { serverConfig, tinybarToHbar } from "./config.js";
import {
  AGENT_ID_META,
  X402_ERROR_META,
  X402_PAYMENT_META,
  X402_RESPONSE_META,
  fetchManifest,
  hashscanTx,
  paymentClient,
  type ServiceManifest,
} from "./pay-flow.js";

export type Phase =
  | "identity"
  | "discovery"
  | "connect"
  | "route"
  | "challenge"
  | "sign"
  | "settle"
  | "exec"
  | "result"
  | "done"
  | "error";

export interface LiveEvent {
  seq: number;
  phase: Phase;
  direction?: "paid" | "received";
  label: string;
  detail?: string;
  hbar?: number;
  transaction?: string;
  hashscan?: string;
  hcs?: { topicId: string; sequenceNumber: string } | null;
  text?: string;
  at: string;
}

export type Emit = (event: Omit<LiveEvent, "seq" | "at">) => void;

interface Receipt {
  transaction: string;
  network: string;
  payer: string;
  hcs: { topicId: string; sequenceNumber: string } | null;
}

function textOf(result: CallToolResult): string {
  return (result.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("\n");
}

class PaidSession {
  private constructor(
    readonly manifest: ServiceManifest,
    private readonly mcp: McpClient,
  ) {}

  static async open(emit: Emit): Promise<PaidSession> {
    const manifest = await fetchManifest();
    emit({
      phase: "discovery",
      label: "Discovered service",
      detail: `${manifest.service} · ${manifest.network} · ${manifest.resources.length} priced tools`,
    });
    const mcp = new McpClient({ name: "agencia-live-agent", version: "0.1.0" });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(manifest.mcp.url)));
    emit({ phase: "connect", label: "Connected to MCP endpoint", detail: manifest.mcp.url });
    return new PaidSession(manifest, mcp);
  }

  private raw(tool: string, args: Record<string, unknown>, payment?: string) {
    return this.mcp.callTool({
      name: tool,
      arguments: args,
      _meta: {
        [AGENT_ID_META]: `hcs-14:web:${serverConfig.agent.accountId}`,
        ...(payment ? { [X402_PAYMENT_META]: payment } : {}),
      },
    }) as Promise<CallToolResult>;
  }

  async free(tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await this.raw(tool, args);
    if (result.isError) throw new Error(`${tool}: ${textOf(result)}`);
    return JSON.parse(textOf(result)) as Record<string, unknown>;
  }

  async paid(
    tool: string,
    args: Record<string, unknown>,
    emit: Emit,
    maxHbar?: number,
  ): Promise<{ text: string; quotedHbar: number; receipt?: Receipt }> {
    const first = await this.raw(tool, args);
    const challenge = first._meta?.[X402_ERROR_META] as PaymentRequired | undefined;
    if (!first.isError || !challenge?.accepts?.length) {
      throw new Error(`${tool} did not return a 402 challenge: ${textOf(first)}`);
    }

    const req = challenge.accepts[0];
    const quotedHbar = tinybarToHbar(req.amount);
    emit({
      phase: "challenge",
      label: `402 Payment Required · ${tool}`,
      detail: `${quotedHbar} ℏ to ${req.payTo} · feePayer ${(req.extra as { feePayer?: string }).feePayer}`,
      hbar: quotedHbar,
    });

    if (maxHbar != null && maxHbar > 0 && quotedHbar > maxHbar) {
      throw new Error(`quote ${quotedHbar} ℏ exceeds the ${maxHbar} ℏ cap`);
    }

    const payload = await paymentClient().createPaymentPayload(challenge);
    const token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
    emit({
      phase: "sign",
      label: "Signed transfer, retrying with X-PAYMENT",
      detail: `payer ${serverConfig.agent.accountId}`,
    });

    const result = await this.raw(tool, args, token);
    if (result.isError) throw new Error(`${tool} failed after payment: ${textOf(result)}`);

    const receipt = result._meta?.[X402_RESPONSE_META] as Receipt | undefined;
    emit({
      phase: "settle",
      direction: "paid",
      label: "Settled through Blocky402",
      detail: receipt?.hcs ? `HCS receipt #${receipt.hcs.sequenceNumber}` : undefined,
      hbar: quotedHbar,
      transaction: receipt?.transaction,
      hashscan: receipt ? hashscanTx(receipt.transaction) : undefined,
      hcs: receipt?.hcs ?? null,
    });

    return { text: textOf(result), quotedHbar, receipt };
  }

  close() {
    return this.mcp.close();
  }
}

export interface ToolScenario {
  scenario: "tool";
  tool: string;
  args: Record<string, unknown>;
  maxHbar?: number;
}

export interface GoalScenario {
  scenario: "goal";
  goal: string;
  maxTurns: number;
  maxHbar?: number;
}

export interface LeaseScenario {
  scenario: "lease";
  seconds: number;
  cpu: number;
  memMb: number;
  ticks: number;
  command: string;
}

export type Scenario = ToolScenario | LeaseScenario | GoalScenario;


const BRAIN = "infer";

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

function plannerPrompt(
  goal: string,
  manifest: ServiceManifest,
  seen: Observation[],
  budget: number,
): string {
  const catalog = manifest.resources
    .filter((r) => r.tool !== BRAIN)
    .map((r) => {
      const params = (r.params ?? [])
        .map((p) => `${p.name}:${p.type}${p.required ? "*" : ""}`)
        .join(", ");
      const pricing = r.pricing as Record<string, number | undefined>;
      const price = [
        pricing.perCallHbar != null ? `${pricing.perCallHbar} base` : "",
        pricing.perSecondHbar != null ? `${pricing.perSecondHbar}/s` : "",
        pricing.per1kTokenHbar != null ? `${pricing.per1kTokenHbar}/1k tok` : "",
      ]
        .filter(Boolean)
        .join(" + ");
      return `- ${r.tool}(${params}) — ${r.description} [${price} HBAR]`;
    })
    .join("\n");

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

CATALOG (discovered at runtime from ${manifest.service}):
${catalog}

WHAT YOU HAVE ALREADY DONE:
${history}

Decide the single next step. Reply with ONE JSON object and nothing else.
To buy a tool call: {"thought":"why","tool":"tool_name","args":{...}}
To finish: {"thought":"why","answer":"the answer for the user"}
Prefer the cheapest tool that answers the goal. Never repeat an identical call. Finish as soon as you can answer.`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runLive(scenario: Scenario, emit: Emit): Promise<void> {
  emit({
    phase: "identity",
    label: "Agent identity",
    detail: `hcs-14:web:${serverConfig.agent.accountId} · did:hedera:${serverConfig.network.split(":")[1]}:${serverConfig.agent.accountId}`,
  });

  const session = await PaidSession.open(emit);
  let spent = 0;

  try {
    if (scenario.scenario === "tool") {
      const { text, quotedHbar } = await session.paid(
        scenario.tool,
        scenario.args,
        emit,
        scenario.maxHbar,
      );
      spent += quotedHbar;
      emit({ phase: "result", label: `${scenario.tool} returned`, text });
      emit({ phase: "done", label: "Run complete", hbar: spent });
      return;
    }


    if (scenario.scenario === "goal") {
      const budget = scenario.maxHbar && scenario.maxHbar > 0 ? scenario.maxHbar : 1;
      const seen: Observation[] = [];
      const brainEmit: Emit = (event) =>
        emit({
          ...event,
          label:
            event.phase === "challenge"
              ? "402 · the agent buys its own reasoning"
              : event.phase === "settle"
                ? "Reasoning paid for"
                : event.label,
        });

      for (let turn = 1; turn <= scenario.maxTurns; turn++) {
        const think = await session.paid(
          BRAIN,
          {
            prompt: plannerPrompt(scenario.goal, session.manifest, seen, budget - spent),
            max_tokens: 400,
          },
          brainEmit,
        );
        spent += think.quotedHbar;

        const decision = parseDecision(think.text);
        if (!decision) {
          emit({ phase: "error", label: "Agent returned an unparseable decision", text: think.text });
          break;
        }
        emit({
          phase: "result",
          label: `Turn ${turn} · agent decided`,
          detail: decision.thought,
          text: decision.tool
            ? `${decision.tool}(${JSON.stringify(decision.args ?? {})})`
            : undefined,
        });

        if (decision.answer || !decision.tool) {
          emit({ phase: "result", label: "Answer", text: decision.answer ?? think.text });
          break;
        }
        if (!session.manifest.resources.some((r) => r.tool === decision.tool)) {
          seen.push({
            tool: decision.tool,
            args: decision.args ?? {},
            hbar: 0,
            result: `ERROR: "${decision.tool}" is not in the catalog`,
          });
          continue;
        }
        if (spent >= budget) {
          emit({ phase: "error", label: `Budget of ${budget} ℏ reached`, detail: "stopping before the next purchase" });
          break;
        }

        try {
          const bought = await session.paid(decision.tool, decision.args ?? {}, emit);
          spent += bought.quotedHbar;
          seen.push({
            tool: decision.tool,
            args: decision.args ?? {},
            hbar: bought.quotedHbar,
            result: bought.text,
          });
          emit({ phase: "result", label: `${decision.tool} returned`, text: bought.text.slice(0, 1200) });
        } catch (err) {
          const message = String(err instanceof Error ? err.message : err);
          seen.push({ tool: decision.tool, args: decision.args ?? {}, hbar: 0, result: `ERROR: ${message}` });
          emit({ phase: "error", label: `${decision.tool} failed`, detail: message });
        }
      }

      emit({ phase: "done", label: "Run complete", hbar: spent });
      return;
    }

    const market = (await session.free("compute_providers", {
      cpu: scenario.cpu,
      memMb: scenario.memMb,
    })) as {
      considered?: { id: string; ratePerSecondHbar: number; available: boolean }[];
      wouldRouteTo?: string;
    };
    const considered = market.considered ?? [];
    emit({
      phase: "route",
      label: `Routed across ${considered.length} provider${considered.length === 1 ? "" : "s"}`,
      detail: `${considered
        .map((p) => `${p.id} @ ${p.ratePerSecondHbar} ℏ/s${p.available ? "" : " (down)"}`)
        .join(" · ")} → ${market.wouldRouteTo}`,
    });

    const opened = await session.paid(
      "compute_lease",
      {
        seconds: scenario.seconds,
        cpu: scenario.cpu,
        memMb: scenario.memMb,
        provider: "auto",
      },
      emit,
    );
    spent += opened.quotedHbar;
    const lease = JSON.parse(opened.text) as Record<string, unknown>;
    const leaseId = String(lease.leaseId);
    emit({
      phase: "result",
      label: `Lease ${leaseId} open on ${lease.providerLabel}`,
      detail: `${lease.cpu} vCPU · ${lease.memMb} MB · ${lease.image} · tick ${lease.tickHbar} ℏ / ${lease.tickSeconds}s`,
    });

    const exec = (await session.free("compute_exec", {
      leaseId,
      command: scenario.command,
    })) as { stdout?: string; stderr?: string; exitCode?: number; durationMs?: number };
    emit({
      phase: "exec",
      label: `Ran on rented hardware (${exec.durationMs}ms)`,
      detail: `exit ${exec.exitCode}`,
      text: (exec.stdout || exec.stderr || "").trim(),
    });

    for (let i = 1; i <= scenario.ticks; i++) {
      await sleep(1500);
      const ticked = await session.paid("compute_tick", { leaseId }, emit);
      spent += ticked.quotedHbar;
      const state = JSON.parse(ticked.text) as Record<string, unknown>;
      emit({
        phase: "result",
        label: `Tick ${i}/${scenario.ticks}`,
        detail: `${state.secondsPurchased}s purchased · ${state.hbarPaid} ℏ paid · expires ${String(state.expiresAt).slice(11, 19)}Z`,
      });
    }

    const closed = (await session.free("compute_end", { leaseId })) as Record<string, unknown>;
    const payout = closed.supplierPayout as
      | { payoutAccountId: string; hbar: number; transaction: string; hcs: { sequenceNumber: string } | null }
      | null;
    if (payout) {
      emit({
        phase: "settle",
        direction: "received",
        label: "Supplier paid out",
        detail: `${payout.hbar} ℏ to ${payout.payoutAccountId}${payout.hcs ? ` · HCS receipt #${payout.hcs.sequenceNumber}` : ""}`,
        hbar: payout.hbar,
        transaction: payout.transaction,
        hashscan: hashscanTx(payout.transaction),
      });
    }
    emit({
      phase: "result",
      label: "Lease closed",
      text: JSON.stringify(closed, null, 2),
    });
    emit({ phase: "done", label: "Run complete", hbar: spent });
  } catch (err) {
    emit({ phase: "error", label: "Run failed", detail: String(err instanceof Error ? err.message : err) });
  } finally {
    await session.close();
  }
}
