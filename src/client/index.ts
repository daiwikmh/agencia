import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { x402Client } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { HBAR_ASSET, config, hbarToTinybar, tinybarToHbar } from "../config.js";
import type { ServiceManifest } from "../service/manifest.js";
import { X402_ERROR_META, X402_PAYMENT_META, X402_RESPONSE_META, encodePayment } from "../x402.js";

const AGENT_ID_META = "agencia/agent-id";

export interface Wallet {
  accountId: string;
  privateKey: string;
}

export interface IssuedWallet extends Wallet {
  network: string;
  fundedHbar: number;
  evmAddress: string | null;
}

export interface CallReceipt {
  quotedHbar: number;
  transaction?: string;
  payer?: string;
  hcs?: { topicId: string; sequenceNumber: string } | null;
}

export interface CallResult {
  text: string;
  receipt?: CallReceipt;
}

export interface ClientOptions {
  serviceUrl?: string;
  wallet?: Wallet;
  budgetHbar?: number;
  maxPaymentHbar?: number;
  agentId?: string;
  onStep?: (step: string) => void;
}

export async function requestWallet(serviceUrl = config.agent.serviceUrl): Promise<IssuedWallet> {
  const res = await fetch(`${serviceUrl}/onboard`, { method: "POST" });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !body.accountId) {
    throw new Error(`onboarding failed: ${String(body.error ?? res.status)}`);
  }
  return {
    accountId: String(body.accountId),
    privateKey: String(body.privateKey),
    network: String(body.network),
    fundedHbar: Number(body.fundedHbar ?? 0),
    evmAddress: body.evmAddress ? String(body.evmAddress) : null,
  };
}

export class AgenciaClient {
  private spentTinybar = 0n;

  private constructor(
    readonly manifest: ServiceManifest,
    readonly accountId: string,
    private readonly mcp: McpClient,
    private readonly payments: x402Client,
    private readonly budgetTinybar: bigint,
    private readonly agentId: string,
    private readonly onStep: (step: string) => void,
  ) {}

  static async connect(options: ClientOptions = {}): Promise<AgenciaClient> {
    const serviceUrl = options.serviceUrl ?? config.agent.serviceUrl;
    const onStep = options.onStep ?? (() => {});

    const res = await fetch(`${serviceUrl}/.well-known/x402`);
    if (!res.ok) throw new Error(`discovery failed: ${res.status}`);
    const manifest = (await res.json()) as ServiceManifest;
    onStep(`discovered ${manifest.service} — ${manifest.resources.length} priced tools`);

    let wallet = options.wallet;
    if (!wallet?.accountId || !wallet?.privateKey) {
      if (config.agent.accountId && config.agent.privateKey) {
        wallet = { accountId: config.agent.accountId, privateKey: config.agent.privateKey };
      } else {
        const issued = await requestWallet(serviceUrl);
        wallet = { accountId: issued.accountId, privateKey: issued.privateKey };
        onStep(`issued a funded wallet ${issued.accountId} (${issued.fundedHbar} HBAR)`);
      }
    }

    const signer = createClientHederaSigner(
      wallet.accountId,
      PrivateKey.fromStringECDSA(wallet.privateKey),
    );
    const payments = new x402Client()
      .register("hedera:*", new ExactHederaScheme(signer))
      .setSpendControls({
        maxAmountPerPayment: false,
        allowedAssets: [
          {
            network: manifest.network as `${string}:${string}`,
            asset: HBAR_ASSET,
            maxAmountPerPayment: hbarToTinybar(
              options.maxPaymentHbar ?? config.agent.maxPaymentHbar,
            ).toString(),
          },
        ],
      });

    const mcp = new McpClient({ name: "agencia-client", version: "0.1.0" });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(manifest.mcp.url)));
    onStep(`connected to ${manifest.mcp.url}`);

    return new AgenciaClient(
      manifest,
      wallet.accountId,
      mcp,
      payments,
      hbarToTinybar(options.budgetHbar ?? config.agent.budgetHbar),
      options.agentId ?? `hcs-14:client:${wallet.accountId}`,
      onStep,
    );
  }

  get remainingHbar(): number {
    return tinybarToHbar(this.budgetTinybar - this.spentTinybar);
  }

  get tools(): string[] {
    return this.manifest.resources.map((r) => r.tool);
  }

  private raw(tool: string, args: Record<string, unknown>, payment?: string) {
    return this.mcp.callTool({
      name: tool,
      arguments: args,
      _meta: {
        [AGENT_ID_META]: this.agentId,
        ...(payment ? { [X402_PAYMENT_META]: payment } : {}),
      },
    }) as Promise<CallToolResult>;
  }

  async call(tool: string, args: Record<string, unknown> = {}): Promise<CallResult> {
    const first = await this.raw(tool, args);
    const challenge = first._meta?.[X402_ERROR_META] as PaymentRequired | undefined;

    if (!first.isError) {
      return { text: textOf(first) };
    }
    if (!challenge?.accepts?.length) {
      throw new Error(`${tool} failed: ${textOf(first)}`);
    }

    const amount = BigInt(challenge.accepts[0]?.amount ?? "0");
    const quotedHbar = tinybarToHbar(amount);
    if (this.spentTinybar + amount > this.budgetTinybar) {
      throw new Error(
        `${tool} quote ${quotedHbar} HBAR exceeds the remaining budget ${this.remainingHbar} HBAR`,
      );
    }
    this.onStep(`402 ${tool} — paying ${quotedHbar} HBAR`);

    const payload = await this.payments.createPaymentPayload(challenge);
    const result = await this.raw(tool, args, encodePayment(payload));
    if (result.isError) throw new Error(`${tool} failed after payment: ${textOf(result)}`);
    this.spentTinybar += amount;

    const receipt = result._meta?.[X402_RESPONSE_META] as
      | { transaction: string; payer: string; hcs: { topicId: string; sequenceNumber: string } | null }
      | undefined;
    this.onStep(
      `settled${receipt?.hcs ? ` — HCS receipt #${receipt.hcs.sequenceNumber}` : ""}`,
    );

    return {
      text: textOf(result),
      receipt: {
        quotedHbar,
        transaction: receipt?.transaction,
        payer: receipt?.payer,
        hcs: receipt?.hcs ?? null,
      },
    };
  }

  close(): Promise<void> {
    return this.mcp.close();
  }
}

function textOf(result: CallToolResult): string {
  return (result.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("\n");
}
