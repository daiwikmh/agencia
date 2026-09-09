import { HTTPFacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { config } from "./config.js";

const client = new HTTPFacilitatorClient({ url: config.facilitatorUrl });

let feePayerCache: { network: string; feePayer: string } | null = null;

export async function facilitatorFeePayer(): Promise<string> {
  if (feePayerCache?.network === config.network) return feePayerCache.feePayer;
  const supported = await client.getSupported();
  const kind = supported.kinds.find(
    (k) => k.network === config.network && k.scheme === "exact",
  );
  const feePayer = (kind?.extra as { feePayer?: string } | undefined)?.feePayer;
  if (!feePayer) {
    throw new Error(`facilitator does not support exact/${config.network}`);
  }
  feePayerCache = { network: config.network, feePayer };
  return feePayer;
}

export function verifyPayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResponse> {
  return client.verify(payload, requirements);
}

export function settlePayment(
  payload: PaymentPayload,
  requirements: PaymentRequirements,
): Promise<SettleResponse> {
  return client.settle(payload, requirements);
}

export const facilitatorName = new URL(config.facilitatorUrl).host;
