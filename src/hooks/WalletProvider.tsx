import { createContext, useContext, type ReactNode } from "react";
import { useWalletInternal } from "./use-wallet";

type WalletCtx = ReturnType<typeof useWalletInternal>;

const WalletContext = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletInternal();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWallet() must be used inside <WalletProvider>. Wrap your app in WalletProvider (see src/routes/__root.tsx).");
  }
  return ctx;
}