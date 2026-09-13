import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { x402Client } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { serverConfig, tinybarToHbar } from "./config.js";

export const X402_PAYMENT_META = "x402/payment";
export const X402_ERROR_META = "x402/error";
export const X402_RESPONSE_META = "x402/payment-response";
export const AGENT_ID_META = "agencia/agent-id";

export interface ManifestParam {
  name: string;
  type: "string" | "number";
  label: string;
  required?: boolean;
  default?: string | number;
  min?: number;
  max?: number;
  placeholder?: string;
  multiline?: boolean;
}

export interface ServiceManifest {
  service: string;
  description: string;
  network: string;
  x402?: { version: number; scheme: string; facilitator: string; facilitatorHost: string };
  mcp: { url: string };
  resources: Array<{
    resource: string;
    tool: string;
    title?: string;
    category?: string;
    description?: string;
    featured?: boolean;
    params?: ManifestParam[];
    asset: string;
    payTo: string;
    pricing: Record<string, unknown>;
  }>;
  audit: { type: "hcs"; topicId: string; mirror: string } | null;
}

export async function fetchManifest(): Promise<ServiceManifest> {
  const res = await fetch(`${serverConfig.serviceUrl}/.well-known/x402`);
  if (!res.ok) throw new Error(`discovery failed: ${res.status}`);
  return (await res.json()) as ServiceManifest;
}

export async function fetchHealth(): Promise<Record<string, unknown>> {
  const res = await fetch(`${serverConfig.serviceUrl}/health`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`health ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export interface PaidCallOutcome {
  ok: boolean;
  tool?: string;
  text?: string;
  usage?: { prompt: number; completion: number; total: number };
  payment?: {
    quotedHbar: number;
    transaction: string;
    hashscan: string;
    payer: string;
    network: string;
    hcs: { topicId: string; sequenceNumber: string } | null;
  };
  error?: string;
  steps: string[];
}

export function hashscanTx(txId: string): string {
  const mirrorId = txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  return `${serverConfig.hashscanBase}/transaction/${mirrorId}`;
}

/**
 * Cumulative spend guard.
 *
 * The per-call check below only ever compared ONE quote against the budget, so
 * a public deployment with a funded wallet could be drained by repeating cheap
 * calls forever. This tracks the running total instead.
 *
 * Caveat worth knowing: on serverless this lives in one instance's memory and
 * resets on a cold start, so it limits a burst, not a determined attacker over
 * time. The real protection for a public deployment is keeping the hot wallet
 * small — treat it as a float, not a treasury.
 */
const spendWindow = { total: 0, since: Date.now() };

function spendGuard(quotedHbar: number): string | null {
  const cap = serverConfig.agent.budgetHbar;
  if (cap <= 0) return null;

  const elapsedHours = (Date.now() - spendWindow.since) / 3_600_000;
  if (elapsedHours >= 1) {
    spendWindow.total = 0;
    spendWindow.since = Date.now();
  }
  if (spendWindow.total + quotedHbar > cap) {
    return `this deployment has spent ${spendWindow.total.toFixed(4)} of its ${cap} HBAR hourly budget — ${quotedHbar} HBAR refused`;
  }
  return null;
}

/**
 * Spend controls are built from the 402 challenge, not from config.
 *
 * The allowedAssets entry has to match the network id the service quotes in
 * ("hedera:testnet"). Deriving it from HEDERA_NETWORK meant any deployment
 * that left that var unset fell back to "hedera-testnet" and had every payment
 * rejected by spendControls — a silent mismatch that only shows up at the
 * moment of paying.
 */
let sdkClient: x402Client | null = null;
let sdkKey = "";

export function paymentClient(network: string, asset: string): x402Client {
  const key = `${network}|${asset}`;
  if (sdkClient && sdkKey === key) return sdkClient;
  if (!serverConfig.agent.accountId || !serverConfig.agent.privateKey) {
    throw new Error("AGENT_ACCOUNT_ID and AGENT_PRIVATE_KEY are not configured");
  }
  const signer = createClientHederaSigner(
    serverConfig.agent.accountId,
    PrivateKey.fromStringECDSA(serverConfig.agent.privateKey),
  );
  sdkClient = new x402Client()
    .register("hedera:*", new ExactHederaScheme(signer))
    .setSpendControls({
      allowedAssets: [
        {
          network: network as `${string}:${string}`,
          asset,
          maxAmountPerPayment: "100000000",
        },
      ],
    });
  sdkKey = key;
  return sdkClient;
}

export async function runPaidCall(
  tool: string,
  args: Record<string, unknown>,
  maxHbar?: number,
): Promise<PaidCallOutcome> {
  const steps: string[] = [];
  const manifest = await fetchManifest();
  steps.push(`discovered "${manifest.service}" on ${manifest.network} via /.well-known/x402`);

  if (!manifest.resources.some((r) => r.tool === tool)) {
    return { ok: false, tool, error: `unknown tool "${tool}"`, steps };
  }

  const mcp = new McpClient({ name: "agencia-web-agent", version: "0.1.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(manifest.mcp.url)));
  steps.push(`connected to MCP endpoint ${manifest.mcp.url}`);

  const call = (payment?: string) =>
    mcp.callTool({
      name: tool,
      arguments: args,
      _meta: {
        [AGENT_ID_META]: `hcs-14:web:${serverConfig.agent.accountId}`,
        ...(payment ? { [X402_PAYMENT_META]: payment } : {}),
      },
    }) as Promise<CallToolResult>;

  try {
    let result = await call();
    const challenge = result._meta?.[X402_ERROR_META] as PaymentRequired | undefined;
    if (!result.isError || !challenge?.accepts?.length) {
      return { ok: false, tool, error: "service did not return a 402 challenge", steps };
    }

    const req = challenge.accepts[0];
    const quotedHbar = tinybarToHbar(req.amount);
    steps.push(
      `402 — quote ${quotedHbar} HBAR to ${req.payTo}, feePayer ${(req.extra as { feePayer?: string }).feePayer}`,
    );

    if (maxHbar != null && maxHbar > 0 && quotedHbar > maxHbar) {
      return {
        ok: false,
        tool,
        error: `quote ${quotedHbar} HBAR exceeds per-call cap ${maxHbar} HBAR`,
        steps,
      };
    }
    const refused = spendGuard(quotedHbar);
    if (refused) {
      return { ok: false, tool, error: refused, steps };
    }

    let token: string;
    try {
      const payload = await paymentClient(req.network, req.asset).createPaymentPayload(challenge);
      token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
      steps.push("built partially-signed TransferTransaction (X-PAYMENT)");
    } catch (err) {
      return { ok: false, error: `payment build failed: ${String(err)}`, steps };
    }

    result = await call(token);
    if (!result.isError) spendWindow.total += quotedHbar;
    if (result.isError) {
      return {
        ok: false,
        tool,
        error: `retry failed: ${JSON.stringify(result._meta?.[X402_ERROR_META] ?? result.content)}`,
        steps,
      };
    }

    const text = (result.content as { type: string; text?: string }[])
      .map((c) => c.text ?? "")
      .join("\n");
    const receipt = result._meta?.[X402_RESPONSE_META] as
      | {
          transaction: string;
          network: string;
          payer: string;
          hcs: { topicId: string; sequenceNumber: string } | null;
        }
      | undefined;
    const usage = result._meta?.usage as PaidCallOutcome["usage"];
    steps.push(
      receipt?.hcs
        ? `settled via Blocky402 — HCS receipt #${receipt.hcs.sequenceNumber}`
        : "settled via Blocky402",
    );

    return {
      ok: true,
      tool,
      text,
      usage,
      payment: receipt
        ? {
            quotedHbar,
            transaction: receipt.transaction,
            hashscan: hashscanTx(receipt.transaction),
            payer: receipt.payer,
            network: receipt.network,
            hcs: receipt.hcs,
          }
        : undefined,
      steps,
    };
  } finally {
    await mcp.close();
  }
}
