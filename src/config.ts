import { config as loadEnv } from "dotenv";

loadEnv();

export type Network = "hedera:testnet" | "hedera:mainnet";

export const TINYBAR_PER_HBAR = 100_000_000;
export const HBAR_ASSET = "0.0.0";

export function hbarToTinybar(hbar: number): bigint {
  return BigInt(Math.round(hbar * TINYBAR_PER_HBAR));
}

export function tinybarToHbar(tinybar: bigint | string | number): number {
  return Number(BigInt(tinybar)) / TINYBAR_PER_HBAR;
}

export const config = {
  network: (process.env.HEDERA_NETWORK ?? "hedera:testnet") as Network,
  mirrorNodeUrl: process.env.HEDERA_MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com",
  facilitatorUrl: process.env.BLOCKY402_URL ?? "https://api.testnet.blocky402.com",
  service: {
    operatorId: process.env.AGENCIA_OPERATOR_ID ?? "",
    operatorKey: process.env.AGENCIA_OPERATOR_KEY ?? "",
    payTo: process.env.AGENCIA_PAY_TO || process.env.AGENCIA_OPERATOR_ID || "",
    port: Number(process.env.PORT ?? 3022),
    hcsTopicId: process.env.AGENCIA_HCS_TOPIC_ID ?? "",
  },
  pricing: {
    perCallHbar: Number(process.env.PRICE_PER_CALL_HBAR ?? 0.05),
    per1kTokenHbar: Number(process.env.PRICE_PER_1K_TOKEN_HBAR ?? 0.02),
  },
  agent: {
    accountId: process.env.AGENT_ACCOUNT_ID ?? "",
    privateKey: process.env.AGENT_PRIVATE_KEY ?? "",
    budgetHbar: Number(process.env.AGENT_BUDGET_HBAR ?? 5),
    serviceUrl: process.env.AGENCIA_SERVICE_URL ?? "http://localhost:3022",
    identityTopicId: process.env.AGENT_IDENTITY_TOPIC_ID ?? "",
  },
  nim: {
    baseUrl: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.NVIDIA_API_KEY ?? "",
    model: process.env.NIM_MODEL ?? "openai/gpt-oss-120b",
  },
};
