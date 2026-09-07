import { x402Client } from "@x402/core/client";
import type { PaymentRequired } from "@x402/core/types";
import { createClientHederaSigner, PrivateKey } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { config, tinybarToHbar } from "../config.js";
import { encodePayment } from "../x402.js";

export class AgentWallet {
  private readonly client: x402Client;
  private spentTinybar = 0n;
  private readonly budgetTinybar = BigInt(Math.round(config.agent.budgetHbar * 1e8));

  constructor() {
    if (!config.agent.accountId || !config.agent.privateKey) {
      throw new Error("AGENT_ACCOUNT_ID and AGENT_PRIVATE_KEY are required");
    }
    const signer = createClientHederaSigner(
      config.agent.accountId,
      PrivateKey.fromString(config.agent.privateKey),
    );
    this.client = new x402Client().register("hedera:*", new ExactHederaScheme(signer));
  }

  get accountId(): string {
    return config.agent.accountId;
  }

  get remainingHbar(): number {
    return tinybarToHbar(this.budgetTinybar - this.spentTinybar);
  }

  quoteHbar(paymentRequired: PaymentRequired): number {
    return tinybarToHbar(paymentRequired.accepts[0]?.amount ?? "0");
  }

  async createPayment(paymentRequired: PaymentRequired): Promise<string> {
    const amount = BigInt(paymentRequired.accepts[0]?.amount ?? "0");
    if (this.spentTinybar + amount > this.budgetTinybar) {
      throw new Error(
        `payment of ${tinybarToHbar(amount)} HBAR exceeds remaining budget ${this.remainingHbar} HBAR`,
      );
    }
    const payload = await this.client.createPaymentPayload(paymentRequired);
    this.spentTinybar += amount;
    return encodePayment(payload);
  }
}
