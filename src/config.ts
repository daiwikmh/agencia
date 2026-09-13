import { setDefaultResultOrder } from "node:dns";
import { config as loadEnv } from "dotenv";

loadEnv();
setDefaultResultOrder(process.env.DNS_RESULT_ORDER === "verbatim" ? "verbatim" : "ipv4first");

export type Network = "hedera:testnet" | "hedera:mainnet";

export const TINYBAR_PER_HBAR = 100_000_000;
export const HBAR_ASSET = "0.0.0";

export function hbarToTinybar(hbar: number): bigint {
  return BigInt(Math.round(hbar * TINYBAR_PER_HBAR));
}

export function tinybarToHbar(tinybar: bigint | string | number): number {
  return Number(BigInt(tinybar)) / TINYBAR_PER_HBAR;
}

export interface RemoteComputeConfig {
  id: string;
  label: string;
  baseUrl: string;
  token: string;
  ratePerSecondHbar: number;
  region?: string;
}

function remoteComputeProviders(): RemoteComputeConfig[] {
  const ids = (process.env.COMPUTE_PROVIDERS ?? "local")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "local");

  return ids.flatMap((id) => {
    const key = id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const baseUrl = process.env[`COMPUTE_${key}_URL`];
    if (!baseUrl) return [];
    return [
      {
        id,
        label: process.env[`COMPUTE_${key}_LABEL`] ?? id,
        baseUrl,
        token: process.env[`COMPUTE_${key}_TOKEN`] ?? "",
        ratePerSecondHbar: Number(process.env[`COMPUTE_${key}_RATE`] ?? 0.002),
        region: process.env[`COMPUTE_${key}_REGION`],
      },
    ];
  });
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
    perCallHbarOpenai: Number(process.env.PRICE_PER_CALL_HBAR_OPENAI ?? 0.03),
    per1kTokenHbarOpenai: Number(process.env.PRICE_PER_1K_TOKEN_HBAR_OPENAI ?? 0.015),
  },
  compute: {
    providers: (process.env.COMPUTE_PROVIDERS ?? "local")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    remotes: remoteComputeProviders(),
    image: process.env.COMPUTE_IMAGE ?? "node:22-alpine",
    network: process.env.COMPUTE_NETWORK ?? "bridge",
    region: process.env.COMPUTE_REGION ?? "local",
    localRatePerSecondHbar: Number(process.env.COMPUTE_RATE_PER_SECOND_HBAR ?? 0.0015),
    openFeeHbar: Number(process.env.COMPUTE_OPEN_FEE_HBAR ?? 0.01),
    tickSeconds: Number(process.env.COMPUTE_TICK_SECONDS ?? 10),
    maxLeaseSeconds: Number(process.env.COMPUTE_MAX_LEASE_SECONDS ?? 900),
    maxCpu: Number(process.env.COMPUTE_MAX_CPU ?? 2),
    maxMemMb: Number(process.env.COMPUTE_MAX_MEM_MB ?? 1024),
    execTimeoutMs: Number(process.env.COMPUTE_EXEC_TIMEOUT_MS ?? 60_000),
    graceSeconds: Number(process.env.COMPUTE_GRACE_SECONDS ?? 5),
    hbarUsd: Number(process.env.HBAR_USD ?? 0),
    adminToken: process.env.COMPUTE_ADMIN_TOKEN ?? "",
    supplierStore: process.env.COMPUTE_SUPPLIER_STORE ?? "data/suppliers.json",
    supplierSharePct: Number(process.env.COMPUTE_SUPPLIER_SHARE_PCT ?? 70),
    autoApprove: process.env.COMPUTE_AUTO_APPROVE === "true",
  },
  onboard: {
    enabled: process.env.ONBOARD_ENABLED !== "false",
    fundHbar: Number(process.env.ONBOARD_FUND_HBAR ?? 5),
    maxPerHour: Number(process.env.ONBOARD_MAX_PER_HOUR ?? 20),
  },
  agent: {
    accountId: process.env.AGENT_ACCOUNT_ID ?? "",
    privateKey: process.env.AGENT_PRIVATE_KEY ?? "",
    budgetHbar: Number(process.env.AGENT_BUDGET_HBAR ?? 5),
    maxPaymentHbar: Number(process.env.AGENT_MAX_PAYMENT_HBAR ?? 2),
    serviceUrl: process.env.AGENCIA_SERVICE_URL ?? "http://localhost:3022",
    identityTopicId: process.env.AGENT_IDENTITY_TOPIC_ID ?? "",
  },
  nim: {
    baseUrl: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.NVIDIA_API_KEY ?? "",
    model: process.env.NIM_MODEL ?? "openai/gpt-oss-20b",
  },
  graph: {
    apiKey: process.env.GRAPH_API_KEY ?? "",
    gatewayBase: process.env.GRAPH_GATEWAY_BASE ?? "https://gateway.thegraph.com/api",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  },
};
