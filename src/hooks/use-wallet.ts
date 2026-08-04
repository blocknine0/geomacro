import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ARC_NETWORKS,
  networkByChainId,
  preferredNetwork,
  type ArcNetwork,
} from "@/lib/arc";
import { buildSiweMessage, verifySiwe } from "@/lib/siwe.functions";
import { fetchNativeBalance } from "@/lib/balance";

const SESSION_KEY = (addr: string) => `geomacro.siwe-session.${addr.toLowerCase()}`;

type SiweSession = { token: string; walletAddress: string; expiresAt: number };

function loadSession(addr: string): SiweSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY(addr));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SiweSession;
    if (parsed.expiresAt < Date.now()) {
      localStorage.removeItem(SESSION_KEY(addr));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

let accountsRequestInFlight: Promise<string[]> | null = null;
let chainIdRequestInFlight: Promise<string> | null = null;

function getAccountsOnce(eth: EthereumProvider): Promise<string[]> {
  if (!accountsRequestInFlight) {
    accountsRequestInFlight = eth
      .request({ method: "eth_accounts" })
      .then((r) => (r as string[]) ?? [])
      .finally(() => {
        accountsRequestInFlight = null;
      });
  }
  return accountsRequestInFlight;
}

function getChainIdOnce(eth: EthereumProvider): Promise<string> {
  if (!chainIdRequestInFlight) {
    chainIdRequestInFlight = eth
      .request({ method: "eth_chainId" })
      .then((r) => r as string)
      .finally(() => {
        chainIdRequestInFlight = null;
      });
  }
  return chainIdRequestInFlight;
}

export function useWalletInternal() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SiweSession | null>(null);
  // false until the persisted SIWE session for the current address has been
  // read from localStorage. Callers must never trigger a fresh SIWE prompt
  // while this is false — that race is what caused repeated sign-in popups.
  const [sessionReady, setSessionReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const callVerifySiwe = useServerFn(verifySiwe);

  // ---- shared native USDC balance (single fetch for the whole app) ----
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const balanceKeyRef = useRef<string | null>(null);
  const balanceInFlight = useRef(false);

  const network: ArcNetwork | null = networkByChainId(chainId);
  const onArc = network !== null;

  // wallet address change হলে সেই address-এর জন্য existing session আছে কিনা দেখো
  useEffect(() => {
    if (!address) {
      setSession(null);
      setSessionReady(true);
      return;
    }
    setSessionReady(false);
    setSession(loadSession(address));
    setSessionReady(true);
  }, [address]);

  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth) return;
    getAccountsOnce(eth).then((arr) => {
      if (arr?.[0]) setAddress(arr[0]);
    }).catch(() => {});
    getChainIdOnce(eth).then((c) => setChainId(c)).catch(() => {});

    const onAccounts = (...args: unknown[]) => {
      const accs = args[0] as string[];
      setAddress(accs?.[0] ?? null);
    };
    const onChain = (...args: unknown[]) => setChainId(args[0] as string);
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    const eth = window.ethereum;
    if (!eth) {
      setError("No EVM wallet detected. Install MetaMask to continue.");
      return;
    }
    setConnecting(true);
    try {
      const accs = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accs[0] ?? null);
      const c = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(c);
    } catch (e) {
      setError((e as Error).message ?? "Connection rejected");
    } finally {
      setConnecting(false);
    }
  }, []);

  const switchToArc = useCallback(async (target?: ArcNetwork) => {
    setError(null);
    const eth = window.ethereum;
    if (!eth) return;
    const net = target ?? preferredNetwork();
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: net.chainIdHex }],
      });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 4902 || code === -32603) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: net.chainIdHex,
                chainName: net.chainName,
                rpcUrls: [net.rpcUrl],
                nativeCurrency: net.currency,
                blockExplorerUrls: [net.explorer],
              },
            ],
          });
        } catch (e2) {
          setError((e2 as Error).message);
        }
      } else {
        setError((err as Error).message);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    if (address) localStorage.removeItem(SESSION_KEY(address));
    setSession(null);
    setAddress(null);
    setBalance(null);
    balanceKeyRef.current = null;
  }, [address]);

  /**
   * Fetch the native USDC balance once for the whole app. Results are cached
   * in context state keyed by address+network, so re-renders never refetch;
   * only a wallet/network change, window focus, or an explicit call re-reads.
   */
  const refreshBalance = useCallback(async (force = false) => {
    const net = network ?? preferredNetwork();
    if (!address) return;
    const key = `${net.key}:${address.toLowerCase()}`;
    if (balanceInFlight.current) return;
    if (!force && balanceKeyRef.current === key && balance !== null) return;
    balanceInFlight.current = true;
    setBalanceLoading(true);
    try {
      const bal = await fetchNativeBalance(net, address);
      balanceKeyRef.current = key;
      setBalance(bal ? bal.formatted : null);
    } finally {
      balanceInFlight.current = false;
      setBalanceLoading(false);
    }
  }, [address, network, balance]);

  // (Re)load the balance on wallet/network change and on window focus only.
  useEffect(() => {
    if (!address) {
      setBalance(null);
      balanceKeyRef.current = null;
      return;
    }
    void refreshBalance(true);
    const onFocus = () => void refreshBalance(true);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, network?.key]);

  /**
   * Sign-In With Ethereum: asks the wallet to sign a plain message (gasless,
   * no tx) proving control of `address`, then exchanges that signature for a
   * short-lived JWT the app uses for all positions/balance-history writes.
   * Private key never leaves the wallet extension at any point.
   */
  const signIn = useCallback(async () => {
    setError(null);
    const eth = window.ethereum;
    if (!eth || !address) {
      setError("Connect a wallet first");
      return null;
    }
    setSigningIn(true);
    try {
      const issuedAt = Date.now();
      const message = buildSiweMessage(address, issuedAt);
      const signature = (await eth.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;

      const result = await callVerifySiwe({ data: { address, issuedAt, signature } });
      const newSession: SiweSession = {
        token: result.token,
        walletAddress: result.walletAddress,
        expiresAt: Date.now() + 23 * 60 * 60 * 1000, // JWT itself expires at 24h; refresh a bit early
      };
      localStorage.setItem(SESSION_KEY(address), JSON.stringify(newSession));
      setSession(newSession);
      return newSession;
    } catch (e) {
      setError((e as Error).message ?? "Sign-in failed");
      return null;
    } finally {
      setSigningIn(false);
    }
  }, [address, callVerifySiwe]);

  return {
    address,
    chainId,
    onArc,
    network,
    networks: ARC_NETWORKS,
    connecting,
    error,
    connect,
    switchToArc,
    disconnect,
    // SIWE session — positions/wallet_balance_history writes require this
    session,
    sessionReady,
    signingIn,
    signIn,
    isSignedIn: session !== null,
    // shared balance
    balance,
    balanceLoading,
    refreshBalance,
  };
}