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
  "playground",
  "graph",
  "wallet",
  "budgets",
  "usage",
  "audit",
] as const;
export type Tab = (typeof TABS)[number];

export const SECTIONS: { id: Tab; label: string; icon: string }[] = [
  { id: "catalog", label: "Catalog", icon: "▦" },
  { id: "playground", label: "Playground", icon: "▷" },
  { id: "graph", label: "The Graph", icon: "◎" },
  { id: "wallet", label: "Wallet", icon: "◈" },
  { id: "budgets", label: "Budgets", icon: "⛨" },
  { id: "usage", label: "Usage", icon: "▤" },
  { id: "audit", label: "HCS audit trail", icon: "⛓" },
];

export const CATEGORY_ICON: Record<string, string> = {
  Inference: "⚡",
  "Hedera Data": "⛓",
  NFTs: "◈",
  Finance: "₿",
  Web: "⬡",
  Dev: "⌥",
  "The Graph": "◎",
};

export const CATEGORY_COLOR: Record<string, string> = {
  Inference: "#3987e5",
  "Hedera Data": "#d95926",
  NFTs: "#199e70",
  Finance: "#c98500",
  Web: "#d55181",
  Dev: "#008300",
  "The Graph": "#9085e9",
};
export const CATEGORY_COLOR_FALLBACK = "#8A8A95";
