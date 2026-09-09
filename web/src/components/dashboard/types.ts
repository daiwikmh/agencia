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

export interface ManifestResource {
  resource: string;
  tool: string;
  asset: string;
  payTo: string;
  memo: string;
  pricing: { model?: string; perCallHbar?: number; per1kTokenHbar?: number };
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

export interface InferOutcome {
  ok: boolean;
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
  prompt: string;
  maxTokens: number;
  at: string;
  status: "running" | "ok" | "error";
  hbar?: number;
  txId?: string;
}

export const TABS = ["overview", "fire", "analytics", "manifest", "audit", "session"] as const;
export type Tab = (typeof TABS)[number];

export const SECTIONS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◆" },
  { id: "fire", label: "Fire request", icon: "⚡" },
  { id: "analytics", label: "Analytics", icon: "▦" },
  { id: "manifest", label: "Service manifest", icon: "≡" },
  { id: "audit", label: "HCS audit trail", icon: "⛓" },
  { id: "session", label: "Session activity", icon: "▤" },
];
