import { useCallback, useEffect, useState } from "react";
import {
  ARC_NETWORKS,
  networkByChainId,
  preferredNetwork,
  type ArcNetwork,
} from "@/lib/arc";

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

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const network: ArcNetwork | null = networkByChainId(chainId);
  const onArc = network !== null;

  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : undefined;
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((accs) => {
      const arr = accs as string[];
      if (arr?.[0]) setAddress(arr[0]);
    }).catch(() => {});
    eth.request({ method: "eth_chainId" }).then((c) => setChainId(c as string)).catch(() => {});

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
    setAddress(null);
  }, []);

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
  };
}