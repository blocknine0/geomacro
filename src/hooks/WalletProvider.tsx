import { createContext, useContext, type ReactNode } from "react";
import { useWalletInternal } from "./use-wallet";

type WalletContextValue = ReturnType<typeof useWalletInternal>;

const WalletContext = createContext<WalletContextValue | null>(null);

/**
 * Wrap the app ONCE (in __root.tsx) with this provider. It calls
 * useWalletInternal a single time, so wallet address/session state — and
 * the underlying eth_accounts/eth_chainId requests to MetaMask — are
 * created exactly once no matter how many components read wallet state.
 *
 * Do NOT wrap individual pages or components with this — one wrap at the
 * root is correct; multiple wraps recreate the bug this fixes.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletInternal();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

/**
 * Drop-in replacement for the old `useWallet` import. Reads the single
 * shared wallet state from context instead of creating a new instance.
 */
export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within <WalletProvider>. Wrap your app root with <WalletProvider> in __root.tsx.");
  }
  return ctx;
}
