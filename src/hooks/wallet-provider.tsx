import { createContext, useContext, type ReactNode } from "react";
import { useWalletInternal } from "./use-wallet";

type WalletContextValue = ReturnType<typeof useWalletInternal>;

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletInternal();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet must be used within <WalletProvider>. Wrap your app root with <WalletProvider> in __root.tsx.");
  }
  return ctx;
}
