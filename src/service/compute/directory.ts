export type ProviderKind = "sandbox" | "container" | "vm" | "gpu-marketplace" | "aggregator";

export interface DirectoryEntry {
  id: string;
  label: string;
  kind: ProviderKind;
  billing: string;
  usdPerVcpuSecond: number | null;
  usdPerGibSecond: number | null;
  gpu: boolean;
  adapter: "native" | "shim";
  docs: string;
  note: string;
}

export const PROVIDER_DIRECTORY: DirectoryEntry[] = [
  {
    id: "e2b",
    label: "E2B",
    kind: "sandbox",
    billing: "per-second, charged while the sandbox is alive",
    usdPerVcpuSecond: 0.0504 / 3600,
    usdPerGibSecond: 0.0162 / 3600,
    gpu: false,
    adapter: "shim",
    docs: "https://e2b.dev/docs",
    note: "Firecracker microVMs, ~150ms cold start. Node/Python SDK — needs the shim to expose /sandboxes.",
  },
  {
    id: "daytona",
    label: "Daytona",
    kind: "sandbox",
    billing: "per-second, charged while the sandbox is alive",
    usdPerVcpuSecond: 0.0504 / 3600,
    usdPerGibSecond: 0.0162 / 3600,
    gpu: false,
    adapter: "shim",
    docs: "https://www.daytona.io/docs",
    note: "Fastest cold start of the sandbox tier at roughly 90ms.",
  },
  {
    id: "modal",
    label: "Modal",
    kind: "sandbox",
    billing: "per-second of active CPU, idle drops to zero",
    usdPerVcpuSecond: 0.00003942,
    usdPerGibSecond: null,
    gpu: true,
    adapter: "shim",
    docs: "https://modal.com/docs/guide/sandbox",
    note: "Only sandbox tier where the box can hold a GPU — the option if the rented agent runs its own model.",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Containers / Sandbox",
    kind: "container",
    billing: "per-second, CPU charged on active usage",
    usdPerVcpuSecond: 0.00002,
    usdPerGibSecond: 0.0000025,
    gpu: false,
    adapter: "shim",
    docs: "https://developers.cloudflare.com/sandbox/",
    note: "Runs inside a Worker, so the shim is a Worker that fronts @cloudflare/sandbox.",
  },
  {
    id: "vercel",
    label: "Vercel Sandbox",
    kind: "sandbox",
    billing: "active CPU time, memory billed on provisioned resources",
    usdPerVcpuSecond: null,
    usdPerGibSecond: null,
    gpu: false,
    adapter: "shim",
    docs: "https://vercel.com/docs/vercel-sandbox",
    note: "Free tier of 5 CPU-hours and 420 GB-hours makes it a cheap fallback lane.",
  },
  {
    id: "fly",
    label: "Fly.io Machines",
    kind: "vm",
    billing: "per-second while the machine is running",
    usdPerVcpuSecond: null,
    usdPerGibSecond: null,
    gpu: true,
    adapter: "shim",
    docs: "https://fly.io/docs/machines/api/",
    note: "Plain REST Machines API — the closest match to the remote driver contract with the least shim code.",
  },
  {
    id: "shadeform",
    label: "Shadeform",
    kind: "aggregator",
    billing: "per-minute increments, routed to the cheapest underlying cloud",
    usdPerVcpuSecond: null,
    usdPerGibSecond: null,
    gpu: true,
    adapter: "shim",
    docs: "https://docs.shadeform.ai/",
    note: "GPU aggregator over 20+ clouds behind one API — an aggregator inside our aggregator.",
  },
  {
    id: "primeintellect",
    label: "Prime Intellect",
    kind: "aggregator",
    billing: "per-second or per-hour depending on instance",
    usdPerVcpuSecond: null,
    usdPerGibSecond: null,
    gpu: true,
    adapter: "shim",
    docs: "https://docs.primeintellect.ai/",
    note: "Aggregated H100/A100 clusters, aimed at distributed training rather than short leases.",
  },
  {
    id: "vast",
    label: "Vast.ai",
    kind: "gpu-marketplace",
    billing: "per-hour bid market on consumer cards",
    usdPerVcpuSecond: null,
    usdPerGibSecond: null,
    gpu: true,
    adapter: "shim",
    docs: "https://docs.vast.ai/api-reference",
    note: "Sets the price floor with spot consumer GPUs; availability is the tradeoff.",
  },
  {
    id: "akash",
    label: "Akash Network",
    kind: "gpu-marketplace",
    billing: "reverse-auction leases settled on-chain",
    usdPerVcpuSecond: null,
    usdPerGibSecond: null,
    gpu: true,
    adapter: "shim",
    docs: "https://akash.network/docs/",
    note: "Crypto-native lease model that mirrors ours — we resell an on-chain lease over x402 on Hedera.",
  },
  {
    id: "nosana",
    label: "Nosana",
    kind: "gpu-marketplace",
    billing: "per-job, settled by Solana programs",
    usdPerVcpuSecond: null,
    usdPerGibSecond: null,
    gpu: true,
    adapter: "shim",
    docs: "https://docs.nosana.io/",
    note: "Containerised jobs matched and settled on Solana — cross-chain settlement story.",
  },
  {
    id: "ionet",
    label: "io.net",
    kind: "gpu-marketplace",
    billing: "per-hour DePIN GPU rental",
    usdPerVcpuSecond: null,
    usdPerGibSecond: null,
    gpu: true,
    adapter: "shim",
    docs: "https://docs.io.net/",
    note: "Large registered fleet, much smaller verified fleet — treat capacity claims with care.",
  },
];

export function directoryEntry(id: string): DirectoryEntry | undefined {
  return PROVIDER_DIRECTORY.find((p) => p.id === id);
}

export function usdPerSecond(entry: DirectoryEntry, cpu: number, memMb: number): number | null {
  if (entry.usdPerVcpuSecond == null) return null;
  const mem = entry.usdPerGibSecond == null ? 0 : entry.usdPerGibSecond * (memMb / 1024);
  return entry.usdPerVcpuSecond * cpu + mem;
}
