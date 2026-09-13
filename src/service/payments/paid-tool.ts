import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import type { ZodRawShape } from "zod";
import { HBAR_ASSET, config, hbarToTinybar } from "../../config.js";
import { facilitatorFeePayer, settlePayment, verifyPayment } from "../../facilitator.js";
import {
  X402_ERROR_META,
  X402_PAYMENT_HEADER,
  X402_PAYMENT_META,
  X402_RESPONSE_META,
  X402_VERSION,
  decodePayment,
} from "../../x402.js";
import { recordSettlement } from "../audit/hcs.js";
import { recordSpend, touchIdentity } from "../identity/accounts.js";

const AGENT_ID_META = "agencia/agent-id";
const MENUWALKER_URL = process.env.AGENCIA_MENUWALKER_URL ?? "http://127.0.0.1:7373";

let paidCallsInFlight = 0;

function paw(state: "walking" | "curled"): void {
  if (!process.env.AGENCIA_MENUWALKER) return;
  void fetch(`${MENUWALKER_URL}/${state}`, { method: "POST" }).catch(() => undefined);
}

export interface PaidContext {
  payer: string | null;
  agent: string | null;
  paidHbar: number;
}

export interface PaidToolSpec<Args extends ZodRawShape> {
  name: string;
  description: string;
  inputSchema: Args;
  price: (args: Record<string, unknown>) => number;
  run: (args: Record<string, unknown>, ctx: PaidContext) => Promise<CallToolResult>;
}

function readMeta(extra: unknown, key: string): string | undefined {
  const v = (extra as { _meta?: Record<string, unknown> })?._meta?.[key];
  return typeof v === "string" ? v : undefined;
}

function readPaymentToken(extra: unknown): string | undefined {
  const fromMeta = readMeta(extra, X402_PAYMENT_META);
  if (fromMeta) return fromMeta;
  const headers = (extra as { requestInfo?: { headers?: Headers | Record<string, unknown> } })
    ?.requestInfo?.headers;
  if (headers) {
    if (typeof (headers as Headers).get === "function") {
      return (headers as Headers).get(X402_PAYMENT_HEADER) ?? undefined;
    }
    const rec = headers as Record<string, unknown>;
    const direct = rec[X402_PAYMENT_HEADER] ?? rec["X-PAYMENT"];
    if (typeof direct === "string") return direct;
  }
  return undefined;
}

function challenge(base: PaymentRequired, error: string): CallToolResult {
  const payload: PaymentRequired = { ...base, error };
  return {
    isError: true,
    _meta: { [X402_ERROR_META]: payload },
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

export function registerPaidTool<Args extends ZodRawShape>(
  server: McpServer,
  spec: PaidToolSpec<Args>,
): void {
  const callback = async (
    args: Record<string, unknown>,
    extra: unknown,
  ): Promise<CallToolResult> => {
    const feePayer = await facilitatorFeePayer();
    const requirements: PaymentRequirements = {
      scheme: "exact",
      network: config.network,
      asset: HBAR_ASSET,
      amount: hbarToTinybar(spec.price(args)).toString(),
      payTo: config.service.payTo,
      maxTimeoutSeconds: 120,
      extra: { feePayer },
    };
    const base: PaymentRequired = {
      x402Version: X402_VERSION,
      error: "PAYMENT_REQUIRED",
      resource: {
        url: `agencia://${spec.name}`,
        description: spec.description,
        mimeType: "application/json",
      },
      accepts: [requirements],
    };

    const token = readPaymentToken(extra);
    if (!token) return challenge(base, "PAYMENT_REQUIRED");

    let payload: PaymentPayload;
    try {
      payload = decodePayment<PaymentPayload>(token);
    } catch {
      return challenge(base, "INVALID_PAYMENT");
    }
    const accepted = (payload.accepted as PaymentRequirements | undefined) ?? requirements;

    const verification = await verifyPayment(payload, accepted);
    if (!verification.isValid) {
      return challenge(base, verification.invalidReason ?? "INVALID_PAYMENT");
    }

    paidCallsInFlight += 1;
    paw("walking");
    try {
      const ctx: PaidContext = {
        payer: verification.payer ?? null,
        agent: readMeta(extra, AGENT_ID_META) ?? null,
        paidHbar: Number(accepted.amount) / 1e8,
      };
      if (ctx.payer) {
        touchIdentity(ctx.payer);
        recordSpend(ctx.payer, ctx.paidHbar, spec.name === "compute_lease");
      }

      let result: CallToolResult;
      try {
        result = await spec.run(args, ctx);
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `tool execution failed: ${String(err)}` }],
        };
      }
      if (result.isError) return result;

      const settlement = await settlePayment(payload, accepted);
      if (!settlement.success) {
        return challenge(base, settlement.errorReason ?? "SETTLEMENT_FAILED");
      }

      const receipt = {
        tool: spec.name,
        transaction: settlement.transaction,
        network: settlement.network,
        payer: settlement.payer ?? verification.payer ?? null,
        agent: readMeta(extra, AGENT_ID_META) ?? null,
        amount: accepted.amount,
        asset: accepted.asset,
        settledAt: new Date().toISOString(),
      };
      const hcs = await recordSettlement(receipt);

      result._meta = {
        ...(result._meta ?? {}),
        [X402_RESPONSE_META]: { ...settlement, ...receipt, hcs },
      };
      return result;
    } finally {
      paidCallsInFlight -= 1;
      if (paidCallsInFlight === 0) paw("curled");
    }
  };

  server.tool(
    spec.name,
    `${spec.description} [paid: x402 v2 / HBAR on ${config.network}]`,
    spec.inputSchema,
    callback as unknown as ToolCallback<Args>,
  );
}
