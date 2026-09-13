import { useCallback, useEffect, useRef, useState } from "react";

/**
 * MetaMask as the dashboard's identity layer.
 *
 * It authenticates who is using the console and binds work to a real Hedera
 * account — it does NOT sign payments. x402 needs a partially-signed native
 * TransferTransaction, and MetaMask cannot produce one: personal_sign and
 * eth_signTypedData_v4 both apply the Ethereum message prefix, and eth_sign
 * was removed in 2024. Paid calls stay on the MCP path, where the caller's
 * own Hedera key signs.
 *
 * The connected EVM address maps to a Hedera account id through the mirror
 * node, which is what makes this identity meaningful on-chain.
 */

const CHAIN_ID_HEX = "0x128";
const MIRROR = "https://testnet.mirrornode.hedera.com";
const STORAGE_KEY = "agencia.metamask.autoconnect";

const HEDERA_TESTNET = {
  chainId: CHAIN_ID_HEX,
  chainName: "Hedera Testnet",
  nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
  rpcUrls: ["https://testnet.hashio.io/api"],
  blockExplorerUrls: ["https://hashscan.io/testnet"],
};

type Provider = {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on(event: string, handler: (payload: never) => void): void;
  removeListener(event: string, handler: (payload: never) => void): void;
};

export type IdentityState = "idle" | "resolving" | "found" | "inactive" | "error";

export interface HederaIdentity {
  state: IdentityState;
  accountId: string | null;
  balanceHbar: number | null;
  evmAddress: string | null;
}

const IDLE: HederaIdentity = {
  state: "idle",
  accountId: null,
  balanceHbar: null,
  evmAddress: null,
};

async function resolveIdentity(address: string): Promise<HederaIdentity> {
  const res = await fetch(`${MIRROR}/api/v1/accounts/${address}`);
  if (res.status === 404) {
    return { state: "inactive", accountId: null, balanceHbar: null, evmAddress: address };
  }
  if (!res.ok) throw new Error(`mirror node ${res.status}`);
  const data = (await res.json()) as {
    account?: string;
    balance?: { balance?: number };
  };
  return {
    state: "found",
    accountId: data.account ?? null,
    balanceHbar: (data.balance?.balance ?? 0) / 1e8,
    evmAddress: address,
  };
}

export function useMetaMask() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identity, setIdentity] = useState<HederaIdentity>(IDLE);
  const providerRef = useRef<Provider | null>(null);

  const ensureProvider = useCallback(async (): Promise<Provider> => {
    if (providerRef.current) return providerRef.current;
    const { MetaMaskSDK } = await import("@metamask/sdk");
    const sdk = new MetaMaskSDK({
      dappMetadata: { name: "Agencia", url: window.location.origin },
      checkInstallationImmediately: false,
    });
    await sdk.init();
    const provider = sdk.getProvider() as Provider | undefined;
    if (!provider) throw new Error("MetaMask is not available in this browser");
    providerRef.current = provider;
    return provider;
  }, []);

  const ensureChain = useCallback(async (provider: Provider) => {
    const current = (await provider.request({ method: "eth_chainId" })) as string;
    if (current === CHAIN_ID_HEX) return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code !== 4902 && code !== -32603) throw err;
      await provider.request({ method: "wallet_addEthereumChain", params: [HEDERA_TESTNET] });
    }
  }, []);

  const adopt = useCallback(async (next: string | null) => {
    setAddress(next);
    if (!next) {
      setIdentity(IDLE);
      return;
    }
    setIdentity({ ...IDLE, state: "resolving", evmAddress: next });
    try {
      setIdentity(await resolveIdentity(next));
    } catch (err) {
      setIdentity({ ...IDLE, state: "error", evmAddress: next });
      setError(String(err instanceof Error ? err.message : err));
    }
  }, []);

  const connect = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const provider = await ensureProvider();
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      await ensureChain(provider);
      setChainId((await provider.request({ method: "eth_chainId" })) as string);
      window.localStorage.setItem(STORAGE_KEY, "1");
      await adopt(accounts[0] ?? null);
    } catch (err) {
      const code = (err as { code?: number }).code;
      setError(code === 4001 ? "Connection rejected in MetaMask" : String(err instanceof Error ? err.message : err));
    } finally {
      setConnecting(false);
    }
  }, [adopt, connecting, ensureChain, ensureProvider]);

  const disconnect = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setAddress(null);
    setChainId(null);
    setError(null);
    setIdentity(IDLE);
  }, []);

  const refreshIdentity = useCallback(async () => {
    if (address) await adopt(address);
  }, [address, adopt]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY) !== "1") return;
    let cancelled = false;
    void (async () => {
      try {
        const provider = await ensureProvider();
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (cancelled || !accounts.length) return;
        setChainId((await provider.request({ method: "eth_chainId" })) as string);
        await adopt(accounts[0]);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adopt, ensureProvider]);

  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || !address) return;
    const onAccounts = (accounts: string[]) => {
      if (!accounts.length) disconnect();
      else void adopt(accounts[0]);
    };
    const onChain = (next: string) => setChainId(next);
    provider.on("accountsChanged", onAccounts as never);
    provider.on("chainChanged", onChain as never);
    return () => {
      provider.removeListener("accountsChanged", onAccounts as never);
      provider.removeListener("chainChanged", onChain as never);
    };
  }, [address, adopt, disconnect]);

  return {
    address,
    chainId,
    connecting,
    error,
    identity,
    connected: !!address,
    wrongChain: !!address && chainId !== null && chainId !== CHAIN_ID_HEX,
    connect,
    disconnect,
    refreshIdentity,
  };
}
