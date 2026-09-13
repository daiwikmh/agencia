import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { HBAR_ASSET, config, hbarToTinybar } from "../src/config.js";
import { facilitatorFeePayer, settlePayment, verifyPayment } from "../src/facilitator.js";
import {
  X402_ERROR_META,
  X402_PAYMENT_META,
  X402_RESPONSE_META,
  X402_VERSION,
  decodePayment,
} from "../src/x402.js";
import { buildManifest } from "../src/service/manifest.js";
import { mcpInstructions } from "../src/service/banner.js";
import { RUNNERS, quoteFor, toolDefinitions } from "./tools.js";
import { recordSettlement } from "./receipts.js";
import { computeReachable, isComputeTool, pendingComputeResult, proxyComputeCall } from "./compute-proxy.js";

const AGENT_ID_META = "agencia/agent-id";
const PROTOCOL_VERSION = "2024-11-05";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: JsonRpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const fail = (id: JsonRpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0" as const,
  id,
  error: { code, message },
});

const textContent = (data: unknown) => [
  { type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) },
];

function challenge(base: PaymentRequired, error: string) {
  const payload: PaymentRequired = { ...base, error };
  return {
    isError: true,
    _meta: { [X402_ERROR_META]: payload },
    content: textContent(payload),
  };
}

async function callTool(params: Record<string, unknown>, origin: string) {
  const name = String(params.name ?? "");
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const meta = (params._meta ?? {}) as Record<string, unknown>;

  if (name === "discover") {
    return { content: textContent(buildManifest(origin)) };
  }

  if (isComputeTool(name)) {
    const proxied = await proxyComputeCall(params, null);
    return proxied ?? pendingComputeResult(name, args);
  }

  const runner = RUNNERS[name];
  if (!runner) {
    return { isError: true, content: textContent(`unknown tool "${name}"`) };
  }

  const feePayer = await facilitatorFeePayer();
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: config.network,
    asset: HBAR_ASSET,
    amount: hbarToTinybar(quoteFor(name, args)).toString(),
    payTo: config.service.payTo,
    maxTimeoutSeconds: 120,
    extra: { feePayer },
  };
  const base: PaymentRequired = {
    x402Version: X402_VERSION,
    error: "PAYMENT_REQUIRED",
    resource: {
      url: `agencia://${name}`,
      description: `Agencia ${name}`,
      mimeType: "application/json",
    },
    accepts: [requirements],
  };

  const token = typeof meta[X402_PAYMENT_META] === "string" ? (meta[X402_PAYMENT_META] as string) : undefined;
  if (!token) return challenge(base, "PAYMENT_REQUIRED");

  let payload: PaymentPayload;
  try {
    payload = decodePayment<PaymentPayload>(token);
  } catch {
    return challenge(base, "INVALID_PAYMENT");
  }
  const accepted = (payload.accepted as PaymentRequirements | undefined) ?? requirements;

  const verification = await verifyPayment(payload, accepted);
  if (!verification.isValid) return challenge(base, verification.invalidReason ?? "INVALID_PAYMENT");

  let result: unknown;
  try {
    result = await runner(args);
  } catch (err) {
    return {
      isError: true,
      content: textContent(`tool execution failed: ${String(err instanceof Error ? err.message : err)}`),
    };
  }

  const settlement = await settlePayment(payload, accepted);
  if (!settlement.success) return challenge(base, settlement.errorReason ?? "SETTLEMENT_FAILED");

  const receipt = {
    tool: name,
    transaction: settlement.transaction,
    network: settlement.network,
    payer: settlement.payer ?? verification.payer ?? null,
    agent: typeof meta[AGENT_ID_META] === "string" ? meta[AGENT_ID_META] : null,
    amount: accepted.amount,
    asset: accepted.asset,
    settledAt: new Date().toISOString(),
  };
  const hcs = await recordSettlement(receipt);

  const usage = (result as { usage?: unknown })?.usage;
  return {
    content: textContent((result as { text?: string })?.text ?? result),
    _meta: {
      [X402_RESPONSE_META]: { ...settlement, ...receipt, hcs },
      ...(usage ? { usage } : {}),
    },
  };
}

export async function handleMcp(request: Request, origin: string): Promise<Response> {
  if (request.method === "GET") {
    return new Response("MCP streamable-http endpoint — POST JSON-RPC here", {
      status: 405,
      headers: { allow: "POST" },
    });
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = (await request.json()) as JsonRpcRequest | JsonRpcRequest[];
  } catch {
    return Response.json(fail(null, -32700, "parse error"), { status: 400 });
  }

  const batch = Array.isArray(body) ? body : [body];
  const responses = [];

  for (const message of batch) {
    if (message.method === "notifications/initialized" || message.id == null) continue;

    switch (message.method) {
      case "initialize":
        responses.push(
          ok(message.id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "agencia", version: "0.1.0" },
            instructions: mcpInstructions(origin, toolDefinitions().length),
          }),
        );
        break;
      case "ping":
        responses.push(ok(message.id, {}));
        break;
      case "tools/list": {
        const computeLive = await computeReachable();
        responses.push(
          ok(message.id, {
            tools: [
              {
                name: "discover",
                description: "Return Agencia's x402 service manifest: priced tools, payTo, facilitator.",
                inputSchema: { type: "object", properties: {} },
              },
              ...toolDefinitions().map(({ priced, ...tool }) => tool),
              ...(computeLive
                ? [
                    {
                      name: "compute_lease",
                      description:
                        "Rent a sandboxed container by the second, settled in HBAR. [paid: x402 v2]",
                      inputSchema: {
                        type: "object",
                        properties: {
                          seconds: { type: "number", default: 60 },
                          cpu: { type: "number", default: 1 },
                          memMb: { type: "number", default: 512 },
                          provider: { type: "string", default: "auto" },
                          writable: { type: "boolean", default: false },
                        },
                      },
                    },
                  ]
                : []),
            ],
          }),
        );
        break;
      }
      case "tools/call":
        try {
          responses.push(ok(message.id, await callTool(message.params ?? {}, origin)));
        } catch (err) {
          responses.push(fail(message.id, -32603, String(err instanceof Error ? err.message : err)));
        }
        break;
      default:
        responses.push(fail(message.id, -32601, `method not found: ${message.method}`));
    }
  }

  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}
