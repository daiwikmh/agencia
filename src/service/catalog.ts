import { config } from "../config.js";

export interface ToolParam {
  name: string;
  type: "string" | "number";
  label: string;
  required?: boolean;
  default?: string | number;
  min?: number;
  max?: number;
  placeholder?: string;
  multiline?: boolean;
}

export interface ToolPricing {
  model: string;
  perCallHbar: number;
  per1kTokenHbar?: number;
  perResultHbar?: number;
  perSecondHbar?: number;
  unit: "HBAR";
}

export interface CatalogEntry {
  name: string;
  title: string;
  category: string;
  description: string;
  featured?: boolean;
  params: ToolParam[];
  pricing: ToolPricing;
}

export const CATALOG: CatalogEntry[] = [
  {
    name: "infer",
    title: "LLM inference",
    category: "Inference",
    featured: true,
    description:
      "Run a chat completion on Agencia's hosted model. Priced from max_tokens: perCall + per-1k-token.",
    params: [
      { name: "prompt", type: "string", label: "Prompt", required: true, placeholder: "Ask the model…" },
      { name: "max_tokens", type: "number", label: "Max tokens", default: 256, min: 1, max: 2048 },
      { name: "system", type: "string", label: "System prompt" },
    ],
    pricing: {
      model: "per-call + per-token",
      perCallHbar: config.pricing.perCallHbar,
      per1kTokenHbar: config.pricing.per1kTokenHbar,
      unit: "HBAR",
    },
  },
  {
    name: "infer_openai",
    title: "OpenAI inference",
    category: "Inference",
    description:
      "Run a chat completion on OpenAI. Priced from max_tokens: perCall + per-1k-token.",
    params: [
      { name: "prompt", type: "string", label: "Prompt", required: true, placeholder: "Ask the model…" },
      { name: "max_tokens", type: "number", label: "Max tokens", default: 256, min: 1, max: 2048 },
      { name: "system", type: "string", label: "System prompt" },
    ],
    pricing: {
      model: "per-call + per-token",
      perCallHbar: config.pricing.perCallHbarOpenai,
      per1kTokenHbar: config.pricing.per1kTokenHbarOpenai,
      unit: "HBAR",
    },
  },
  {
    name: "hedera_account",
    title: "Account snapshot",
    category: "Hedera Data",
    description:
      "HBAR balance, HTS token balances, and recent transfers for any Hedera account, read live from the mirror node.",
    params: [
      { name: "accountId", type: "string", label: "Account ID", required: true, placeholder: "0.0.1234" },
    ],
    pricing: { model: "per-query", perCallHbar: 0.01, unit: "HBAR" },
  },
  {
    name: "hedera_token",
    title: "HTS token info",
    category: "Hedera Data",
    description:
      "Supply, treasury, type, and metadata for any HTS token, plus its largest holders.",
    params: [
      { name: "tokenId", type: "string", label: "Token ID", required: true, placeholder: "0.0.1234" },
    ],
    pricing: { model: "per-query", perCallHbar: 0.01, unit: "HBAR" },
  },
  {
    name: "hedera_topic",
    title: "HCS topic reader",
    category: "Hedera Data",
    description:
      "Read the most recent consensus messages from any HCS topic. Priced per message returned.",
    params: [
      { name: "topicId", type: "string", label: "Topic ID", required: true, placeholder: "0.0.1234" },
      { name: "limit", type: "number", label: "Messages", default: 10, min: 1, max: 50 },
    ],
    pricing: { model: "per-call + per-result", perCallHbar: 0.005, perResultHbar: 0.0005, unit: "HBAR" },
  },
  {
    name: "hedera_transaction",
    title: "Transaction lookup",
    category: "Hedera Data",
    description: "Result, fee, and HBAR/token transfers for any Hedera transaction id.",
    params: [
      {
        name: "transactionId",
        type: "string",
        label: "Transaction ID",
        required: true,
        placeholder: "0.0.x-1700000000-000000000",
      },
    ],
    pricing: { model: "per-query", perCallHbar: 0.01, unit: "HBAR" },
  },
  {
    name: "hedera_nft",
    title: "NFT lookup",
    category: "NFTs",
    description: "Owner, metadata and mint time for an NFT serial, or the first serials of a collection.",
    params: [
      { name: "tokenId", type: "string", label: "Token ID", required: true, placeholder: "0.0.1234" },
      { name: "serial", type: "number", label: "Serial (optional)", min: 1 },
    ],
    pricing: { model: "per-query", perCallHbar: 0.01, unit: "HBAR" },
  },
  {
    name: "hedera_network",
    title: "Network stats",
    category: "Hedera Data",
    description: "Released and total HBAR supply plus the live USD exchange rate from consensus.",
    params: [],
    pricing: { model: "flat", perCallHbar: 0.003, unit: "HBAR" },
  },
  {
    name: "hbar_price",
    title: "HBAR price feed",
    category: "Finance",
    description: "Spot HBAR price with 24h change and market cap, from CoinGecko.",
    params: [{ name: "vs", type: "string", label: "Quote currency", default: "usd" }],
    pricing: { model: "flat", perCallHbar: 0.002, unit: "HBAR" },
  },
  {
    name: "crypto_price",
    title: "Crypto price feed",
    category: "Finance",
    description: "Spot price and 24h change for up to 25 coins by CoinGecko id.",
    params: [
      {
        name: "ids",
        type: "string",
        label: "Coin ids (comma-separated)",
        default: "bitcoin,ethereum,hedera-hashgraph",
      },
      { name: "vs", type: "string", label: "Quote currency", default: "usd" },
    ],
    pricing: { model: "flat", perCallHbar: 0.003, unit: "HBAR" },
  },
  {
    name: "web_read",
    title: "Web page reader",
    category: "Web",
    description: "Fetch a URL and return its title and readable text, stripped of markup.",
    params: [
      { name: "url", type: "string", label: "URL", required: true, placeholder: "https://example.com" },
    ],
    pricing: { model: "flat", perCallHbar: 0.01, unit: "HBAR" },
  },
  {
    name: "dns_lookup",
    title: "DNS lookup",
    category: "Web",
    description: "Resolve DNS records for a hostname over Cloudflare DNS-over-HTTPS.",
    params: [
      { name: "name", type: "string", label: "Hostname", required: true, placeholder: "hedera.com" },
      { name: "type", type: "string", label: "Record type", default: "A" },
    ],
    pricing: { model: "flat", perCallHbar: 0.004, unit: "HBAR" },
  },
  {
    name: "graph_query",
    title: "Subgraph query",
    category: "The Graph",
    description:
      "Run a GraphQL query against any subgraph. Pass a full endpoint URL (e.g. a Studio query URL), or a bare subgraph id if GRAPH_API_KEY is configured on the service.",
    params: [
      {
        name: "subgraph",
        type: "string",
        label: "Subgraph URL or ID",
        required: true,
        placeholder: "https://api.studio.thegraph.com/query/.../.../version/latest",
      },
      {
        name: "query",
        type: "string",
        label: "GraphQL query",
        required: true,
        multiline: true,
        placeholder: "{ pools(first: 5) { id } }",
      },
      {
        name: "variables",
        type: "string",
        label: "Variables (JSON, optional)",
        placeholder: "{}",
      },
    ],
    pricing: { model: "per-query", perCallHbar: 0.01, unit: "HBAR" },
  },
  {
    name: "graph_schema",
    title: "Subgraph schema",
    category: "The Graph",
    description:
      "Introspect any subgraph and return its entities and fields — what an agent needs before it can write a correct GraphQL query.",
    params: [
      {
        name: "subgraph",
        type: "string",
        label: "Subgraph URL or ID",
        required: true,
        placeholder: "https://api.studio.thegraph.com/query/.../.../version/latest",
      },
    ],
    pricing: { model: "per-query", perCallHbar: 0.005, unit: "HBAR" },
  },
  {
    name: "graph_ask",
    title: "Ask a subgraph",
    category: "The Graph",
    featured: true,
    description:
      "Ask a subgraph a question in plain English. Introspects the schema, writes the GraphQL, runs it against live Graph data, and answers from the result.",
    params: [
      {
        name: "subgraph",
        type: "string",
        label: "Subgraph URL or ID",
        required: true,
        placeholder: "https://api.studio.thegraph.com/query/.../.../version/latest",
      },
      {
        name: "question",
        type: "string",
        label: "Question",
        required: true,
        multiline: true,
        placeholder: "Which 5 pools have the highest total value locked?",
      },
    ],
    pricing: { model: "per-question (schema + generation + query + answer)", perCallHbar: 0.04, unit: "HBAR" },
  },
  {
    name: "graph_analyze",
    title: "Analyse a subgraph on rented hardware",
    category: "The Graph",
    featured: true,
    description:
      "Ask an analytical question about a subgraph. Pulls live rows from The Graph, rents a sandbox by the second, runs a program written for your question on that box, and explains what it computed.",
    params: [
      {
        name: "subgraph",
        type: "string",
        label: "Subgraph URL or ID",
        required: true,
        placeholder: "5zvR82QoaXYFyDEKLZ9t6v9adgnptxYpKpSbxtgVENFV",
      },
      {
        name: "goal",
        type: "string",
        label: "What should it work out?",
        required: true,
        multiline: true,
        placeholder: "How concentrated is liquidity across the top pools?",
      },
      { name: "seconds", type: "number", label: "Compute seconds", default: 60, min: 20, max: 300 },
    ],
    pricing: {
      model: "per-analysis + per compute-second",
      perCallHbar: 0.06,
      perSecondHbar: 0.0015,
      unit: "HBAR",
    },
  },
  {
    name: "compute_lease",
    title: "Compute lease",
    category: "Compute",
    featured: true,
    description:
      "Rent a sandboxed container by the second and run your agent on it. Priced per CPU-second from the cheapest available provider, settled in HBAR, extended by paying ticks.",
    params: [
      {
        name: "seconds",
        type: "number",
        label: "Seconds",
        default: 60,
        min: 10,
        max: config.compute.maxLeaseSeconds,
      },
      { name: "cpu", type: "number", label: "vCPU", default: 1, min: 1, max: config.compute.maxCpu },
      {
        name: "memMb",
        type: "number",
        label: "Memory (MB)",
        default: 512,
        min: 128,
        max: config.compute.maxMemMb,
      },
      { name: "provider", type: "string", label: "Provider", default: "auto" },
    ],
    pricing: {
      model: "open fee + per-CPU-second",
      perCallHbar: config.compute.openFeeHbar,
      perSecondHbar: config.compute.localRatePerSecondHbar,
      unit: "HBAR",
    },
  },
  {
    name: "compute_tick",
    title: "Compute tick",
    category: "Compute",
    description:
      "Extend a live lease by one metering interval. Each tick is its own x402 settlement and its own HCS receipt — stop ticking and the sandbox is reaped.",
    params: [
      { name: "leaseId", type: "string", label: "Lease ID", required: true, placeholder: "abc123…" },
    ],
    pricing: {
      model: "per-tick",
      perCallHbar: 0,
      perSecondHbar: config.compute.localRatePerSecondHbar,
      unit: "HBAR",
    },
  },
  {
    name: "github_repo",
    title: "GitHub repo stats",
    category: "Dev",
    description: "Stars, forks, open issues, language and license for a public GitHub repository.",
    params: [
      { name: "owner", type: "string", label: "Owner", required: true, placeholder: "hashgraph" },
      { name: "repo", type: "string", label: "Repo", required: true, placeholder: "hedera-sdk-js" },
    ],
    pricing: { model: "flat", perCallHbar: 0.005, unit: "HBAR" },
  },
];

export function catalogEntry(name: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.name === name);
}

export function priceFor(name: string, args: Record<string, unknown>): number {
  const entry = catalogEntry(name);
  if (!entry) return 0;
  const p = entry.pricing;
  let total = p.perCallHbar;
  if (p.per1kTokenHbar != null) {
    total += p.per1kTokenHbar * (Number(args.max_tokens ?? 256) / 1000);
  }
  if (p.perResultHbar != null) {
    total += p.perResultHbar * Number(args.limit ?? 10);
  }
  if (p.perSecondHbar != null) {
    const seconds = Number(args.seconds ?? config.compute.tickSeconds);
    const cpu = Number(args.cpu ?? 1);
    total += p.perSecondHbar * seconds * cpu;
  }
  return total;
}
