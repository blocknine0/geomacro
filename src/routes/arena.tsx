import { createFileRoute } from "@tanstack/react-router";
import { ArenaSection } from "@/components/sections/arena-section";
import { TechnicalProofBanner } from "@/components/technical-proof-banner";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/WalletProvider";
import { ARC_TESTNET } from "@/lib/arc";
import { isPredictionMarketTestnetChainId } from "@/lib/product-deployment-policy";

export const Route = createFileRoute("/arena")({
  head: () => ({
    meta: [
      { title: "Prediction Markets · Arc Testnet Technical Proof · Geomacro" },
      {
        name: "description",
        content:
          "Permanent Arc Testnet technical proof showing how Geomacro intelligence can connect to prediction-market workflows. This surface is not planned for mainnet or real-money production use.",
      },
      { property: "og:title", content: "Prediction Markets · Arc Testnet Technical Proof · Geomacro" },
      {
        property: "og:description",
        content:
          "A permanent Testnet-only application and feedback layer built on top of Geomacro risk intelligence.",
      },
      { property: "og:url", content: "https://geomacro.live/arena" },
    ],
    links: [{ rel: "canonical", href: "https://geomacro.live/arena" }],
  }),
  component: ArenaTechnicalProofPage,
});

function ArenaTechnicalProofPage() {
  const { chainId, switchToArc } = useWallet();
  const hasKnownWalletChain = chainId !== null;
  const onPredictionMarketTestnet = isPredictionMarketTestnetChainId(chainId);

  return (
    <>
      <TechnicalProofBanner
        title="Prediction Markets · Testnet only"
        description="This surface is permanently locked to Arc Testnet as secondary technical proof. Geomacro is not planning a prediction-market mainnet or real-money launch."
      />

      {hasKnownWalletChain && !onPredictionMarketTestnet ? (
        <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
          <div className="rounded-2xl border border-primary/25 bg-card/50 p-6 sm:p-8">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
              Arc Testnet required
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              Prediction-market transactions are disabled outside Arc Testnet.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              This boundary is permanent. The prediction-market application will remain Testnet technical proof even if other Geomacro products later move to production or mainnet infrastructure.
            </p>
            <Button className="mt-6" onClick={() => void switchToArc(ARC_TESTNET)}>
              Switch wallet to Arc Testnet
            </Button>
          </div>
        </section>
      ) : (
        <ArenaSection />
      )}
    </>
  );
}
