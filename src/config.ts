type EnvRecord = Record<string, string | undefined>;

let envSource: EnvRecord =
  typeof process !== "undefined" && process.env ? (process.env as EnvRecord) : {};

export function configureEnv(next: EnvRecord): void {
  envSource = { ...envSource, ...next };
  rebuild();
}

function env(key: string): string | undefined {
  return envSource[key];
}

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
  const ids = (env("COMPUTE_PROVIDERS") ?? "local")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s && s !== "local");

  return ids.flatMap((id) => {
    const key = id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const baseUrl = env(`COMPUTE_${key}_URL`);
    if (!baseUrl) return [];
    return [
      {
        id,
        label: env(`COMPUTE_${key}_LABEL`) ?? id,
        baseUrl,
        token: env(`COMPUTE_${key}_TOKEN`) ?? "",
        ratePerSecondHbar: Number(env(`COMPUTE_${key}_RATE`) ?? 0.002),
        region: env(`COMPUTE_${key}_REGION`),
      },
    ];
  });
}

function buildConfig() {
  return {
  network: (env("HEDERA_NETWORK") ?? "hedera:testnet") as Network,
  mirrorNodeUrl: env("HEDERA_MIRROR_NODE_URL") ?? "https://testnet.mirrornode.hedera.com",
  facilitatorUrl: env("BLOCKY402_URL") ?? "https://api.testnet.blocky402.com",
  service: {
    operatorId: env("AGENCIA_OPERATOR_ID") ?? "",
    operatorKey: env("AGENCIA_OPERATOR_KEY") ?? "",
    payTo: env("AGENCIA_PAY_TO") || env("AGENCIA_OPERATOR_ID") || "",
    port: Number(env("PORT") ?? 3022),
    hcsTopicId: env("AGENCIA_HCS_TOPIC_ID") ?? "",
  },
  pricing: {
    perCallHbar: Number(env("PRICE_PER_CALL_HBAR") ?? 0.05),
    per1kTokenHbar: Number(env("PRICE_PER_1K_TOKEN_HBAR") ?? 0.02),
    perCallHbarOpenai: Number(env("PRICE_PER_CALL_HBAR_OPENAI") ?? 0.03),
    per1kTokenHbarOpenai: Number(env("PRICE_PER_1K_TOKEN_HBAR_OPENAI") ?? 0.015),
  },
  compute: {
    providers: (env("COMPUTE_PROVIDERS") ?? "local")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    remotes: remoteComputeProviders(),
    image: env("COMPUTE_IMAGE") ?? "node:22-alpine",
    network: env("COMPUTE_NETWORK") ?? "bridge",
    region: env("COMPUTE_REGION") ?? "local",
    localRatePerSecondHbar: Number(env("COMPUTE_RATE_PER_SECOND_HBAR") ?? 0.0015),
    openFeeHbar: Number(env("COMPUTE_OPEN_FEE_HBAR") ?? 0.01),
    tickSeconds: Number(env("COMPUTE_TICK_SECONDS") ?? 10),
    maxLeaseSeconds: Number(env("COMPUTE_MAX_LEASE_SECONDS") ?? 900),
    maxCpu: Number(env("COMPUTE_MAX_CPU") ?? 2),
    maxMemMb: Number(env("COMPUTE_MAX_MEM_MB") ?? 1024),
    execTimeoutMs: Number(env("COMPUTE_EXEC_TIMEOUT_MS") ?? 60_000),
    graceSeconds: Number(env("COMPUTE_GRACE_SECONDS") ?? 5),
    hbarUsd: Number(env("HBAR_USD") ?? 0),
    adminToken: env("COMPUTE_ADMIN_TOKEN") ?? "",
    supplierStore: env("COMPUTE_SUPPLIER_STORE") ?? "data/suppliers.json",
    leaseStore: env("COMPUTE_LEASE_STORE") ?? "data/leases.json",
    identityStore: env("IDENTITY_STORE") ?? "data/identities.json",
    originUrl: env("COMPUTE_ORIGIN_URL") ?? "",
    originToken: env("COMPUTE_ORIGIN_TOKEN") ?? "",
    supplierSharePct: Number(env("COMPUTE_SUPPLIER_SHARE_PCT") ?? 70),
    autoApprove: env("COMPUTE_AUTO_APPROVE") === "true",
  },
  registry: {
    topicId: env("AGENCIA_REGISTRY_TOPIC_ID") ?? "",
    announceOnBoot: env("AGENCIA_ANNOUNCE") !== "false",
  },
  onboard: {
    enabled: env("ONBOARD_ENABLED") !== "false",
    fundHbar: Number(env("ONBOARD_FUND_HBAR") ?? 5),
    maxPerHour: Number(env("ONBOARD_MAX_PER_HOUR") ?? 20),
  },
  agent: {
    accountId: env("AGENT_ACCOUNT_ID") ?? "",
    privateKey: env("AGENT_PRIVATE_KEY") ?? "",
    budgetHbar: Number(env("AGENT_BUDGET_HBAR") ?? 5),
    maxPaymentHbar: Number(env("AGENT_MAX_PAYMENT_HBAR") ?? 2),
    serviceUrl: env("AGENCIA_SERVICE_URL") ?? "http://localhost:3022",
    identityTopicId: env("AGENT_IDENTITY_TOPIC_ID") ?? "",
  },
  nim: {
    baseUrl: env("NVIDIA_BASE_URL") ?? "https://integrate.api.nvidia.com/v1",
    apiKey: env("NVIDIA_API_KEY") ?? "",
    model: env("NIM_MODEL") ?? "openai/gpt-oss-20b",
  },
  graph: {
    apiKey: env("GRAPH_API_KEY") ?? "",
    gatewayBase: env("GRAPH_GATEWAY_BASE") ?? "https://gateway.thegraph.com/api",
  },
  openai: {
    apiKey: env("OPENAI_API_KEY") ?? "",
    baseUrl: env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1",
    model: env("OPENAI_MODEL") ?? "gpt-4o-mini",
  },
  };
}

export const config = buildConfig();

function rebuild(): void {
  Object.assign(config, buildConfig());
}
