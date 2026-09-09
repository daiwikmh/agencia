function env(key: string, fallback = ""): string {
  const fromProcess = typeof process !== "undefined" ? process.env[key] : undefined;
  const fromMeta = (import.meta.env as Record<string, string | undefined>)[key];
  return fromProcess ?? fromMeta ?? fallback;
}

export const serverConfig = {
  serviceUrl: env("AGENCIA_SERVICE_URL", "http://localhost:3022"),
  network: env("HEDERA_NETWORK", "hedera-testnet"),
  mirrorNodeUrl: env("HEDERA_MIRROR_NODE_URL", "https://testnet.mirrornode.hedera.com"),
  hashscanBase: env("HASHSCAN_BASE", "https://hashscan.io/testnet"),
  agent: {
    accountId: env("AGENT_ACCOUNT_ID"),
    privateKey: env("AGENT_PRIVATE_KEY"),
    budgetHbar: Number(env("AGENT_BUDGET_HBAR", "5")),
  },
};

export const TINYBAR_PER_HBAR = 100_000_000;

export function tinybarToHbar(tinybar: bigint | string | number): number {
  return Number(BigInt(tinybar)) / TINYBAR_PER_HBAR;
}
