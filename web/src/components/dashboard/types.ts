export interface HealthResp {
  reachable: boolean;
  serviceUrl: string;
  health?: {
    service?: string;
    network?: string;
    facilitator?: string;
    payTo?: string | null;
    hcsTopicId?: string | null;
  };
  error?: string;
}

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

export interface ManifestResource {
  resource: string;
  tool: string;
  title?: string;
  category?: string;
  description?: string;
  featured?: boolean;
  params?: ToolParam[];
  asset: string;
  payTo: string;
  memo?: string;
  pricing: {
    model?: string;
    perCallHbar?: number;
    per1kTokenHbar?: number;
    perResultHbar?: number;
    unit?: string;
  };
}

export interface Manifest {
  service: string;
  description: string;
  network: string;
  facilitator: string;
  mcp: { url: string };
  resources: ManifestResource[];
  audit: { type: string; topicId: string; mirror: string } | null;
}

export interface ManifestResp {
  ok: boolean;
  manifest?: Manifest;
  error?: string;
}

export interface WalletResp {
  ok: boolean;
  accountId?: string;
  balanceHbar?: number;
  tokens?: { token_id: string; balance: number }[];
  createdTimestamp?: string | null;
  budgetHbar?: number;
  network?: string;
  error?: string;
}

export interface HcsMessage {
  consensus_timestamp: string;
  sequence_number: number;
  payload: unknown;
}

export interface AuditResp {
  ok: boolean;
  topicId: string | null;
  messages: HcsMessage[];
  error?: string;
}

export interface CallOutcome {
  ok: boolean;
  tool?: string;
  text?: string;
  usage?: { prompt: number; completion: number; total: number };
  payment?: {
    quotedHbar: number;
    transaction: string;
    hashscan: string;
    payer: string;
    network: string;
    hcs: { topicId: string; sequenceNumber: string } | null;
  };
  error?: string;
  steps: string[];
}

export interface SessionCall {
  id: string;
  tool: string;
  summary: string;
  at: string;
  status: "running" | "ok" | "error";
  hbar?: number;
  txId?: string;
}

export const TABS = [
  "catalog",
  "connect",
  "live",
  "playground",
  "graph",
  "wallet",
  "budgets",
  "usage",
  "audit",
] as const;
export type Tab = (typeof TABS)[number];

export const SECTIONS: { id: Tab; label: string; icon: string; blurb: string }[] = [
  {
    id: "catalog",
    label: "Catalog",
    icon: "▦",
    blurb: "Browse every service priced behind x402 and pay per call in HBAR",
  },
  {
    id: "connect",
    label: "Connect",
    icon: "⇱",
    blurb: "Everything an agent needs to start buying: a funded wallet, the endpoint, and a client",
  },
  {
    id: "live",
    label: "Live run",
    icon: "◉",
    blurb: "Watch an agent discover the service, get quoted, pay and settle — step by step",
  },
  {
    id: "playground",
    label: "Playground",
    icon: "▷",
    blurb: "Compose a call by hand, inspect the quote, then settle it on Hedera",
  },
  {
    id: "graph",
    label: "The Graph",
    icon: "◎",
    blurb: "Query subgraph data through the same metered payment rail",
  },
  {
    id: "wallet",
    label: "Wallet",
    icon: "◈",
    blurb: "Track the agent account balance, tokens and what this session has spent",
  },
  {
    id: "budgets",
    label: "Budgets",
    icon: "⛨",
    blurb: "Cap what the agent may spend per call and across the session",
  },
  {
    id: "usage",
    label: "Usage",
    icon: "▤",
    blurb: "See revenue settled on-chain, broken down by tool, category and payer",
  },
  {
    id: "audit",
    label: "HCS audit trail",
    icon: "⛓",
    blurb: "Every settled payment, receipted to a Hedera consensus topic",
  },
];

export const CATEGORY_ICON: Record<string, string> = {
  Inference: "⚡",
  "Hedera Data": "⛓",
  NFTs: "◈",
  Finance: "₿",
  Web: "⬡",
  Dev: "⌥",
  "The Graph": "◎",
  Compute: "▣",
};

export const CATEGORY_COLOR: Record<string, string> = {
  Inference: "#3987e5",
  "Hedera Data": "#d95926",
  NFTs: "#199e70",
  Finance: "#c98500",
  Web: "#d55181",
  Dev: "#008300",
  "The Graph": "#9085e9",
  Compute: "#2f6f5e",
};
export const CATEGORY_COLOR_FALLBACK = "#8A8A95";
