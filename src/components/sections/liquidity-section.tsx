import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BridgeSection } from "./bridge-section";
import { SwapSection } from "./swap-section";
import { TxHistorySection } from "./tx-history-section";

export function LiquiditySection() {
  return (
    <>
      <Tabs defaultValue="bridge">
        <TabsList className="mx-auto mt-10 grid w-full max-w-3xl grid-cols-2 px-6">
          <TabsTrigger value="bridge">Bridge</TabsTrigger>
          <TabsTrigger value="swap">Swap</TabsTrigger>
        </TabsList>

        {/* BridgeSection renders its own <main> with its own heading/copy —
            left completely untouched here, just given a tab home. */}
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

      {/* Shared across both tabs — a bridge and a swap both land here,
          regardless of which tab was active when they happened. */}
      <TxHistorySection />
    </>
  );
}
