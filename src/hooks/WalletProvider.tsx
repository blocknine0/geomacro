import { createContext, useContext, type Context, type ReactNode } from "react";
import { useWalletInternal } from "./use-wallet";

type WalletCtx = ReturnType<typeof useWalletInternal>;

type WalletContextGlobal = typeof globalThis & {
  __GEOMACRO_WALLET_CONTEXT_V1__?: Context<WalletCtx | null>;
};

// Route components can be emitted into separate client chunks. The provider
// and consumers must still resolve to the same React context object even if
// this module is evaluated more than once during a deployment transition.
// Only the context object is global; wallet/session state remains inside the
// React provider tree and is never stored globally.
const walletGlobal = globalThis as WalletContextGlobal;
const WalletContext =
  walletGlobal.__GEOMACRO_WALLET_CONTEXT_V1__ ??
  createContext<WalletCtx | null>(null);

if (!walletGlobal.__GEOMACRO_WALLET_CONTEXT_V1__) {
  walletGlobal.__GEOMACRO_WALLET_CONTEXT_V1__ = WalletContext;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const wallet = useWalletInternal();
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error(
      "useWallet() must be used inside <WalletProvider>. Wrap your app in WalletProvider (see src/routes/__root.tsx).",
    );
  }
  return ctx;
}
