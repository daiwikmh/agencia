import { config } from "../../config.js";

interface MirrorAccount {
  account?: string;
  balance?: { balance?: number; tokens?: { token_id: string; balance: number }[] };
  memo?: string;
  created_timestamp?: string;
  transactions?: {
    transaction_id: string;
    name: string;
    result: string;
    consensus_timestamp: string;
    transfers?: { account: string; amount: number }[];
  }[];
}

interface MirrorToken {
  token_id?: string;
  name?: string;
  symbol?: string;
  type?: string;
  decimals?: string;
  total_supply?: string;
  max_supply?: string;
  treasury_account_id?: string;
  created_timestamp?: string;
  memo?: string;
}

interface MirrorTokenBalances {
  balances?: { account: string; balance: number }[];
}

interface MirrorTopicMessages {
  messages?: { sequence_number: number; consensus_timestamp: string; message: string }[];
}

async function mget<T>(path: string): Promise<T> {
  const res = await fetch(`${config.mirrorNodeUrl}${path}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`mirror node ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export async function accountSnapshot(accountId: string) {
  const acc = await mget<MirrorAccount>(
    `/api/v1/accounts/${accountId}?limit=5&transactiontype=cryptotransfer&order=desc`,
  );
  return {
    accountId: acc.account ?? accountId,
    balanceHbar: (acc.balance?.balance ?? 0) / 1e8,
    tokens: (acc.balance?.tokens ?? []).map((t) => ({ tokenId: t.token_id, balance: t.balance })),
    memo: acc.memo || null,
    createdTimestamp: acc.created_timestamp ?? null,
    recentTransactions: (acc.transactions ?? []).slice(0, 5).map((tx) => ({
      transactionId: tx.transaction_id,
      name: tx.name,
      result: tx.result,
      consensusTimestamp: tx.consensus_timestamp,
      transfers: tx.transfers ?? [],
    })),
  };
}

export async function tokenInfo(tokenId: string) {
  const token = await mget<MirrorToken>(`/api/v1/tokens/${tokenId}`);
  const balances = await mget<MirrorTokenBalances>(
    `/api/v1/tokens/${tokenId}/balances?order=desc&limit=5`,
  );
  return {
    tokenId: token.token_id ?? tokenId,
    name: token.name ?? null,
    symbol: token.symbol ?? null,
    type: token.type ?? null,
    decimals: token.decimals ?? null,
    totalSupply: token.total_supply ?? null,
    maxSupply: token.max_supply ?? null,
    treasuryAccountId: token.treasury_account_id ?? null,
    createdTimestamp: token.created_timestamp ?? null,
    memo: token.memo || null,
    topHolders: (balances.balances ?? []).map((b) => ({ account: b.account, balance: b.balance })),
  };
}

interface MirrorTransactions {
  transactions?: {
    transaction_id: string;
    name: string;
    result: string;
    consensus_timestamp: string;
    charged_tx_fee?: number;
    transfers?: { account: string; amount: number }[];
    token_transfers?: { token_id: string; account: string; amount: number }[];
  }[];
}

interface MirrorNft {
  serial_number: number;
  account_id: string;
  created_timestamp: string;
  metadata: string;
  deleted: boolean;
}

interface MirrorNfts {
  nfts?: MirrorNft[];
}

interface MirrorSupply {
  released_supply?: string;
  total_supply?: string;
  timestamp?: string;
}

interface MirrorExchangeRate {
  current_rate?: { cent_equivalent: number; hbar_equivalent: number; expiration_time: number };
  next_rate?: { cent_equivalent: number; hbar_equivalent: number };
}

/**
 * Hedera hands out transaction ids as `0.0.x@sec.nanos`, but the mirror node
 * only accepts `0.0.x-sec-nanos`. An agent that pastes back the id from its
 * own payment receipt would otherwise get a 404 it already paid for.
 */
function toMirrorTxId(id: string): string {
  return id.includes("@") ? id.replace("@", "-").replace(/\.(\d+)$/, "-$1") : id;
}

export async function transactionInfo(transactionId: string) {
  const data = await mget<MirrorTransactions>(
    `/api/v1/transactions/${encodeURIComponent(toMirrorTxId(transactionId))}`,
  );
  const tx = data.transactions?.[0];
  if (!tx) throw new Error(`transaction ${transactionId} not found`);
  return {
    transactionId: tx.transaction_id,
    name: tx.name,
    result: tx.result,
    consensusTimestamp: tx.consensus_timestamp,
    chargedFeeHbar: (tx.charged_tx_fee ?? 0) / 1e8,
    transfers: tx.transfers ?? [],
    tokenTransfers: tx.token_transfers ?? [],
  };
}

function shapeNft(n: MirrorNft) {
  return {
    serialNumber: n.serial_number,
    accountId: n.account_id,
    createdTimestamp: n.created_timestamp,
    metadata: n.metadata ? Buffer.from(n.metadata, "base64").toString("utf8") : null,
    deleted: n.deleted,
  };
}

export async function nftInfo(tokenId: string, serial?: number) {
  if (serial != null) {
    const one = await mget<MirrorNft>(`/api/v1/tokens/${tokenId}/nfts/${serial}`);
    return { tokenId, serial, nfts: [shapeNft(one)] };
  }
  const data = await mget<MirrorNfts>(`/api/v1/tokens/${tokenId}/nfts?order=asc&limit=10`);
  return { tokenId, serial: null, nfts: (data.nfts ?? []).map(shapeNft) };
}

export async function networkStats() {
  const [supply, rate] = await Promise.all([
    mget<MirrorSupply>(`/api/v1/network/supply`),
    mget<MirrorExchangeRate>(`/api/v1/network/exchangerate`),
  ]);
  const cr = rate.current_rate;
  const usdPerHbar =
    cr && cr.hbar_equivalent ? cr.cent_equivalent / cr.hbar_equivalent / 100 : null;
  return {
    releasedSupplyHbar: supply.released_supply ? Number(supply.released_supply) / 1e8 : null,
    totalSupplyHbar: supply.total_supply ? Number(supply.total_supply) / 1e8 : null,
    exchangeRateUsd: usdPerHbar,
    rateExpiresAt: cr?.expiration_time ?? null,
    at: supply.timestamp ?? null,
  };
}

export async function topicMessages(topicId: string, limit: number) {
  const clamped = Math.min(50, Math.max(1, Math.floor(limit)));
  const data = await mget<MirrorTopicMessages>(
    `/api/v1/topics/${topicId}/messages?order=desc&limit=${clamped}`,
  );
  const messages = (data.messages ?? []).map((m) => {
    const decoded = Buffer.from(m.message, "base64").toString("utf8");
    let payload: unknown;
    try {
      payload = JSON.parse(decoded);
    } catch {
      payload = decoded;
    }
    return {
      sequenceNumber: m.sequence_number,
      consensusTimestamp: m.consensus_timestamp,
      payload,
    };
  });
  return { topicId, count: messages.length, messages };
}
