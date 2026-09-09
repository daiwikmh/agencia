import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { x402Client } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { serverConfig, tinybarToHbar } from "./config.js";

const X402_PAYMENT_META = "x402/payment";
const X402_ERROR_META = "x402/error";
const X402_RESPONSE_META = "x402/payment-response";
const AGENT_ID_META = "agencia/agent-id";

export interface ServiceManifest {
  service: string;
  description: string;
  network: string;
  x402?: { version: number; scheme: string; facilitator: string; facilitatorHost: string };
  mcp: { url: string };
  resources: Array<{
    resource: string;
    tool: string;
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

export interface PaidInferOutcome {
  ok: boolean;
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

function hashscanTx(txId: string): string {
  const mirrorId = txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
  return `${serverConfig.hashscanBase}/transaction/${mirrorId}`;
}

let sdkClient: x402Client | null = null;
function paymentClient(): x402Client {
  if (sdkClient) return sdkClient;
  if (!serverConfig.agent.accountId || !serverConfig.agent.privateKey) {
    throw new Error("AGENT_ACCOUNT_ID and AGENT_PRIVATE_KEY are not configured");
  }
  const signer = createClientHederaSigner(
    serverConfig.agent.accountId,
    PrivateKey.fromString(serverConfig.agent.privateKey),
  );
  sdkClient = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
  return sdkClient;
}

export async function runPaidInfer(
  prompt: string,
  maxTokens: number,
): Promise<PaidInferOutcome> {
  const steps: string[] = [];
  const manifest = await fetchManifest();
  steps.push(`discovered "${manifest.service}" on ${manifest.network} via /.well-known/x402`);

  const mcp = new McpClient({ name: "agencia-web-agent", version: "0.1.0" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL(manifest.mcp.url)));
  steps.push(`connected to MCP endpoint ${manifest.mcp.url}`);

  const call = (payment?: string) =>
    mcp.callTool({
      name: "infer",
      arguments: { prompt, max_tokens: maxTokens },
      _meta: {
        [AGENT_ID_META]: `hcs-14:web:${serverConfig.agent.accountId}`,
        ...(payment ? { [X402_PAYMENT_META]: payment } : {}),
      },
    }) as Promise<CallToolResult>;

  try {
    let result = await call();
    const challenge = result._meta?.[X402_ERROR_META] as PaymentRequired | undefined;
    if (!result.isError || !challenge?.accepts?.length) {
      return { ok: false, error: "service did not return a 402 challenge", steps };
    }

    const req = challenge.accepts[0];
    const quotedHbar = tinybarToHbar(req.amount);
    steps.push(
      `402 — quote ${quotedHbar} HBAR to ${req.payTo}, feePayer ${(req.extra as { feePayer?: string }).feePayer}`,
    );

    if (serverConfig.agent.budgetHbar > 0 && quotedHbar > serverConfig.agent.budgetHbar) {
      return {
        ok: false,
        error: `quote ${quotedHbar} HBAR exceeds agent budget ${serverConfig.agent.budgetHbar} HBAR`,
        steps,
      };
    }

    let token: string;
    try {
      const payload = await paymentClient().createPaymentPayload(challenge);
      token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
      steps.push("built partially-signed TransferTransaction (X-PAYMENT)");
    } catch (err) {
      return { ok: false, error: `payment build failed: ${String(err)}`, steps };
    }

    result = await call(token);
    if (result.isError) {
      return {
        ok: false,
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
    const usage = result._meta?.usage as PaidInferOutcome["usage"];
    steps.push(
      receipt?.hcs
        ? `settled via Blocky402 — HCS receipt #${receipt.hcs.sequenceNumber}`
        : "settled via Blocky402",
    );

    return {
      ok: true,
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
