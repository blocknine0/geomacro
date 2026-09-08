import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BridgeSection } from "./bridge-section";
import { SwapSection } from "./swap-section";
import { TxHistorySection } from "./tx-history-section";

/**
 * Circle App Kit, injected-wallet discovery and persisted bridge state are
 * browser-only concerns. Rendering that tree during SSR created an occasional
 * React hydration/Suspense fallback error even though the page recovered.
 *
 * Keep the server and first client render deterministic, then mount the exact
 * existing Bridge/Swap implementation after hydration. No transaction logic,
 * CCTP flow, swap quoting, fees or wallet behaviour changes here.
 */
export function LiquiditySection() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 py-10" aria-label="Bridge and swap loading">
        <div className="mx-auto grid w-full grid-cols-2 rounded-lg border border-border/60 bg-card/30 p-1">
          <div className="rounded-md bg-muted/40 px-4 py-2 text-center text-sm text-muted-foreground">Bridge</div>
          <div className="px-4 py-2 text-center text-sm text-muted-foreground">Swap</div>
        </div>
        <div className="mt-8 space-y-4">
          <div className="h-8 w-56 animate-pulse rounded bg-muted/40" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted/25" />
          <div className="h-64 animate-pulse rounded-2xl border border-border/60 bg-card/25" />
        </div>
      </section>
    );
  }

  return (
    <>
      <Tabs defaultValue="bridge">
        <TabsList className="mx-auto mt-10 grid w-full max-w-3xl grid-cols-2 px-6">
          <TabsTrigger value="bridge">Bridge</TabsTrigger>
          <TabsTrigger value="swap">Swap</TabsTrigger>
        </TabsList>

        <TabsContent value="bridge">
          <BridgeSection />
        </TabsContent>

        <TabsContent value="swap">
          <main className="mx-auto max-w-3xl px-6 py-16">
            <div className="max-w-xl">
              <h1 className="font-mono text-3xl tracking-tight">Swap tokens on Arc</h1>
              <p className="mt-3 text-sm text-muted-foreground">
                Exchange USDC, EURC, and cirBTC directly on Arc Testnet — no bridging required,
                powered by Circle's App Kit.
              </p>
            </div>
            <SwapSection />
          </main>
        </TabsContent>
      </Tabs>

      <TxHistorySection />
    </>
  );
}
