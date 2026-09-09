export type {
  PaymentRequired,
  PaymentRequirements,
  PaymentPayload,
  VerifyResponse,
  SettleResponse,
} from "@x402/core/types";

export const X402_VERSION = 2 as const;

export const X402_PAYMENT_META = "x402/payment";
export const X402_ERROR_META = "x402/error";
export const X402_RESPONSE_META = "x402/payment-response";
export const X402_PAYMENT_HEADER = "x-payment";

export function encodePayment(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function decodePayment<T = unknown>(token: string): T {
  return JSON.parse(Buffer.from(token, "base64").toString("utf8")) as T;
}
