import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ARC_NETWORKS,
  networkByChainId,
  preferredNetwork,
  type ArcNetwork,
} from "@/lib/arc";
import { buildSiweMessage, verifySiwe } from "@/lib/siwe.functions";

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

// ---------------------------------------------------------------------------
// Dedupe guards: multiple components can call useWallet(). Without these,
// every mount fires its own eth_accounts/eth_chainId request at MetaMask
// simultaneously, which trips MetaMask's own rate limiter
// (-32005 "Request limit exceeded"). These module-level promises ensure only
// ONE request is ever in flight at a time, and every caller awaits the same
// promise.
// ---------------------------------------------------------------------------
let accountsRequestInFlight: Promise<string[]> | null = null;
let chainIdRequestInFlight: Promise<string> | null = null;

function getAccountsOnce(eth: EthereumProvider): Promise<string[]> {
  if (!accountsRequestInFlight) {
    accountsRequestInFlight = (eth.request({ method: "eth_accounts" }) as Promise<string[]>).finally(() => {
      accountsRequestInFlight = null;
    });
  }
  return accountsRequestInFlight;
}

function getChainIdOnce(eth: EthereumProvider): Promise<string> {
  if (!chainIdRequestInFlight) {
    chainIdRequestInFlight = (eth.request({ method: "eth_chainId" }) as Promise<string>).finally(() => {
      chainIdRequestInFlight = null;
    });
  }
  return chainIdRequestInFlight;
}

/**
 * Internal hook — do NOT import this directly in components.
 * Use `useWallet` from "@/hooks/wallet-provider" instead, which wraps this
 * in a single shared Context so wallet state (and its MetaMask requests)
 * is only ever created once per app, no matter how many components read it.
 */
export function useWalletInternal() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SiweSession | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const callVerifySiwe = useServerFn(verifySiwe);

  const network: ArcNetwork | null = networkByChainId(chainId);
  const onArc = network !== null;

  // wallet address change হলে সেই address-এর জন্য existing session আছে কিনা দেখো
  useEffect(() => {
    if (!address) {
      setSession(null);
      return;
    }
    setSession(loadSession(address));
  }, [address]);

  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth) return;
    getAccountsOnce(eth)
      .then((accs) => {
        const arr = accs as string[];
        if (arr?.[0]) setAddress(arr[0]);
      })
      .catch(() => {});
    getChainIdOnce(eth)
      .then((c) => setChainId(c as string))
      .catch(() => {});

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
  }, [address]);

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
    signingIn,
    signIn,
    isSignedIn: session !== null,
  };
}
